import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPayment } from "@/lib/payments";
import { workspaceId } from "@/lib/session";

const Body = z.object({
  target: z.object({ kind: z.enum(["heir", "claim"]), id: z.string().max(40) }),
  amountCents: z.number().int().positive().max(100_000_000),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the amount and payee." }, { status: 400 });
  const workspace = await workspaceId();
  return NextResponse.json(await checkPayment(workspace, parsed.data.target, parsed.data.amountCents));
}
