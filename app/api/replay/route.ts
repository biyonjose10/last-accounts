import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { buildState } from "@/lib/ledger/state";

/** A real run, saved with its real PayPal IDs. Read-only, and always labelled as a replay. */
export async function GET() {
  const events = JSON.parse(await readFile(path.join(process.cwd(), "fixtures", "replay", "run.json"), "utf8"));
  const upTo = events.length;
  return NextResponse.json({ state: buildState(events), steps: upTo, recordedAt: events[upTo - 1]?.at ?? null });
}
