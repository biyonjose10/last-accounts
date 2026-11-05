// The agent's mandate. Plain code, so no model output can widen it.

import { classify, FUNERAL_CAP_CENTS } from "@/lib/engine/rules-fl";
import type { Claim } from "@/lib/engine/types";

export const AUTO_PAY_ITEM_LIMIT_CENTS = 50_000;
export const AUTO_PAY_DAILY_LIMIT_CENTS = 100_000;

export interface AutoPayDecision {
  allowed: boolean;
  reason: string;
}

/** The agent may pay small administration costs alone. Everything else waits for the person in charge. */
export function agentMayAutoPay(claim: Claim, spentTodayCents: number): AutoPayDecision {
  const owed = claim.amountCents - claim.paidCents;
  const parts = classify(claim.category, owed, FUNERAL_CAP_CENTS);
  if (parts.some((p) => p.class !== 1)) {
    return { allowed: false, reason: "Only Class 1 administration costs can be paid without approval." };
  }
  if (claim.triage !== "valid") {
    return { allowed: false, reason: "This claim hasn't been accepted as valid." };
  }
  if (owed > AUTO_PAY_ITEM_LIMIT_CENTS) {
    return { allowed: false, reason: "Above the agent's $500 per item limit." };
  }
  if (spentTodayCents + owed > AUTO_PAY_DAILY_LIMIT_CENTS) {
    return { allowed: false, reason: "Would pass the agent's $1,000 daily limit." };
  }
  return { allowed: true, reason: "Class 1 cost, within the agent's limits." };
}
