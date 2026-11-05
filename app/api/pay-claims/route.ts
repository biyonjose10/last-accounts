import { NextResponse } from "next/server";
import { z } from "zod";
import { payClaimsInOrder } from "@/lib/payments";
import { workspaceId } from "@/lib/session";

const Body = z.object({ claimIds: z.array(z.string().max(40)).min(1).max(20) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "No claims chosen." }, { status: 400 });
  const workspace = await workspaceId();
  const result = await payClaimsInOrder(workspace, parsed.data.claimIds);
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
