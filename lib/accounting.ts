// The final account, read back from PayPal's records rather than from our own ledger.

import { buildState } from "@/lib/ledger/state";
import { store } from "@/lib/ledger/store";
import { paypal, toCents } from "@/lib/paypal/client";
import { batchStatus } from "@/lib/paypal/payouts";

export interface AccountLine {
  kind: "out" | "in";
  who: string;
  /** What our ledger says. */
  ledgerCents: number;
  /** What PayPal's record says, when it could be read. */
  paypalCents: number | null;
  feeCents: number;
  paypalId: string | null;
  paypalStatus: string;
  matches: boolean;
}

export async function buildAccounting(workspace: string) {
  const state = buildState(await store().list(workspace));
  const lines: AccountLine[] = [];

  const batches = new Map<string, Awaited<ReturnType<typeof batchStatus>> | null>();
  for (const p of state.payments) {
    if (p.batchId && !batches.has(p.batchId)) {
      batches.set(p.batchId, await batchStatus(p.batchId).catch(() => null));
    }
  }
  for (const p of state.payments.filter((x) => x.status !== "failed")) {
    const item = p.batchId ? batches.get(p.batchId)?.items.find((i) => p.ledgerId.startsWith(i.ledgerId)) : undefined;
    lines.push({
      kind: "out",
      who: p.payee,
      ledgerCents: p.amountCents,
      paypalCents: item?.amountCents ?? null,
      feeCents: item?.feeCents ?? p.feeCents,
      paypalId: item?.transactionId ?? p.transactionId ?? null,
      paypalStatus: item?.status ?? "NOT READ",
      matches: item?.amountCents === p.amountCents && item?.status === "SUCCESS",
    });
  }
  for (const o of state.orders.filter((x) => x.status === "captured")) {
    const res = await paypal(`/v2/checkout/orders/${encodeURIComponent(o.orderId)}`).catch(() => null);
    const capture = res?.json?.purchase_units?.[0]?.payments?.captures?.[0];
    const amount = capture ? toCents(capture.amount.value) : null;
    lines.push({
      kind: "in",
      who: "Tom Calloway, for the car",
      ledgerCents: o.grossCents,
      paypalCents: amount,
      feeCents: o.feeCents ?? 0,
      paypalId: capture?.id ?? o.captureId ?? null,
      paypalStatus: capture?.status ?? "NOT READ",
      matches: amount === o.grossCents && capture?.status === "COMPLETED",
    });
  }

  const out = lines.filter((l) => l.kind === "out").reduce((s, l) => s + (l.paypalCents ?? 0), 0);
  const inflow = lines.filter((l) => l.kind === "in").reduce((s, l) => s + (l.paypalCents ?? 0), 0);
  const fees = lines.reduce((s, l) => s + l.feeCents, 0);
  return {
    decedent: state.facts.decedent,
    asOf: state.asOf,
    simulatedDate: state.simulatedDate,
    lines,
    totals: { outCents: out, inCents: inflow, feesCents: fees, cashLeftCents: state.plan.cashCents + state.feeReserveCents },
    allMatch: lines.length > 0 && lines.every((l) => l.matches),
  };
}
