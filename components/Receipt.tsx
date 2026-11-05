"use client";

import { useEffect, useRef } from "react";
import { usd } from "@/lib/ledger/describe";
import type { EstateState, PaymentRecord } from "@/lib/ledger/state";

export type ReceiptRef = { ledgerIds: string[] } | { orderId: string };

interface Line {
  label: string;
  cents: number;
}

/** A Paid badge that opens that payment's receipt. */
export function PaidBadge({ onOpen, label = "Paid" }: { onOpen: () => void; label?: string }) {
  return (
    <button type="button" className="badge paid as-button" onClick={onOpen} title="Open the receipt">
      {label}
      <svg viewBox="0 0 16 16" aria-hidden><path d="M4 2.5h8v11l-1.6-1-1.2 1-1.2-1-1.2 1-1.2-1-1.6 1z M6 6h4 M6 8.5h4" /></svg>
    </button>
  );
}

/** Bars drawn from the PayPal ID's characters. Decoration only: the ID printed under it is what counts. */
function Bars({ code }: { code: string }) {
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  for (const ch of code) {
    const n = ch.charCodeAt(0);
    for (let i = 0; i < 3; i++) {
      const w = 1 + ((n >> (i * 2)) & 3) * 0.75;
      bars.push({ x, w });
      x += w + 1 + ((n >> (i + 1)) & 1) * 1.5;
    }
  }
  return (
    <svg className="bars" viewBox={`0 0 ${Math.max(x, 1)} 40`} preserveAspectRatio="none" aria-hidden>
      {bars.map((b, i) => <rect key={i} x={b.x} y={0} width={b.w} height={40} />)}
    </svg>
  );
}

const when = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }) + " UTC"
    : "Not yet";

const mask = (email?: string) => {
  if (!email) return undefined;
  const [user = "", domain] = email.split("@");
  return domain ? `${user.slice(0, 1)}…@${domain}` : undefined;
};

