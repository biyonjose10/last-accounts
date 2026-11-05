// Rebuilds the estate from its events. Nothing is stored except what happened.

import { planEstate } from "@/lib/engine/plan";
import { windowCloses } from "@/lib/engine/rules-fl";
import type { Claim, EstateFacts, EstatePlan } from "@/lib/engine/types";
import { START_DATE, claims as seedClaims, estate as seedEstate } from "@/fixtures/scenario";
import type { LedgerEvent } from "./store";

/** Observed in the sandbox: a flat $0.25 per payout. Held back so the last payment can't overdraw. */
export const PAYOUT_FEE_CENTS = 25;

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
      case "claim_added":
        claims = claims.filter((c) => c.id !== e.data.claim.id).concat(e.data.claim);
        break;
      case "claim_released":
        claims = claims.filter((c) => c.id !== e.data.claimId);
        break;
      case "payment_requested": {
        const p: PaymentRecord = { ...e.data, status: "requested", feeCents: 0 };
        payments.set(p.ledgerId, p);
        applyPaid(p, 1); // Counted as gone from the moment it's approved.
        break;
      }
      case "payment_sent": {
        const p = payments.get(e.data.ledgerId);
        if (p) {
          p.status = "sent";
          p.batchId = e.data.batchId;
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

  // Once the window closes the last payments can empty the estate, so their transfer fees are set aside.
  // Before that, the prudence margin already covers them.
  const windowClosed = asOf > windowCloses(seedEstate.noticePublishedOn);
  const feeReserve = windowClosed ? Math.min(cash, seedEstate.heirs.length * PAYOUT_FEE_CENTS) : 0;
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
