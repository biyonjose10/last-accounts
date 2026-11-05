import { NextResponse } from "next/server";
import { buildState } from "@/lib/ledger/state";
import { store } from "@/lib/ledger/store";
import { PayPalUnavailable } from "@/lib/paypal/client";
import { createOrder } from "@/lib/paypal/orders";
import { workspaceId } from "@/lib/session";

/** Tom buys the car from the estate at its appraised value. */
export async function POST() {
  const workspace = await workspaceId();
  const s = store();
  const state = buildState(await s.list(workspace));
  const car = state.facts.otherAssets.find((a) => a.id === "car");
  if (!car) return NextResponse.json({ error: "The car has already been sold." }, { status: 409 });

  const attempts = state.orders.length;
  try {
    const order = await createOrder(`car-${workspace}-${attempts}`, car.valueCents, `Estate of Ruth Calloway: ${car.name}`);
    if (!order.ok || !order.orderId) {
      return NextResponse.json({ error: `PayPal didn't create the order (${order.status}).` }, { status: 502 });
    }
    await s.append(workspace, "order_created", { orderId: order.orderId, grossCents: car.valueCents }, `order:${order.orderId}`);
    return NextResponse.json({ orderId: order.orderId });
  } catch (err) {
    if (err instanceof PayPalUnavailable) return NextResponse.json({ error: err.message }, { status: 503 });
    throw err;
  }
}
