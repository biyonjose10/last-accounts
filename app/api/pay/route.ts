import { NextResponse } from "next/server";
import { z } from "zod";
import { PayPalUnavailable } from "@/lib/paypal/client";
import { pay } from "@/lib/payments";
import { workspaceId } from "@/lib/session";

/** PayPal's documented negative test value for creating a payout. Labelled as simulated on screen. */
const DRILL_NOTE = "ERRPYO002";

const Body = z.object({
  target: z.object({ kind: z.enum(["heir", "claim"]), id: z.string().max(40) }),
  amountCents: z.number().int().positive().max(100_000_000),
  token: z.string().max(40),
  version: z.number().int().min(0),
  drill: z.boolean().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That payment request wasn't valid." }, { status: 400 });
  const { target, amountCents, token, version, drill } = parsed.data;
  const workspace = await workspaceId();
  try {
    const result = await pay(workspace, target, amountCents, token, version, { simulateNote: drill ? DRILL_NOTE : undefined });
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (err) {
    if (err instanceof PayPalUnavailable) return NextResponse.json({ ok: false, reason: "failed", message: err.message }, { status: 503 });
    throw err;
  }
}
