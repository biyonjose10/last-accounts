"use client";

import type { EstateState } from "@/lib/ledger/state";

interface Step {
  label: string;
  href: string;
  done: boolean;
}

/** The route through the demo, ticked off from what has actually happened in this estate. */
export function stepsFor(state: EstateState): Step[] {
  const has = (type: string, test: (d: any) => boolean = () => true) =>
    state.events.some((e) => e.type === type && test(e.data));
  const settled = (kind: string, id?: string) =>
    state.payments.some((p) => p.status === "paid" && p.target.kind === kind && (!id || p.target.id === id));
  const creditorsPaid = state.plan.claimLines.filter((l) => l.status === "payable" && l.owedCents > 0).length === 0;
  const heirsPaid = state.plan.heirs.every((h) => h.entitledCents > 0 && h.distributedCents >= h.entitledCents);
  return [
    { label: "Try to pay Tom his full share. It stops you.", href: "#send-heading", done: has("payment_blocked") },
    { label: "Pay the creditors in legal order.", href: "#claims-heading", done: creditorsPaid && settled("claim") },
    { label: "Pay Tom the safe amount.", href: "#send-heading", done: settled("heir", "tom") },
    { label: "Sell Tom the car through PayPal.", href: "#car-heading", done: state.carSold },
    { label: "Open both letters in the post.", href: "#paper-heading", done: has("document_read", (d) => d.docId === "northgate") && has("document_read", (d) => d.docId === "filing") },
    { label: "Jump past the claim window, then pay everyone.", href: "#send-heading", done: state.simulatedDate && heirsPaid },
  ];
}

export function Guide({ state }: { state: EstateState }) {
  const steps = stepsFor(state);
  const next = steps.findIndex((s) => !s.done);
  return (
    <nav className="guide" aria-label="What to try">
      <h2 className="guide-title">What to try</h2>
      <ol>
        {steps.map((s, i) => (
          <li key={s.label} className={s.done ? "done" : i === next ? "next" : undefined}>
            <a href={s.href}>{s.label}</a>
          </li>
        ))}
      </ol>
      {next === -1 && (
        <p className="guide-end">
          That&apos;s the whole estate. <a href="/accounting">See the final account, read back from PayPal.</a>
        </p>
      )}
    </nav>
  );
}
