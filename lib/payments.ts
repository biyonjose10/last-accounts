// Moves money. Every path goes through the engine first, and every approval pays at most once.

import { createHash } from "node:crypto";
import { checkClaimPayment, checkHeirPayment, planEstate } from "@/lib/engine/plan";
import type { Block, PaymentCheck } from "@/lib/engine/types";
import { store, type LedgerEvent, type Store } from "@/lib/ledger/store";
import { buildState, receiverFor, type EstateState, type PaymentRecord, type Target } from "@/lib/ledger/state";
import {
  FINAL_ITEM_STATUSES,
  MONEY_BACK_STATUSES,
  batchStatus,
  payBatch,
  type PayoutItem,
} from "@/lib/paypal/payouts";
import { PayPalUnavailable } from "@/lib/paypal/client";

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);

/** Number of money events so far. A token is only good for the state it was issued against. */
const version = (events: LedgerEvent[]) => events.filter((e) => e.type === "payment_requested").length;

export function approvalToken(workspace: string, target: Target, amountCents: number, v: number): string {
  return hash(`${workspace}|${target.kind}|${target.id}|${amountCents}|${v}`);
}

const payeeName = (state: EstateState, target: Target) =>
  target.kind === "heir"
    ? (state.facts.heirs.find((h) => h.id === target.id)?.name ?? target.id)
    : (state.claims.find((c) => c.id === target.id)?.creditor ?? target.id);

function checkTarget(state: EstateState, target: Target, amountCents: number): PaymentCheck {
  if (target.kind === "heir") return checkHeirPayment(state.plan, target.id, amountCents);
  const check = checkClaimPayment(state.plan, target.id);
  if (amountCents !== check.requestedCents) {
    return { ...check, allowed: false, safeCents: check.safeCents, requestedCents: amountCents };
  }
  return check;
}

export async function checkPayment(workspace: string, target: Target, amountCents: number, s: Store = store()) {
  const events = await s.list(workspace);
  const state = buildState(events);
  const check = checkTarget(state, target, amountCents);
  const v = version(events);
  if (!check.allowed) {
    await s.append(workspace, "payment_blocked", {
      target,
      payee: payeeName(state, target),
      amountCents,
      safeCents: check.safeCents,
      blocks: check.blocks,
    });
  }
  return {
    ...check,
    version: v,
    token: check.allowed ? approvalToken(workspace, target, amountCents, v) : null,
    safeToken: check.safeCents > 0 ? approvalToken(workspace, target, check.safeCents, v) : null,
  };
}

export type PayResult =
  | { ok: true; duplicate: boolean; payment: PaymentRecord }
  | { ok: false; reason: "blocked"; blocks: Block[]; safeCents: number }
  | { ok: false; reason: "failed"; message: string; simulated: boolean; payment?: PaymentRecord }
  | { ok: false; reason: "bad_token" | "no_receiver"; message: string };

export interface PayOptions {
  auto?: boolean;
  simulateNote?: string;
  store?: Store;
}

export async function pay(
  workspace: string,
  target: Target,
  amountCents: number,
  token: string,
  v: number,
  opts: PayOptions = {},
): Promise<PayResult> {
  const s = opts.store ?? store();
  if (token !== approvalToken(workspace, target, amountCents, v)) {
    return { ok: false, reason: "bad_token", message: "This approval doesn't match the payment." };
  }
  const key = `pay:${token}`;
  const ledgerId = `la${token.slice(0, 20)}`;

  const events = await s.list(workspace);
  const already = buildState(events).payments.find((p) => p.ledgerId === ledgerId);
  if (already) return { ok: true, duplicate: true, payment: already };

  const state = buildState(events);
  const check = checkTarget(state, target, amountCents);
  if (!check.allowed) return { ok: false, reason: "blocked", blocks: check.blocks, safeCents: check.safeCents };

  const receiver = receiverFor(target);
  if (!receiver) return { ok: false, reason: "no_receiver", message: "No sandbox account is set for this payee." };

  const { duplicate } = await s.append(
    workspace,
    "payment_requested",
    { ledgerId, target, payee: payeeName(state, target), amountCents, auto: Boolean(opts.auto) },
    key,
  );
  if (duplicate) {
    const again = buildState(await s.list(workspace)).payments.find((p) => p.ledgerId === ledgerId);
    if (again) return { ok: true, duplicate: true, payment: again };
  }

  const items: PayoutItem[] = [{ ledgerId, receiver, amountCents, note: `Estate of Ruth Calloway: ${payeeName(state, target)}` }];
  return send(s, workspace, `la-${token}`, items, opts.simulateNote);
}

