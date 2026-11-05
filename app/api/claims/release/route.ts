import { NextResponse } from "next/server";
import { z } from "zod";
import { buildState } from "@/lib/ledger/state";
import { store } from "@/lib/ledger/store";
import { workspaceId } from "@/lib/session";

const Body = z.object({ claimId: z.string().max(40) });

/**
 * After the window closes, Dana can release a reserve held against a letter that was never filed in court.
 * 733.702: a claim binds the estate only if filed in the probate proceeding in time.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const workspace = await workspaceId();
  const s = store();
  const state = buildState(await s.list(workspace));
  if (state.plan.windowOpen) {
    return NextResponse.json({ error: "The claim window is still open." }, { status: 409 });
  }
  const claim = state.claims.find((c) => c.id === parsed.data.claimId);
  if (!claim || claim.triage === "valid") {
    return NextResponse.json({ error: "Only a disputed claim can be released." }, { status: 409 });
  }
  await s.append(workspace, "claim_released", { claimId: claim.id, creditor: claim.creditor, amountCents: claim.amountCents }, `release:${claim.id}`);
  return NextResponse.json({ ok: true });
}
