import { paypal, toCents, toValue } from "./client";

export async function createOrder(requestId: string, amountCents: number, description: string) {
  const res = await paypal("/v2/checkout/orders", {
    method: "POST",
    safeToRepeat: true,
    headers: { "PayPal-Request-Id": requestId },
    body: {
      intent: "CAPTURE",
      purchase_units: [{ amount: { currency_code: "USD", value: toValue(amountCents) }, description }],
    },
  });
  return { ok: res.ok, orderId: res.json.id as string | undefined, status: res.status, debugId: res.debugId };
}

export type CaptureOutcome =
  | { kind: "captured"; captureId: string; grossCents: number; netCents: number; feeCents: number }
  | { kind: "failed"; issue: string; message: string };

/** `simulateDecline` uses PayPal's negative testing header, and is labelled on screen when used. */
export async function captureOrder(orderId: string, opts: { simulateDecline?: boolean } = {}): Promise<CaptureOutcome> {
  const res = await paypal(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    safeToRepeat: true,
    headers: {
      "PayPal-Request-Id": opts.simulateDecline ? `drill-${orderId}-${Date.now()}` : `capture-${orderId}`,
      ...(opts.simulateDecline
        ? { "PayPal-Mock-Response": JSON.stringify({ mock_application_codes: "INSTRUMENT_DECLINED" }) }
        : {}),
    },
  });
  if (!res.ok) {
    const issue = res.json?.details?.[0]?.issue ?? res.json?.name ?? `HTTP ${res.status}`;
    return { kind: "failed", issue: String(issue), message: String(res.json?.details?.[0]?.description ?? "The payment wasn't captured.") };
  }
  const capture = res.json?.purchase_units?.[0]?.payments?.captures?.[0];
  if (!capture || capture.status !== "COMPLETED") {
    return { kind: "failed", issue: String(capture?.status ?? "NO_CAPTURE"), message: "PayPal didn't report a completed capture." };
  }
  const b = capture.seller_receivable_breakdown;
  const gross = toCents(capture.amount.value);
  return {
    kind: "captured",
    captureId: capture.id,
    grossCents: gross,
    netCents: b?.net_amount ? toCents(b.net_amount.value) : gross,
    feeCents: b?.paypal_fee ? toCents(b.paypal_fee.value) : 0,
  };
}
