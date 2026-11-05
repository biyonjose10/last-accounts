import { NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/ledger/store";
import { EMPTY_MESSAGE, LIMIT_MESSAGE, mayMoveMoney } from "@/lib/limits";
import { payClaimsInOrder } from "@/lib/payments";
import { workspaceId } from "@/lib/session";

const Body = z.object({ claimIds: z.array(z.string().max(40)).min(1).max(20) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "No claims chosen." }, { status: 400 });
  const workspace = await workspaceId();
  if (!(await mayMoveMoney(store(), workspace))) {
    return NextResponse.json({ ok: false, reason: "limit", message: LIMIT_MESSAGE, replay: true }, { status: 429 });
  }
  const result = await payClaimsInOrder(workspace, parsed.data.claimIds);
  const failure = !result.ok && "result" in result && result.result && !result.result.ok && "message" in result.result ? String(result.result.message) : "";
  if (failure.includes("INSUFFICIENT_FUNDS")) {
    return NextResponse.json({ ok: false, reason: "failed", message: EMPTY_MESSAGE, replay: true }, { status: 409 });
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
