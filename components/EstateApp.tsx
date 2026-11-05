"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Block, PaymentCheck } from "@/lib/engine/types";
import { describe, longDate, usd } from "@/lib/ledger/describe";
import type { EstateState, PaymentRecord, Target } from "@/lib/ledger/state";
import { CarSale } from "./CarSale";
import { FaultDrill, type Drills } from "./FaultDrill";
import { Figure } from "./Figure";
import { MoneyTimeline } from "./MoneyTimeline";
import { Paperwork } from "./Paperwork";

type CheckResult = PaymentCheck & { version: number; token: string | null; safeToken: string | null };

async function post(path: string, body?: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) };
}

const toCents = (text: string) => {
  const n = Number(text.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

function Citation({ block }: { block: Block }) {
  const { source, url } = block.citation;
  return (
    <span className="cite">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          {source}
        </a>
      ) : (
        source
      )}
    </span>
  );
}

function PaymentState({ payment }: { payment?: PaymentRecord }) {
  if (!payment) return null;
  if (payment.status === "paid") return <span className="state paid">Paid</span>;
  if (payment.status === "failed") return <span className="state stop">Failed, still owed</span>;
  return <span className="state waiting">{payment.paypalStatus ? `PayPal: ${payment.paypalStatus.toLowerCase()}` : "Sent to PayPal"}</span>;
}

