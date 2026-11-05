"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Block, PaymentCheck } from "@/lib/engine/types";
import { describe, longDate, usd } from "@/lib/ledger/describe";
import type { EstateState, PaymentRecord, Target } from "@/lib/ledger/state";
import { CarSale } from "./CarSale";
import { FaultDrill, type Drills } from "./FaultDrill";
import { Figure } from "./Figure";
import { Guide } from "./Guide";
import { MoneyTimeline } from "./MoneyTimeline";
import { Paperwork } from "./Paperwork";
import { CashBridge } from "./CashBridge";
import { Segmented } from "./Segmented";
import { Shell, type NavItem } from "./Shell";

const NAV: NavItem[] = [
  { href: "#overview", label: "Overview" },
  { href: "#pay", label: "Pay an heir" },
  { href: "#creditors", label: "Creditors" },
  { href: "#timeline", label: "Timeline" },
  { href: "#car", label: "The car" },
  { href: "#paperwork", label: "Paperwork" },
  { href: "#drill", label: "Fault drill" },
  { href: "#record", label: "Record" },
];

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Whole dollars when there are no cents, for the headline. */
const big = (cents: number) => (cents % 100 === 0 ? `$${(cents / 100).toLocaleString("en-US")}` : usd(cents));

/** The page's opening sentence: what can go to the family today, then what's holding the rest. */
function headline(safe: number, owed: number, held: number, windowOpen: boolean, closes: string, allPaid: boolean): [string, string] {
  if (allPaid) return ["Everyone has been paid.", "The final account is ready."];
  const lead = safe > 0 ? `${big(safe)} is safe to pay today.` : "Nothing is safe to pay yet.";
  if (owed > 0 && held > 0) return [lead, `${big(owed + held)} waits for creditors and claims.`];
  if (held > 0) return [lead, windowOpen ? `${big(held)} is held until ${shortDate(closes)}.` : `${big(held)} is held for disputed claims.`];
  if (owed > 0) return [lead, `${big(owed)} goes to creditors first.`];
  return [lead, "Nothing else is holding it back."];
}

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
  if (payment.status === "paid") return <span className="badge paid">Paid</span>;
  if (payment.status === "failed") return <span className="badge stop">Failed, still owed</span>;
  return <span className="badge sent">{payment.paypalStatus ? `PayPal: ${payment.paypalStatus.toLowerCase()}` : "Sent to PayPal"}</span>;
}

