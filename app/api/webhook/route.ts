import { NextResponse } from "next/server";
import { store } from "@/lib/ledger/store";
import { paypal } from "@/lib/paypal/client";
import { syncPayments } from "@/lib/payments";

/** Real PayPal events only. A forged or unverified call changes nothing. */
export async function POST(req: Request) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return NextResponse.json({ ok: false }, { status: 503 });

  const event = await req.json().catch(() => null);
  if (!event?.id) return NextResponse.json({ ok: false }, { status: 400 });

  const h = req.headers;
  const check = await paypal("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    safeToRepeat: true,
    body: {
      auth_algo: h.get("paypal-auth-algo"),
      cert_url: h.get("paypal-cert-url"),
      transmission_id: h.get("paypal-transmission-id"),
      transmission_sig: h.get("paypal-transmission-sig"),
      transmission_time: h.get("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: event,
    },
  });
  if (check.json?.verification_status !== "SUCCESS") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const s = store();
  const senderItemId: string | undefined = event.resource?.payout_item?.sender_item_id;
  const workspace = senderItemId ? await s.findWorkspaceByLedger(senderItemId) : null;
  if (workspace) {
    await s.append(
      workspace,
      "webhook_received",
      { eventType: event.event_type, eventId: event.id, transactionId: event.resource?.transaction_id ?? null },
      `webhook:${event.id}`,
    );
    await syncPayments(workspace);
  }
  return NextResponse.json({ ok: true });
}