export function EstateApp({ clientId }: { clientId: string }) {
  const [state, setState] = useState<EstateState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [payee, setPayee] = useState("tom");
  const [amount, setAmount] = useState("");
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "fail"; text: string } | null>(null);

  const [drills, setDrills] = useState<Drills>({ failNextPayout: false, declineNextCapture: false, aiOff: false });

  const refresh = useCallback(async () => {
    const res = await fetch("/api/estate", { cache: "no-store" });
    if (!res.ok) throw new Error("The ledger couldn't be loaded.");
    setState(await res.json());
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);

  // Payouts settle a few seconds later. Keep reading PayPal's answer while any is unfinished.
  const waiting = state?.payments.some((p) => p.status === "sent" || p.status === "requested");
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => refresh().catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [waiting, refresh]);

  const heirLine = useMemo(() => state?.plan.heirs.find((h) => h.heirId === payee), [state, payee]);

  // Offer the heir's full remaining share as the amount, which is what a person would try first.
  useEffect(() => {
    if (heirLine && !amount) {
      setAmount(((heirLine.entitledCents - heirLine.distributedCents) / 100).toFixed(2));
    }
  }, [heirLine, amount]);

  const target: Target = { kind: "heir", id: payee };

  async function tryPayment() {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await post("/api/check", { target, amountCents: toCents(amount) });
      if (!res.ok) throw new Error(res.json.error ?? "That couldn't be checked.");
      setCheck(res.json);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function approve(amountCents: number, token: string, version: number, drill = false) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await post("/api/pay", { target, amountCents, token, version, drill: drill || drills.failNextPayout });
      if (drills.failNextPayout) setDrills((d) => ({ ...d, failNextPayout: false }));
      if (res.json.ok) {
        setNotice({ kind: "ok", text: `${usd(amountCents)} sent to ${heirLine?.name}. PayPal is confirming it below.` });
      } else {
        setNotice({
          kind: "fail",
          text: `${res.json.simulated ? "Simulated failure. " : ""}${res.json.message ?? "That payment didn't go through."} Nothing was marked paid.`,
        });
      }
      setCheck(null);
      setAmount("");
      await refresh();
    } catch {
      setNotice({ kind: "fail", text: "We lost contact while sending. Nothing is marked paid until PayPal confirms it." });
    } finally {
      setBusy(false);
    }
  }

  async function payClaims(ids: string[]) {
    setBusy(true);
    setNotice(null);
    setCheck(null);
    try {
      const res = await post("/api/pay-claims", { claimIds: ids });
      setNotice(
        res.json.ok
          ? { kind: "ok", text: "Creditors paid in the order Florida law sets. PayPal is confirming them below." }
          : { kind: "fail", text: res.json.blocks?.[0]?.message ?? res.json.result?.message ?? "Those payments didn't go through. Nothing was marked paid." },
      );
      setAmount("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function releaseClaim(claimId: string) {
    setBusy(true);
    await post("/api/claims/release", { claimId });
    setAmount("");
    setCheck(null);
    await refresh();
    setBusy(false);
  }

  async function advanceDate() {
    setBusy(true);
    setCheck(null);
    await post("/api/date");
    setAmount("");
    await refresh();
    setBusy(false);
  }

  async function reset() {
    setBusy(true);
    await post("/api/reset");
    setCheck(null);
    setNotice(null);
    setAmount("");
    await refresh();
    setBusy(false);
  }

  if (error && !state) return <main className="sheet"><p className="state stop">{error}</p></main>;
  if (!state) return <main className="sheet"><p>Opening the ledger…</p></main>;

  const { plan } = state;
  const reserved = plan.disputedReserveCents + plan.contingencyReserveCents + state.feeReserveCents;
  const paymentFor = (t: Target) =>
    [...state.payments].reverse().find((p) => p.target.kind === t.kind && p.target.id === t.id);
  const unpaidClaimIds = [...new Set(plan.claimLines.filter((l) => l.status === "payable" && l.owedCents > 0).map((l) => l.claimId))];
  const records = state.events.map((e) => ({ e, line: describe(e) })).filter((r) => r.line).reverse();

  return (
    <main className="sheet">
      <div className="bar">
        <span><strong>Last Accounts</strong> · For the person settling an estate, alongside their lawyer. Not legal advice.</span>
        <span className="sandbox-tag">PayPal sandbox. Fictional estate, fake money.</span>
      </div>

      <header className="masthead">
        <h1>Estate of {state.facts.decedent}</h1>
        <p>Dana Calloway, personal representative. Florida. Died {longDate(state.facts.dateOfDeath)}.</p>
        <div className="date-row">
          <span>Today: <strong>{longDate(state.asOf)}</strong></span>
          {state.simulatedDate && <span className="simulated">Simulated date</span>}
          <span>
            {plan.windowOpen
              ? `Creditors can file claims until ${longDate(plan.windowClosesOn)}.`
              : `The creditor window closed on ${longDate(plan.windowClosesOn)}.`}
          </span>
          {plan.windowOpen && (
            <button className="link" onClick={advanceDate} disabled={busy}>
              Simulate: jump past the window
            </button>
          )}
        </div>
      </header>

      <div className="totals" aria-label="Estate totals">
        <div className="total"><h3>Cash in the estate</h3><Figure cents={plan.cashCents + state.feeReserveCents} /></div>
        <div className="total"><h3>Owed to creditors</h3><Figure cents={plan.owedCents} /></div>
        <div className="total"><h3>Held back</h3><Figure cents={reserved} /></div>
        <div className="total safe"><h3>Safe to distribute today</h3><Figure cents={plan.distributableNowCents} /></div>
      </div>

      <section aria-labelledby="send-heading">
        <div className="section-head"><h2 id="send-heading">Pay an heir</h2></div>
        <div className="send">
          <div>
            <label htmlFor="payee">Who</label>
            <select id="payee" value={payee} onChange={(e) => { setPayee(e.target.value); setAmount(""); setCheck(null); }}>
              {state.facts.heirs.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="amount">Amount, USD</label>
            <input id="amount" className="amount" type="text" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setCheck(null); }} />
          </div>
          <button className="primary" onClick={tryPayment} disabled={busy || toCents(amount) === 0}>Send payment</button>
        </div>

        {check && !check.allowed && (
          <div className="stop-panel" role="alert">
            <h3>Stop. This could put the money on you.</h3>
            <ul>
              {check.blocks.map((b) => (
                <li key={b.code + b.message}>{b.message}<Citation block={b} /></li>
              ))}
            </ul>
            {check.safeCents > 0 && check.safeToken ? (
              <div className="offer">
                <button className="primary" disabled={busy} onClick={() => approve(check.safeCents, check.safeToken as string, check.version)}>
                  Approve {usd(check.safeCents)} to {heirLine?.name}
                </button>
                <span>This is the safe amount today. The rest waits.</span>
              </div>
            ) : (
              <p>Nothing can safely go to {heirLine?.name} yet. Pay the creditors below first.</p>
            )}
          </div>
        )}

        {check && check.allowed && check.token && (
          <div className="ok-panel">
            <p>{usd(check.requestedCents)} to {heirLine?.name} is safe today.</p>
            <button className="primary" disabled={busy} onClick={() => approve(check.requestedCents, check.token as string, check.version)}>
              Approve {usd(check.requestedCents)}
            </button>
          </div>
        )}

        {notice && <div className={notice.kind === "ok" ? "ok-panel" : "fail-panel"} role="status">{notice.text}</div>}

        <table className="ledger">
          <thead>
            <tr>
              <th>Heir</th>
              <th className="num">Due in all</th>
              <th className="num">Paid</th>
              <th className="num">Safe today</th>
              <th className="hide-sm">Latest payment</th>
            </tr>
          </thead>
          <tbody>
            {plan.heirs.map((h) => {
              const p = paymentFor({ kind: "heir", id: h.heirId });
              const heir = state.facts.heirs.find((x) => x.id === h.heirId);
              return (
                <tr key={h.heirId}>
                  <td>{h.name}{heir?.country !== "US" ? <span className="reason">Lives in {heir?.country === "IE" ? "Ireland" : heir?.country}</span> : null}</td>
                  <td className="num">{usd(h.entitledCents)}</td>
                  <td className="num">{usd(h.distributedCents)}</td>
                  <td className="num">{usd(h.safeNowCents)}</td>
                  <td className="hide-sm"><PaymentState payment={p} />{p?.transactionId && <span className="id"><br />{p.transactionId}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="claims-heading">
        <div className="section-head"><h2 id="claims-heading">Creditors, in the order Florida law sets</h2></div>
        <table className="ledger">
          <thead>
            <tr>
              <th>Class</th>
              <th>Creditor</th>
              <th className="num">Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {plan.claimLines.map((l, i) => {
              const p = paymentFor({ kind: "claim", id: l.claimId });
              return (
                <tr key={`${l.claimId}-${l.class}-${i}`}>
                  <td className="class">{l.class}</td>
                  <td>{l.creditor}{l.class === 8 && l.claimId === "funeral" ? <span className="reason">Above the $6,000 funeral cap, so this part ranks last.</span> : null}</td>
                  <td className="num">{usd(l.amountCents)}</td>
                  <td>
                    {l.status === "paid" && <span className="state paid">Paid</span>}
                    {l.status === "payable" && (p?.status === "failed" ? <span className="state stop">Failed, still owed</span> : <span className="state waiting">Owed</span>)}
                    {l.status === "held" && <span className="state held">Reserved, not paid</span>}
                    {l.status === "barred" && <span className="state stop">Out of time</span>}
                    {l.reason && <span className="reason">{l.reason.message}</span>}
                    {l.status === "held" && !plan.windowOpen && (
                      <button className="link" disabled={busy} onClick={() => releaseClaim(l.claimId)}>
                        Nothing was filed in court by the deadline: release this reserve
                      </button>
                    )}
                    {l.status === "paid" && p?.transactionId && <span className="id"><br />{p.transactionId}</span>}
                    {l.status === "paid" && p && !p.transactionId && <span className="reason">{p.paypalStatus ? `PayPal: ${p.paypalStatus.toLowerCase()}` : "Sent to PayPal"}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="row-actions">
          <button className="primary" disabled={busy || unpaidClaimIds.length === 0} onClick={() => payClaims(unpaidClaimIds)}>
            {unpaidClaimIds.length === 0 ? "All accepted claims paid" : `Approve: pay ${unpaidClaimIds.length} ${unpaidClaimIds.length === 1 ? "claim" : "claims"} in legal order`}
          </button>
        </div>
      </section>

      <section aria-labelledby="timeline-heading">
        <div className="section-head"><h2 id="timeline-heading">Who gets paid, and when</h2></div>
        <MoneyTimeline state={state} />
      </section>

      <CarSale state={state} clientId={clientId} simulateDecline={drills.declineNextCapture} onChange={refresh} />

      <Paperwork state={state} aiOff={drills.aiOff} onChange={refresh} />

      <FaultDrill drills={drills} onChange={setDrills} />

      <section aria-labelledby="record-heading">
        <div className="section-head"><h2 id="record-heading">The record</h2></div>
        <p className="section-note">Everything that happened, and why. Nothing here can be edited.</p>
        {records.length === 0 ? (
          <p className="section-note">Nothing has moved yet.</p>
        ) : (
          <ol className="record">
            {records.map(({ e, line }) => (
              <li key={e.seq}><span className="who">{line?.who}</span><span>{line?.text}</span></li>
            ))}
          </ol>
        )}
      </section>

      <footer className="foot">
        <p>
          A hackathon demo using one state&apos;s rules, for use alongside a lawyer. It isn&apos;t legal advice, and the people in it don&apos;t exist.{" "}
          <button className="link" onClick={reset} disabled={busy}>Start this estate again</button>
        </p>
      </footer>
    </main>
  );
}
