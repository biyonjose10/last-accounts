import { NextResponse } from "next/server";
import { z } from "zod";
import { buildState } from "@/lib/ledger/state";
import { store } from "@/lib/ledger/store";
import { PayPalUnavailable } from "@/lib/paypal/client";
import { captureOrder } from "@/lib/paypal/orders";
import { workspaceId } from "@/lib/session";

const Body = z.object({ orderId: z.string().max(40), drill: z.boolean().optional() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { orderId, drill } = parsed.data;
  const workspace = await workspaceId();
  const s = store();

  const state = buildState(await s.list(workspace));
  const order = state.orders.find((o) => o.orderId === orderId);
  if (!order) return NextResponse.json({ error: "That order isn't part of this estate." }, { status: 404 });
  if (order.status === "captured") return NextResponse.json({ ok: true, duplicate: true, captureId: order.captureId });

  try {
    const outcome = await captureOrder(orderId, { simulateDecline: drill });
    if (outcome.kind === "failed") {
      await s.append(workspace, "order_capture_failed", { orderId, message: outcome.issue, simulated: Boolean(drill) });
      return NextResponse.json({ ok: false, message: outcome.issue, simulated: Boolean(drill) }, { status: 402 });
    }
    await s.append(workspace, "order_captured", { orderId, ...outcome }, `captured:${orderId}`);
    return NextResponse.json({ ok: true, captureId: outcome.captureId });
  } catch (err) {
    if (err instanceof PayPalUnavailable) {
      await s.append(workspace, "order_capture_failed", { orderId, message: err.message, simulated: false });
      return NextResponse.json({ ok: false, message: err.message }, { status: 503 });
    }
    throw err;
  }
}
