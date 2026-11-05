// Rebuilds the estate from its events. Nothing is stored except what happened.

import { planEstate } from "@/lib/engine/plan";
import { windowCloses } from "@/lib/engine/rules-fl";
import type { Claim, EstateFacts, EstatePlan } from "@/lib/engine/types";
import { START_DATE, claims as seedClaims, estate as seedEstate } from "@/fixtures/scenario";
import type { LedgerEvent } from "./store";

/**
 * Observed in the sandbox on 5 Nov 2026: $0.25 per payout to a US account, and $20.00 on a $2,000 payout to Ireland.
 * Held back in full so the last payments can't overdraw the estate.
 */
export const PAYOUT_FEE_CENTS = 25;
export const CROSS_BORDER_FEE_RESERVE_CENTS = 2_000;

export type Target = { kind: "heir"; id: string } | { kind: "claim"; id: string };

export interface PaymentRecord {
  ledgerId: string;
  target: Target;
  payee: string;
  amountCents: number;
  /** requested -> sent -> paid, or failed. */
  status: "requested" | "sent" | "paid" | "failed";
  batchId?: string;
  transactionId?: string;
  paypalStatus?: string;
  feeCents: number;
  auto: boolean;
  /** Fixed for this approval. PayPal refuses a second batch with the same ID, so asking again can't pay twice. */
  senderBatchId?: string;
  receiver?: string;
  /** The call to PayPal got no clear answer. The money stays counted as gone until PayPal's record settles it. */
  unconfirmed?: boolean;
  failure?: string;
  simulated?: boolean;
}

export interface OrderRecord {
  orderId: string;
  status: "created" | "captured" | "cancelled" | "capture_failed";
  grossCents: number;
  netCents?: number;
  feeCents?: number;
  captureId?: string;
  failure?: string;
  simulated?: boolean;
}

export interface EstateState {
  asOf: string;
  simulatedDate: boolean;
  facts: EstateFacts;
  claims: Claim[];
  plan: EstatePlan;
  /** Set aside for transfer fees on the final payments. Shown as part of cash, and as held back. */
  feeReserveCents: number;
  payments: PaymentRecord[];
  orders: OrderRecord[];
  events: LedgerEvent[];
  carSold: boolean;
}