/** A payment's receipt, read live from the ledger, so it fills in when PayPal confirms. */
export function Receipt({ state, receipt, onClose }: { state: EstateState; receipt: ReceiptRef; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // Keep Tab inside the receipt: its only control is Close.
      if (e.key === "Tab") {
        e.preventDefault();
        box.current?.querySelector<HTMLElement>(".receipt-close")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [onClose]);

  let tone: "paid" | "waiting" | "stop";
  let title: string;
  let sub: string;
  let lines: Line[];
  let paypalId: string | undefined;
  let fields: { label: string; value: string }[];
  let method: string;

  if ("orderId" in receipt) {
    const o = state.orders.find((x) => x.orderId === receipt.orderId);
    if (!o) return null;
    const at = state.events.find((e) => e.type === "order_captured" && e.data.orderId === o.orderId)?.at;
    tone = o.status === "captured" ? "paid" : o.status === "capture_failed" ? "stop" : "waiting";
    title = tone === "paid" ? "Received from Tom Calloway" : tone === "stop" ? "Payment declined" : "Waiting for Tom";
    sub = tone === "paid" ? "PayPal captured the payment for the car." : tone === "stop" ? "No credit was given. The car stays in the estate." : "Tom hasn't approved the payment yet.";
    lines = [{ label: "2019 hatchback, at the appraised value", cents: o.grossCents }];
    paypalId = o.captureId;
    fields = [
      { label: "Received", value: o.status === "captured" ? usd(o.netCents ?? o.grossCents) : "Nothing" },
      { label: "PayPal fee", value: o.feeCents !== undefined ? usd(o.feeCents) : "Not yet" },
      { label: "Captured", value: when(at) },
      { label: "Approved by", value: "Tom, at checkout" },
    ];
    method = "PayPal Checkout, sandbox";
  } else {
    const ps = receipt.ledgerIds
      .map((id) => state.payments.find((p) => p.ledgerId === id))
      .filter((p): p is PaymentRecord => Boolean(p));
    const first = ps[0];
    if (!first) return null;
    const paid = ps.filter((p) => p.status === "paid");
    const failed = ps.filter((p) => p.status === "failed");
    const allPaid = paid.length === ps.length;
    tone = allPaid ? "paid" : failed.length === ps.length ? "stop" : "waiting";
    const who = ps.length === 1 ? first.payee : `${ps.length} creditors`;
    const mixed = ps.length > 1 && !allPaid && paid.length + failed.length > 0;
    title = allPaid
      ? `Paid to ${who}`
      : tone === "stop"
        ? `Not paid to ${who}`
        : mixed
          ? `${paid.length} of ${ps.length} paid`
          : `Sent to ${who}`;
    sub = allPaid
      ? "PayPal confirmed it."
      : tone === "stop"
        ? `${failed.find((p) => p.failure)?.failure ?? "PayPal refused it."} Nothing left the estate.`
        : failed.length > 0
          ? `${failed.length} failed and ${failed.length === 1 ? "is" : "are"} still owed. Nothing was marked paid for ${failed.length === 1 ? "it" : "them"}.`
          : ps.some((p) => p.unconfirmed)
            ? "No clear answer from PayPal yet. The money stays held until it confirms."
            : "Waiting for PayPal to confirm. This fills in by itself.";
    lines = ps.map((p) => ({ label: p.payee, cents: p.amountCents }));
    paypalId = ps.length === 1 ? first.transactionId ?? first.batchId : first.batchId;
    const ids = new Set(ps.map((p) => p.ledgerId));
    const settledAt = state.events.filter((e) => e.type === "payment_settled" && ids.has(e.data.ledgerId)).map((e) => e.at).sort();
    const at = allPaid
      ? settledAt[settledAt.length - 1]
      : state.events.find((e) => e.type === "payment_requested" && e.data.ledgerId === first.ledgerId)?.at;
    const fees = paid.reduce((s, p) => s + (p.feeCents ?? 0), 0);
    fields = [
      { label: "Total", value: usd(ps.reduce((s, p) => s + p.amountCents, 0)) },
      { label: "PayPal fee", value: paid.length > 0 ? usd(fees) : "Not yet" },
      { label: allPaid ? "Settled" : "Sent", value: when(at) },
      { label: "Approved by", value: first.auto ? "Agent, within its limits" : "Dana" },
    ];
    method = ps.length === 1 && mask(first.receiver) ? `PayPal Payouts to ${mask(first.receiver)}` : "PayPal Payouts, one batch";
  }

  return (
    <div className="receipt-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} tabIndex={-1} className="receipt" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
        <div className="receipt-top">
          <span className={`receipt-icon ${tone}`} aria-hidden>
            {tone === "paid" ? (
              <svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" /></svg>
            ) : tone === "stop" ? (
              <svg viewBox="0 0 24 24"><path d="M8 8l8 8M16 8l-8 8" /></svg>
            ) : (
              <svg viewBox="0 0 24 24"><path d="M12 7v5l3 2" /></svg>
            )}
          </span>
          <h3 id="receipt-title">{title}</h3>
          <p>{sub}</p>
        </div>
        <div className="receipt-tear" aria-hidden />
        <div className="receipt-body">
          <ul className="receipt-lines">
            {lines.map((l, i) => (
              <li key={i}><span>{l.label}</span><span className="money">{usd(l.cents)}</span></li>
            ))}
          </ul>
          <dl className="receipt-fields">
            {fields.map((f) => (
              <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>
            ))}
          </dl>
          <p className="receipt-method">{method}</p>
        </div>
        <div className="receipt-code">
          {paypalId ? (
            <>
              <Bars code={paypalId} />
              <p className="id">PayPal ID {paypalId}</p>
            </>
          ) : (
            <p className="id">PayPal hasn&apos;t given an ID yet.</p>
          )}
        </div>
        <div className="receipt-edge" aria-hidden />
        <button className="receipt-close" onClick={onClose} aria-label="Close the receipt">
          <svg viewBox="0 0 24 24" aria-hidden><path d="M7 7l10 10M17 7L7 17" /></svg>
        </button>
      </div>
    </div>
  );
}
