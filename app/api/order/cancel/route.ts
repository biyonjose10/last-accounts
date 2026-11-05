import { NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/ledger/store";
import { workspaceId } from "@/lib/session";

const Body = z.object({ orderId: z.string().max(40) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const workspace = await workspaceId();
  await store().append(workspace, "order_cancelled", { orderId: parsed.data.orderId }, `cancel:${parsed.data.orderId}`);
  return NextResponse.json({ ok: true });
}