export function EstateApp({ clientId }: { clientId: string }) {
  const [state, setState] = useState<EstateState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [payee, setPayee] = useState("tom");
  const [amount, setAmount] = useState("");
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "fail"; text: string; replay?: boolean } | null>(null);

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
          text: res.json.replay
            ? res.json.message
            : `${res.json.simulated ? "Simulated failure. " : ""}${res.json.message ?? "That payment didn't go through."} Nothing was marked paid.`,
          replay: Boolean(res.json.replay),
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
          : {
              kind: "fail",
              text: res.json.message ?? res.json.blocks?.[0]?.message ?? res.json.result?.message ?? "Those payments didn't go through. Nothing was marked paid.",
              replay: Boolean(res.json.replay),
            },
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

  if (error && !state) return <main className="page"><p className="state stop">{error}</p></main>;
  if (!state) return <main className="page loading"><p>Opening the ledger…</p></main>;

  const { plan } = state;
  const reserved = plan.disputedReserveCents + plan.contingencyReserveCents + state.feeReserveCents;
  const cash = plan.cashCents + state.feeReserveCents;
  const paymentFor = (t: Target) =>
    [...state.payments].reverse().find((p) => p.target.kind === t.kind && p.target.id === t.id);
  const unpaidClaimIds = [...new Set(plan.claimLines.filter((l) => l.status === "payable" && l.owedCents > 0).map((l) => l.claimId))];
  const records = state.events.map((e) => ({ e, line: describe(e) })).filter((r) => r.line).reverse();
  const allPaid = plan.owedCents === 0 && plan.heirs.every((h) => h.entitledCents > 0 && h.distributedCents >= h.entitledCents);
  const [lead, reason] = headline(plan.distributableNowCents, plan.owedCents, reserved, plan.windowOpen, plan.windowClosesOn, allPaid);
  const first = (name?: string) => name?.split(" ")[0] ?? "";

  return (
    <Shell
      nav={NAV}
      pages={[{ href: "/accounting", label: "Final account" }, { href: "/replay", label: "Replay of a real run" }]}
      footer={<button className="link" onClick={reset} disabled={busy}>Start this estate again</button>}
    >
      <div className="topbar">
        <Segmented
          label="Date"
          value={plan.windowOpen ? "open" : "closed"}
          disabled={busy}
          onChange={(v) => { if (v === "closed") advanceDate(); }}
          options={[
            { value: "open", label: "Window open", disabled: !plan.windowOpen, title: plan.windowOpen ? undefined : "Start the estate again to go back" },
            { value: "closed", label: "After the window (simulated)" },
          ]}
        />
        <p className="today">
          Today is <strong>{longDate(state.asOf)}</strong>
          {state.simulatedDate && <span className="simulated">Simulated date</span>}
        </p>
      </div>

      <header id="overview" className="hero">
        <p className="hero-meta">
          Estate of {state.facts.decedent}, Florida. Died {longDate(state.facts.dateOfDeath)}. Dana Calloway is the personal representative.{" "}
          {plan.windowOpen
            ? `Creditors can file claims until ${longDate(plan.windowClosesOn)}.`
            : `The creditor window closed on ${longDate(plan.windowClosesOn)}.`}
        </p>
        <h1 className="headline">
          <span>{lead}</span> <mark>{reason}</mark>
        </h1>
        <CashBridge cashCents={cash} owedCents={plan.owedCents} heldCents={reserved} safeCents={plan.distributableNowCents} windowOpen={plan.windowOpen} />
        <Guide state={state} />
      </header>

      <section id="pay" aria-labelledby="send-heading">
        <div className="section-head"><h2 id="send-heading">Pay an heir</h2></div>
        <div className="send">
          <div>
            <span className="field-label">Who</span>
            <Segmented
              label="Who"
              value={payee}
              disabled={busy}
              onChange={(v) => { setPayee(v); setAmount(""); setCheck(null); }}
              options={state.facts.heirs.map((h) => ({ value: h.id, label: first(h.name) }))}
            />
          </div>
          <div className="amount-field">
            <label htmlFor="amount" className="field-label">Amount, USD</label>
            <input id="amount" className="amount" type="text" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setCheck(null); }} />
          </div>
          <button className="primary" onClick={tryPayment} disabled={busy || toCents(amount) === 0}>Send payment</button>
        </div>

        {check && !check.allowed && (
          <div className="verdict" role="alert" key={`stop-${check.version}-${check.requestedCents}`}>
            <div className="verdict-why">
              <span className="badge stop">Stopped</span>
              <h3>Stop. This could put the money on you.</h3>
              <ul className="reasons">
                {check.blocks.map((b) => (
                  <li key={b.code + b.message}>{b.message}<Citation block={b} /></li>
                ))}
              </ul>
            </div>
            <aside className="verdict-do">
              <p className="verdict-do-title">What you can do</p>
              {check.safeCents > 0 && check.safeToken ? (
                <>
                  <p className="suggestion">Pay {usd(check.safeCents)} to {first(heirLine?.name)} now. The rest waits until it&apos;s safe.</p>
                  <button className="primary" disabled={busy} onClick={() => approve(check.safeCents, check.safeToken as string, check.version)}>
                    Approve {usd(check.safeCents)} to {heirLine?.name}
                  </button>
                </>
              ) : (
                <>
                  <p className="suggestion">Nothing can safely go to {first(heirLine?.name)} yet. Pay the creditors first.</p>
                  <a className="secondary" href="#claims-heading">Go to the creditors</a>
                </>
              )}
            </aside>
          </div>
        )}

        {check && check.allowed && check.token && (
          <div className="notice ok" key={`ok-${check.version}-${check.requestedCents}`}>
            <p>{usd(check.requestedCents)} to {heirLine?.name} is safe today.</p>
            <button className="primary" disabled={busy} onClick={() => approve(check.requestedCents, check.token as string, check.version)}>
              Approve {usd(check.requestedCents)}
            </button>
          </div>
        )}

        {notice && (
          <div className={`notice ${notice.kind}`} role="status" key={notice.text}>
            <p>
              {notice.text}
              {notice.replay && <> <a href="/replay">Watch the replay</a></>}
            </p>
          </div>
        )}

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
                <tr key={h.heirId} className={h.heirId === payee ? "chosen" : undefined}>
                  <td>{h.name}{heir?.country !== "US" ? <span className="reason">Lives in {heir?.country === "IE" ? "Ireland" : heir?.country}</span> : null}</td>
                  <td className="num">{usd(h.entitledCents)}</td>
                  <td className="num">{usd(h.distributedCents)}</td>
                  <td className="num">{usd(h.safeNowCents)}</td>
                  <td className="hide-sm"><PaymentState payment={p} />{p?.transactionId && <span className="id">{p.transactionId}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section id="creditors" aria-labelledby="claims-heading">
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
                    {l.status === "paid" && <span className="badge paid">Paid</span>}
                    {l.status === "payable" && (p?.status === "failed" ? <span className="badge stop">Failed, still owed</span> : <span className="badge owed">Owed</span>)}
                    {l.status === "held" && <span className="badge held">Reserved, not paid</span>}
                    {l.status === "barred" && <span className="badge stop">Out of time</span>}
                    {l.reason && <span className="reason">{l.reason.message}</span>}
                    {l.status === "held" && !plan.windowOpen && (
                      <button className="link" disabled={busy} onClick={() => releaseClaim(l.claimId)}>
                        Nothing was filed in court by the deadline: release this reserve
                      </button>
                    )}
                    {l.status === "paid" && p?.transactionId && <span className="id">{p.transactionId}</span>}
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

      <section id="timeline" aria-labelledby="timeline-heading">
        <div className="section-head"><h2 id="timeline-heading">Who gets paid, and when</h2></div>
        <MoneyTimeline state={state} />
      </section>

      <CarSale state={state} clientId={clientId} simulateDecline={drills.declineNextCapture} onChange={refresh} />

      <Paperwork state={state} aiOff={drills.aiOff} onChange={refresh} />

      <FaultDrill drills={drills} onChange={setDrills} />

      <section id="record" aria-labelledby="record-heading">
        <div className="section-head"><h2 id="record-heading">The record</h2></div>
        <p className="section-note">Everything that happened, and why. Nothing here can be edited.</p>
        {records.length === 0 ? (
          <p className="empty">Nothing has moved yet. Try paying Tom his full share.</p>
        ) : (
          <ol className="record">
            {records.map(({ e, line }) => (
              <li key={e.seq}><span className="who">{line?.who}</span><span>{line?.text}</span></li>
            ))}
          </ol>
        )}
      </section>

      <footer className="foot">
        <p>A hackathon demo using one state&apos;s rules, for use alongside a lawyer. It isn&apos;t legal advice, and the people in it don&apos;t exist.</p>
      </footer>
    </Shell>
  );
}