async function send(
  s: Store,
  workspace: string,
  senderBatchId: string,
  items: PayoutItem[],
  simulateNote?: string,
): Promise<PayResult> {
  const fail = async (message: string, simulated: boolean): Promise<PayResult> => {
    for (const item of items) {
      await s.append(workspace, "payment_failed", { ledgerId: item.ledgerId, message, simulated }, `failed:${item.ledgerId}`);
    }
    const payment = buildState(await s.list(workspace)).payments.find((p) => p.ledgerId === items[0]?.ledgerId);
    return { ok: false, reason: "failed", message, simulated, payment };
  };

  let outcome;
  try {
    outcome = await payBatch(senderBatchId, items, { simulateNote });
  } catch (err) {
    if (err instanceof PayPalUnavailable) return fail(err.message, false);
    throw err;
  }
  if (outcome.kind === "failed") return fail(`${outcome.code}: ${outcome.message}`, outcome.simulated);

  for (const item of items) {
    await s.append(workspace, "payment_sent", { ledgerId: item.ledgerId, batchId: outcome.batchId }, `sent:${item.ledgerId}`);
  }
  const payment = buildState(await s.list(workspace)).payments.find((p) => p.ledgerId === items[0]?.ledgerId);
  return { ok: true, duplicate: outcome.duplicate, payment: payment as PaymentRecord };
}

/** Pays claims in the order the law sets, as one batch. Each is checked as if the ones before it were paid. */
export async function payClaimsInOrder(workspace: string, claimIds: string[], opts: { store?: Store } = {}) {
  const s = opts.store ?? store();
  const events = await s.list(workspace);
  const state = buildState(events);
  const v = version(events);

  const order = state.plan.claimLines
    .filter((l) => claimIds.includes(l.claimId))
    .map((l) => l.claimId)
    .filter((id, i, all) => all.indexOf(id) === i);

  // Walk the plan forward on a copy, so a later class is only allowed once earlier ones are covered.
  let working = state.claims.map((c) => ({ ...c }));
  let cash = state.facts.cashCents;
  const planned: { claimId: string; owed: number }[] = [];
  for (const id of order) {
    const plan = planEstate({ ...state.facts, cashCents: cash }, working, state.asOf);
    const check = checkClaimPayment(plan, id);
    if (!check.allowed) {
      await s.append(workspace, "payment_blocked", {
        target: { kind: "claim", id },
        payee: payeeName(state, { kind: "claim", id }),
        amountCents: check.requestedCents,
        safeCents: 0,
        blocks: check.blocks,
      });
      return { ok: false as const, reason: "blocked" as const, claimId: id, blocks: check.blocks };
    }
    planned.push({ claimId: id, owed: check.requestedCents });
    cash -= check.requestedCents;
    working = working.map((c) => (c.id === id ? { ...c, paidCents: c.amountCents } : c));
  }
  if (planned.length === 0) return { ok: false as const, reason: "nothing" as const };

  const receiver = receiverFor({ kind: "claim", id: "any" });
  if (!receiver) return { ok: false as const, reason: "no_receiver" as const };

  const batchToken = hash(`${workspace}|claims|${order.join(",")}|${v}`);
  const items: PayoutItem[] = [];
  for (const { claimId, owed } of planned) {
    const ledgerId = `la${hash(`${batchToken}|${claimId}`).slice(0, 20)}`;
    const target: Target = { kind: "claim", id: claimId };
    await s.append(
      workspace,
      "payment_requested",
      { ledgerId, target, payee: payeeName(state, target), amountCents: owed, auto: false },
      `pay:${ledgerId}`,
    );
    items.push({ ledgerId, receiver, amountCents: owed, note: `Estate of Ruth Calloway: ${payeeName(state, target)}` });
  }
  const result = await send(s, workspace, `la-${batchToken}`, items);
  return { ok: result.ok as boolean, reason: result.ok ? undefined : ("failed" as const), result };
}

/** Reads each unfinished payment back from PayPal. PayPal's record decides whether it's paid. */
export async function syncPayments(workspace: string, s: Store = store()): Promise<void> {
  const state = buildState(await s.list(workspace));
  const batches = new Set(state.payments.filter((p) => p.status === "sent" && p.batchId).map((p) => p.batchId as string));
  for (const batchId of batches) {
    let status;
    try {
      status = await batchStatus(batchId);
    } catch {
      continue; // Try again on the next look. Nothing is marked paid meanwhile.
    }
    for (const item of status.items) {
      const payment = state.payments.find((p) => p.ledgerId.startsWith(item.ledgerId) && p.batchId === batchId);
      if (!payment) continue;
      if (item.status === "SUCCESS") {
        await s.append(
          workspace,
          "payment_settled",
          { ledgerId: payment.ledgerId, transactionId: item.transactionId, feeCents: item.feeCents },
          `settled:${payment.ledgerId}`,
        );
      } else if (MONEY_BACK_STATUSES.has(item.status)) {
        await s.append(
          workspace,
          "payment_failed",
          { ledgerId: payment.ledgerId, message: `PayPal says ${item.status}`, simulated: false },
          `failed:${payment.ledgerId}`,
        );
      } else if (!FINAL_ITEM_STATUSES.has(item.status) && payment.paypalStatus !== item.status) {
        await s.append(workspace, "payment_progress", { ledgerId: payment.ledgerId, paypalStatus: item.status });
      }
    }
  }
}
