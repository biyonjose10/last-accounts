"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { describe, longDate, usd } from "@/lib/ledger/describe";
import type { EstateState } from "@/lib/ledger/state";

/** Read-only view of a saved real run. Nothing here calls PayPal or the AI. */
export function ReplayView() {
  const [data, setData] = useState<{ state: EstateState; recordedAt: string | null } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/replay")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <main className="sheet"><p>No replay has been recorded yet.</p></main>;
  if (!data) return <main className="sheet"><p>Opening the replay…</p></main>;
  const { state } = data;

  return (
    <main className="sheet">
      <div className="bar">
        <span><strong>Last Accounts</strong> · <Link href="/">Back to the live demo</Link></span>
        <span className="simulated">Replay of a real sandbox run. Nothing moves.</span>
      </div>
      <header className="masthead">
        <h1>Estate of {state.facts.decedent}</h1>
        <p>
          Recorded{data.recordedAt ? ` on ${longDate(data.recordedAt.slice(0, 10))}` : ""}. Every PayPal ID below is from that real run in the sandbox. Each entry is what happened, in order.
        </p>
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
                <td><span className={p.status === "paid" ? "state paid" : "state stop"}>{p.status === "paid" ? "Paid" : p.status}</span></td>
                <td className="id">{p.transactionId}</td>
              </tr>
            ))}
            {state.orders.filter((o) => o.status === "captured").map((o) => (
              <tr key={o.orderId}>
                <td>From Tom Calloway, for the car</td>
                <td className="num">{usd(o.grossCents)}</td>
                <td>Tom, in PayPal Checkout</td>
                <td><span className="state paid">Captured</span></td>
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
      <footer className="foot"><p>A hackathon demo for use alongside a lawyer. It isn&apos;t legal advice, and the people in it don&apos;t exist.</p></footer>
    </main>
  );
}
