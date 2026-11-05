"use client";

import { useEffect, useRef, useState } from "react";
import { usd } from "@/lib/ledger/describe";

/** The figure over a bar. When it changes, the old one is struck through, then fades. */
function BarFigure({ cents, sign }: { cents: number; sign: string }) {
  const last = useRef(cents);
  const [previous, setPrevious] = useState<number | null>(null);
  useEffect(() => {
    if (last.current === cents) return;
    setPrevious(last.current);
    last.current = cents;
    const t = window.setTimeout(() => setPrevious(null), 2600);
    return () => window.clearTimeout(t);
  }, [cents]);
  return (
    <span className="bar-figure">
      {previous !== null && (
        <span key={previous} className="struck fading" aria-label={`was ${usd(previous)}`}>{usd(previous)}</span>
      )}
      <span className="figure-sm">{sign && <span className="sign">{sign}</span>}{usd(cents)}</span>
    </span>
  );
}

interface Step {
  key: string;
  label: string;
  cents: number;
  /** Where the bar starts and ends, as cents from the bottom. */
  from: number;
  to: number;
  sign: "" | "−" | "=";
  connect: "top" | "bottom" | null;
}

/**
 * Where the estate's cash stands: what it holds, what goes to creditors, what's held back,
 * and what is left that can safely go to the family. Bars move when the figures change.
 */
export function CashBridge({
  cashCents,
  owedCents,
  heldCents,
  safeCents,
  windowOpen,
}: {
  cashCents: number;
  owedCents: number;
  heldCents: number;
  safeCents: number;
  windowOpen: boolean;
}) {
  const afterOwed = Math.max(0, cashCents - owedCents);
  const afterHeld = Math.max(0, afterOwed - heldCents);
  const steps: Step[] = [
    { key: "cash", label: "Cash in the estate", cents: cashCents, from: 0, to: cashCents, sign: "", connect: "top" },
    { key: "owed", label: "Owed to creditors", cents: owedCents, from: afterOwed, to: cashCents, sign: "−", connect: "bottom" },
    { key: "held", label: windowOpen ? "Held until claims close" : "Held for disputed claims", cents: heldCents, from: afterHeld, to: afterOwed, sign: "−", connect: "bottom" },
    { key: "safe", label: "Safe to pay today", cents: safeCents, from: 0, to: safeCents, sign: "=", connect: null },
  ];
  const scale = Math.max(cashCents, owedCents + heldCents + safeCents, 1);
  const pct = (c: number) => `${(Math.max(0, c) / scale) * 100}%`;

  return (
    <div className="bridge" role="group" aria-label="Where the estate's cash stands">
      <div className="bridge-head">
        <h2 className="bridge-title">Where the money stands</h2>
        <ul className="bridge-key">
          <li><span className="key owed" />Goes to creditors</li>
          <li><span className="key held" />Held back, comes back later</li>
          <li><span className="key safe" />Safe for the family</li>
        </ul>
      </div>
      <div className="bridge-cols">
        {steps.map((s) => (
          <div key={s.key} className={`bridge-col ${s.key}`}>
            <div className="bridge-plot">
              <div
                className={`bar ${s.key}${s.connect ? ` conn-${s.connect}` : ""}`}
                style={{ bottom: pct(s.from), height: `max(2px, ${pct(s.to - s.from)})` }}
              >
                <BarFigure cents={s.cents} sign={s.sign} />
              </div>
            </div>
            <p className="bridge-label">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
