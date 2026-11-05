// Registers the hosted app's webhook with the sandbox app. Run once:
// node --env-file=.env scripts/create-webhook.mjs https://your-app.vercel.app
const base = "https://api-m.sandbox.paypal.com";
const appUrl = process.argv[2];
if (!appUrl) throw new Error("Pass the hosted URL.");
const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
const { access_token } = await (await fetch(`${base}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" })).json();
const res = await fetch(`${base}/v1/notifications/webhooks`, {
  method: "POST",
  headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    url: `${appUrl.replace(/\/$/, "")}/api/webhook`,
    event_types: ["PAYMENT.PAYOUTS-ITEM.SUCCEEDED", "PAYMENT.PAYOUTS-ITEM.FAILED", "PAYMENT.PAYOUTS-ITEM.UNCLAIMED", "PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.DENIED"].map((name) => ({ name })),
  }),
});
const json = await res.json();
console.log("HTTP", res.status, json.id ?? JSON.stringify(json.details ?? json.name));
