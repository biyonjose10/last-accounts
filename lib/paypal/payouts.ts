import { paypal, toCents, toValue, PayPalUnavailable } from "./client";

export interface PayoutItem {
  ledgerId: string;
  receiver: string;
  amountCents: number;
  note: string;
}

export type BatchOutcome =
  | { kind: "sent"; batchId: string; duplicate: boolean }
  | { kind: "failed"; code: string; message: string; simulated: boolean };

/** `sender_batch_id` is deterministic, so PayPal refuses a second batch for the same approval for 30 days. */
export async function payBatch(
  senderBatchId: string,
  items: PayoutItem[],
  opts: { simulateNote?: string } = {},
): Promise<BatchOutcome> {
  const body = {
    sender_batch_header: {
      sender_batch_id: senderBatchId,
      email_subject: "Estate of Ruth Calloway: payment",
      email_message: "Sandbox payment from a fictional estate.",
    },
    items: items.map((item, i) => ({
      recipient_type: "EMAIL",
      amount: { value: toValue(item.amountCents), currency: "USD" },
      receiver: item.receiver,
      note: i === 0 && opts.simulateNote ? opts.simulateNote : item.note.slice(0, 120),
      sender_item_id: item.ledgerId.slice(0, 30),
    })),
  };

  const res = await paypal("/v1/payments/payouts", { method: "POST", body, safeToRepeat: true });

  if (res.ok) return { kind: "sent", batchId: res.json.batch_header.payout_batch_id, duplicate: false };

  const existing = res.json?.details?.find?.((d: any) => d.issue?.includes("already exists"));
  const href: string | undefined = existing?.link?.[0]?.href;
  if (href) return { kind: "sent", batchId: href.split("/").pop() as string, duplicate: true };

  const issue = res.json?.details?.[0]?.issue ?? res.json?.name ?? `HTTP ${res.status}`;
  return {
    kind: "failed",
    code: String(res.json?.name ?? res.status),
    message: String(issue),
    simulated: Boolean(opts.simulateNote),
  };
}

export interface BatchStatus {
  batchId: string;
  batchStatus: string;
  feesCents: number;
  items: {
    itemId: string;
    ledgerId: string;
    status: string;
    transactionId: string | null;
    amountCents: number;
    feeCents: number;
    receiver: string;
    error?: string;
  }[];
}

export async function batchStatus(batchId: string): Promise<BatchStatus> {
  const res = await paypal(`/v1/payments/payouts/${encodeURIComponent(batchId)}`);
  if (!res.ok) throw new PayPalUnavailable(`Could not read payout ${batchId} (${res.status}).`);
  const h = res.json.batch_header;
  return {
    batchId,
    batchStatus: h.batch_status,
    feesCents: h.fees ? toCents(h.fees.value) : 0,
    items: (res.json.items ?? []).map((i: any) => ({
      itemId: i.payout_item_id,
      ledgerId: i.payout_item?.sender_item_id ?? "",
      status: i.transaction_status,
      transactionId: i.transaction_id ?? null,
      amountCents: toCents(i.payout_item.amount.value),
      feeCents: i.payout_item_fee ? toCents(i.payout_item_fee.value) : 0,
      receiver: i.payout_item.receiver,
      error: i.errors?.name,
    })),
  };
}

export const FINAL_ITEM_STATUSES = new Set(["SUCCESS", "FAILED", "RETURNED", "BLOCKED", "REFUNDED", "REVERSED"]);
export const MONEY_BACK_STATUSES = new Set(["FAILED", "RETURNED", "BLOCKED", "REFUNDED", "REVERSED"]);