export function buildState(events: LedgerEvent[]): EstateState {
  let asOf = START_DATE;
  let simulatedDate = false;
  let claims: Claim[] = seedClaims.map((c) => ({ ...c }));
  let cash = seedEstate.cashCents;
  let otherAssets = [...seedEstate.otherAssets];
  const distributed: Record<string, number> = {};
  const payments = new Map<string, PaymentRecord>();
  const orders = new Map<string, OrderRecord>();
  let carSold = false;
  const finalPaid = new Set<string>();

  const applyPaid = (p: PaymentRecord, sign: 1 | -1) => {
    cash -= sign * p.amountCents;
    if (p.target.kind === "heir") {
      distributed[p.target.id] = (distributed[p.target.id] ?? 0) + sign * p.amountCents;
    } else {
      claims = claims.map((c) =>
        c.id === p.target.id ? { ...c, paidCents: c.paidCents + sign * p.amountCents } : c,
      );
    }
  };

  for (const e of events) {
    switch (e.type) {
      case "date_advanced":
        asOf = e.data.to;
        simulatedDate = true;
        break;
      case "date_reverted":
        asOf = e.data.to;
        simulatedDate = false;
        break;
      case "claim_added":
        claims = claims.filter((c) => c.id !== e.data.claim.id).concat(e.data.claim);
        break;
      case "claim_released":
        claims = claims.filter((c) => c.id !== e.data.claimId);
        break;
      case "payment_requested": {
        const p: PaymentRecord = { ...e.data, status: "requested", feeCents: 0 };
        payments.set(p.ledgerId, p);
        if (simulatedDate && p.target.kind === "heir") finalPaid.add(p.target.id);
        applyPaid(p, 1); // Counted as gone from the moment it's approved.
        break;
      }
      case "payment_sent": {
        const p = payments.get(e.data.ledgerId);
        if (p) {
          p.status = "sent";
          p.batchId = e.data.batchId;
          p.unconfirmed = false;
        }
        break;
      }
      case "payment_settled": {
        const p = payments.get(e.data.ledgerId);
        if (p && p.status !== "failed") {
          p.status = "paid";
          p.transactionId = e.data.transactionId;
          p.paypalStatus = "SUCCESS";
          p.feeCents = e.data.feeCents ?? 0;
          cash -= p.feeCents;
        }
        break;
      }
      case "payment_progress": {
        const p = payments.get(e.data.ledgerId);
        if (p) p.paypalStatus = e.data.paypalStatus;
        break;
      }
      case "payment_unconfirmed": {
        const p = payments.get(e.data.ledgerId);
        if (p) p.unconfirmed = true;
        break;
      }
      case "payment_failed": {
        const p = payments.get(e.data.ledgerId);
        if (p && p.status !== "failed") {
          applyPaid(p, -1); // Money never left, so it's owed again.
          p.status = "failed";
          p.failure = e.data.message;
          p.simulated = e.data.simulated;
        }
        break;
      }
      case "order_created":
        orders.set(e.data.orderId, { orderId: e.data.orderId, status: "created", grossCents: e.data.grossCents });
        break;
      case "order_cancelled": {
        const o = orders.get(e.data.orderId);
        if (o) o.status = "cancelled";
        break;
      }
      case "order_capture_failed": {
        const o = orders.get(e.data.orderId);
        if (o) {
          o.status = "capture_failed";
          o.failure = e.data.message;
          o.simulated = e.data.simulated;
        }
        break;
      }
      case "order_captured": {
        const o = orders.get(e.data.orderId);
        if (o && o.status !== "captured") {
          o.status = "captured";
          o.captureId = e.data.captureId;
          o.netCents = e.data.netCents;
          o.feeCents = e.data.feeCents;
          cash += e.data.netCents;
          otherAssets = otherAssets.filter((a) => a.id !== "car");
          carSold = true;
        }
        break;
      }
    }
  }

  /** An heir who's had a payment after the window closed needs no more fee set aside for them. */
  const payoutPaidOut = (heirId: string) => finalPaid.has(heirId);

  // Once the window closes the last payments can empty the estate, so their transfer fees are set aside.
  // Before that, the prudence margin already covers them.
  const windowClosed = asOf > windowCloses(seedEstate.noticePublishedOn);
  const feeReserve = windowClosed
    ? Math.min(
        cash,
        seedEstate.heirs
          .filter((h) => !payoutPaidOut(h.id))
          .reduce((sum, h) => sum + (h.country === "US" ? PAYOUT_FEE_CENTS : CROSS_BORDER_FEE_RESERVE_CENTS), 0),
      )
    : 0;
  const facts: EstateFacts = {
    ...seedEstate,
    cashCents: cash - feeReserve,
    otherAssets,
    distributedCents: distributed,
  };

  return {
    asOf,
    simulatedDate,
    facts,
    claims,
    plan: planEstate(facts, claims, asOf),
    feeReserveCents: feeReserve,
    payments: [...payments.values()],
    orders: [...orders.values()],
    events,
    carSold,
  };
}

/** Sandbox email for each payee. Fake addresses, set in the environment. */
/** Anything that moves or frees money after the date jump pins the date there. */
const PINNING = new Set(["payment_requested", "order_created", "order_captured", "claim_released"]);

/**
 * Whether the simulated date can go back to the real one. Only while nothing has moved since the jump,
 * because a payment made after the window closed was checked against rules that no longer apply before it.
 */
export function canGoBack(events: { type: string }[]): boolean {
  let last = -1;
  events.forEach((e, i) => {
    if (e.type === "date_advanced") last = i;
    if (e.type === "date_reverted") last = -1;
  });
  return last >= 0 && !events.slice(last + 1).some((e) => PINNING.has(e.type));
}

export function receiverFor(target: Target): string | undefined {
  if (target.kind === "heir") {
    return {
      dana: process.env.SANDBOX_HEIR_DANA_EMAIL,
      tom: process.env.SANDBOX_HEIR_TOM_EMAIL,
      aoife: process.env.SANDBOX_HEIR_NIECE_EMAIL,
    }[target.id];
  }
  return process.env.SANDBOX_CREDITOR_EMAIL;
}
