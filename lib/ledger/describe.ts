// Turns ledger events into the plain record shown on screen. Safe to use in the browser.

import type { LedgerEvent } from "./store";

export const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export interface RecordLine {
  who: "Dana" | "Agent" | "PayPal" | "Rules" | "Drill" | "Clock";
  text: string;
}

export function describe(e: LedgerEvent): RecordLine | null {
  const d = e.data ?? {};
  switch (e.type) {
    case "payment_blocked":
      return { who: "Rules", text: `Stopped ${usd(d.amountCents)} to ${d.payee}: ${d.blocks?.[0]?.message ?? "not allowed."}` };
    case "payment_requested":
      return { who: d.auto ? "Agent" : "Dana", text: `${d.auto ? "Paid under its limits" : "Approved"}: ${usd(d.amountCents)} to ${d.payee}.` };
    case "payment_sent":
      return { who: "PayPal", text: `Payout batch ${d.batchId} accepted.` };
    case "payment_settled":
      return { who: "PayPal", text: `Payment confirmed, transaction ${d.transactionId}. Fee ${usd(d.feeCents ?? 0)}.` };
    case "payment_failed":
      return { who: d.simulated ? "Drill" : "PayPal", text: `${d.simulated ? "Simulated failure" : "Payment failed"}: ${d.message}. Nothing left the estate, so it's still owed.` };
    case "date_advanced":
      return { who: "Clock", text: `Simulated date moved to ${longDate(d.to)}.` };
    case "claim_added":
      return { who: "Agent", text: `Logged a claim from ${d.claim.creditor} for ${usd(d.claim.amountCents)}. ${d.reason ?? ""}`.trim() };
    case "claim_released":
      return { who: "Dana", text: `Released the reserve for ${d.creditor}: nothing was filed in court before the deadline.` };
    case "document_read":
      return { who: "Agent", text: d.via === "live" ? `Read "${d.title}" with Gemini.` : d.via === "saved" ? `AI not used for "${d.title}" (${d.failure ?? "saved"}). Used a saved reading from a real run.` : `Couldn't read "${d.title}": ${d.failure}. Waiting for Dana.` };
    case "agent_note":
      return { who: "Agent", text: d.text };
    case "order_created":
      return { who: "PayPal", text: `Checkout order ${d.orderId} created for ${usd(d.grossCents)}.` };
    case "order_cancelled":
      return { who: "PayPal", text: "The buyer cancelled. The car stays in the estate." };
    case "order_capture_failed":
      return { who: d.simulated ? "Drill" : "PayPal", text: `${d.simulated ? "Simulated decline" : "Capture failed"}: ${d.message}. No credit given.` };
    case "order_captured":
      return { who: "PayPal", text: `Captured ${d.captureId}. ${usd(d.netCents)} reached the estate after a ${usd(d.feeCents)} fee.` };
    default:
      return null;
  }
}
