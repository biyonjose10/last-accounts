// Keeps a public demo usable and affordable. Beyond these limits, visitors get a labelled replay of a real run.

import { createHash } from "node:crypto";
import type { Store } from "@/lib/ledger/store";

/** Fresh estates one visitor can start in a day. */
export const VISITOR_ESTATES_PER_DAY = 5;
/** Estates per day that may move sandbox money. Each full run costs about $46,400 of the fake balance. */
export const LIVE_MONEY_RUNS_PER_DAY = 6;

const today = () => new Date().toISOString().slice(0, 10);

/** Stores a hash, never the address itself. */
export function visitorKey(ip: string): string {
  return createHash("sha256").update(`${process.env.SESSION_SECRET ?? "local"}|${ip}`).digest("hex").slice(0, 24);
}

export function requestIp(headers: Headers): string {
  return headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function mayStartEstate(s: Store, visitor: string): Promise<boolean> {
  return s.bump(`estates:${visitor}:${today()}`, VISITOR_ESTATES_PER_DAY);
}

/** An estate that has already started moving money may finish. New ones count against the daily cap. */
export async function mayMoveMoney(s: Store, workspace: string): Promise<boolean> {
  const events = await s.list(workspace);
  if (events.some((e) => e.type === "payment_requested")) return true;
  return s.bump(`money-runs:${today()}`, LIVE_MONEY_RUNS_PER_DAY);
}

export const LIMIT_MESSAGE =
  "Today's live sandbox payments are used up, to keep this demo free and working. You can watch a labelled replay of a real run instead.";
export const EMPTY_MESSAGE =
  "The demo's sandbox account has run out of fake money for now. Nothing was marked paid. You can watch a labelled replay of a real run instead.";
