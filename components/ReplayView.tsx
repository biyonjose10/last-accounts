"use client";

import { Shell } from "./Shell";
import { useCallback, useEffect, useState } from "react";
import { PaidBadge, Receipt, type ReceiptRef } from "./Receipt";
import { describe, longDate, usd } from "@/lib/ledger/describe";
import type { EstateState } from "@/lib/ledger/state";

const PAGES = [
  { href: "/", label: "The estate" },
  { href: "/accounting", label: "Final account" },
  { href: "/replay", label: "Replay of a real run" },
];

/** Read-only view of a saved real run. Nothing here calls PayPal or the AI. */
export function ReplayView() {
  const [data, setData] = useState<{ state: EstateState; recordedAt: string | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptRef | null>(null);
  const closeReceipt = useCallback(() => setReceipt(null), []);

  useEffect(() => {
    fetch("/api/replay")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <Shell nav={PAGES}><p className="empty">No replay has been recorded yet.</p></Shell>;
  if (!data) return <Shell nav={PAGES}><p className="empty">Opening the replay…</p></Shell>;
  const { state } = data;

  return (
    <Shell nav={PAGES}>
      <div className="topbar">
        <span className="simulated">Replay of a real sandbox run. Nothing moves.</span>
      </div>
      <header className="hero">
        <p className="hero-meta">
          Estate of {state.facts.decedent}. Recorded{data.recordedAt ? ` on ${longDate(data.recordedAt.slice(0, 10))}` : ""}. Every PayPal ID below is from that real run in the sandbox, in the order it happened.
        </p>
        <h1 className="headline"><span>A real run, replayed.</span> <mark>Nothing here moves money.</mark></h1>
      </header>
      <section>
        <div className="section-head"><h2>Payments</h2></div>
        <table className="ledger">
          <thead><tr><th>To</th><th className="num">Amount</th><th>Who approved</th><th>Status</th><th>PayPal ID</th></tr></thead>
          <tbody>
            {state.payments.map((p) => (
              <tr key={p.ledgerId}>
                <td>{p.payee}</td>
                <td className="num">{usd(p.amountCents)}</td>
                <td>{p.auto ? "Agent, within limits" : "Dana"}</td>
                <td>{p.status === "paid" ? <PaidBadge onOpen={() => setReceipt({ ledgerIds: [p.ledgerId] })} /> : <span className="badge stop">{p.status}</span>}</td>
                <td className="id">{p.transactionId}</td>
              </tr>
            ))}
            {state.orders.filter((o) => o.status === "captured").map((o) => (
              <tr key={o.orderId}>
                <td>From Tom Calloway, for the car</td>
                <td className="num">{usd(o.grossCents)}</td>
                <td>Tom, in PayPal Checkout</td>
                <td><PaidBadge label="Captured" onOpen={() => setReceipt({ orderId: o.orderId })} /></td>
                <td className="id">{o.captureId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <div className="section-head"><h2>The record</h2></div>
        <ol className="record">
          {state.events.map((e) => {
            const line = describe(e);
            return line ? <li key={e.seq}><span className="who">{line.who}</span><span>{line.text}</span></li> : null;
          })}
        </ol>
      </section>
      {receipt && <Receipt state={state} receipt={receipt} onClose={closeReceipt} />}
      <footer className="foot"><p>A hackathon demo for use alongside a lawyer. It isn&apos;t legal advice, and the people in it don&apos;t exist.</p></footer>
    </Shell>
  );
}
