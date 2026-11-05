"use client";

import { AUTO_PAY_DAILY_LIMIT_CENTS, AUTO_PAY_ITEM_LIMIT_CENTS } from "@/lib/agent/limits";
import { usd } from "@/lib/ledger/describe";
import type { EstateState } from "@/lib/ledger/state";

/** The agent's mandate, on screen. The same numbers the code enforces, read from the same constants. */
export function AgentLimits({ state }: { state: EstateState }) {
  // Counted the way the agent's check counts it: every payment it has started alone.
  const spent = state.events
    .filter((e) => e.type === "payment_requested" && e.data.auto)
    .reduce((sum, e) => sum + (e.data.amountCents as number), 0);
  const share = Math.min(1, spent / AUTO_PAY_DAILY_LIMIT_CENTS);

  return (
    <aside className="mandate" aria-label="What the agent may do alone">
      <p className="mandate-title">What the agent may do alone</p>
      <ul className="mandate-rules">
        <li className="yes">Pay court and filing costs, the first class in Florida&apos;s order, up to {usd(AUTO_PAY_ITEM_LIMIT_CENTS)} each</li>
        <li className="yes">Up to {usd(AUTO_PAY_DAILY_LIMIT_CENTS)} a day in all</li>
        <li className="no">Anything else: it reserves the money and waits for Dana</li>
        <li className="no">Nothing at all when the AI is off or only a saved reading is available</li>
      </ul>
      <div className="mandate-meter">
        <div className="meter-track" aria-hidden><span className="meter-fill" style={{ transform: `scaleX(${share})` }} /></div>
        <p>
          <span className="money">{usd(spent)}</span> of {usd(AUTO_PAY_DAILY_LIMIT_CENTS)} spent alone so far
        </p>
      </div>
    </aside>
  );
}
