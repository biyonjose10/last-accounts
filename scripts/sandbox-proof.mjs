// Phase 0 go/no-go: proves the PayPal sandbox works from this account.
// Run: node --env-file=.env scripts/sandbox-proof.mjs <command>
// Commands: token | balances | order | capture <orderId> | payout <amount> | payout-status <batchId> | get-order <orderId>
//           | payout-repeat | mock-capture <orderId> | search
// Sandbox only. Secrets are never printed. Results go to scripts/.proof/ (gitignored).

import { mkdirSync, appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const BASE = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";
if (!BASE.includes("sandbox")) {
  console.error("REFUSED: PAYPAL_API_BASE is not a sandbox URL.");
  process.exit(2);
}
const { PAYPAL_CLIENT_ID: ID, PAYPAL_CLIENT_SECRET: SECRET } = process.env;
if (!ID || !SECRET) {
  console.error("Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET in .env");
  process.exit(2);
}

mkdirSync("scripts/.proof", { recursive: true });
const record = (label, data) =>
  appendFileSync(
    "scripts/.proof/results.jsonl",
    JSON.stringify({ at: new Date().toISOString(), label, data }) + "\n",
  );

// A dropped connection never reached PayPal, so retrying it cannot pay twice.
async function fetchRetry(url, options, tries = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      const code = err.cause?.code ?? "";
      const connectFailed = /CONNECT_TIMEOUT|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/.test(code);
      if (!connectFailed || attempt >= tries) throw err;
      console.error(`Connection problem (${code}), retry ${attempt}/${tries - 1}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

let cachedToken;
async function token() {
  if (cachedToken) return cachedToken;
  const res = await fetchRetry(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${ID}:${SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`token failed ${res.status}: ${body.error_description ?? body.error}`);
  cachedToken = { accessToken: body.access_token, scopes: body.scope.split(" "), appId: body.app_id };
  return cachedToken;
}

async function call(path, { method = "GET", body, headers = {} } = {}) {
  const { accessToken } = await token();
  const res = await fetchRetry(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, debugId: res.headers.get("paypal-debug-id"), json };
}

function show(label, result) {
  record(label, result);
  console.log(`\n== ${label}: HTTP ${result.status}`);
  console.log(JSON.stringify(result.json, null, 2));
}

const heirEmail = () => {
  const email = process.env.SANDBOX_HEIR_TOM_EMAIL;
  if (!email) throw new Error("Missing SANDBOX_HEIR_TOM_EMAIL in .env");
  return email;
};

const payoutBody = (amount, batchId) => ({
  sender_batch_header: {
    sender_batch_id: batchId,
    email_subject: "Sandbox proof payment",
    email_message: "Sandbox proof for the PayPal AI Hackathon.",
  },
  items: [
    {
      recipient_type: "EMAIL",
      amount: { value: Number(amount).toFixed(2), currency: "USD" },
      receiver: heirEmail(),
      note: "Sandbox proof",
      sender_item_id: `${batchId}-1`,
    },
  ],
});

const [command, arg] = process.argv.slice(2);

switch (command) {
  case "token": {
    const t = await token();
    const relevant = t.scopes.filter((s) => /payouts|payments|reporting|disputes|invoicing|subscriptions/i.test(s));
    record("token", { appId: t.appId, relevant });
    console.log("Token OK. App:", t.appId);
    console.log("Relevant scopes:\n" + relevant.join("\n"));
    break;
  }
  case "balances":
    show("balances", await call("/v1/reporting/balances?currency_code=USD"));
    break;
  case "order":
    {
      const result = await call("/v2/checkout/orders", {
        method: "POST",
        headers: { "PayPal-Request-Id": randomUUID() },
        body: {
          intent: "CAPTURE",
          purchase_units: [{ amount: { currency_code: "USD", value: "14.40" }, description: "Sandbox proof order" }],
          payment_source: {
            paypal: {
              experience_context: {
                user_action: "PAY_NOW",
                return_url: "https://example.com/approved",
                cancel_url: "https://example.com/cancelled",
              },
            },
          },
        },
      });
      show("order", result);
      const approve = result.json.links?.find((l) => l.rel === "payer-action" || l.rel === "approve");
      if (approve) console.log(`\nAPPROVE HERE, with the sandbox buyer login:\n${approve.href}`);
    }
    break;
  case "capture":
    show(
      "capture",
      await call(`/v2/checkout/orders/${arg}/capture`, {
        method: "POST",
        headers: { "PayPal-Request-Id": randomUUID() },
      }),
    );
    break;
  case "mock-capture":
    show(
      "mock-capture",
      await call(`/v2/checkout/orders/${arg}/capture`, {
        method: "POST",
        headers: {
          "PayPal-Request-Id": randomUUID(),
          "PayPal-Mock-Response": JSON.stringify({ mock_application_codes: "INSTRUMENT_DECLINED" }),
        },
      }),
    );
    break;
  case "payout":
    show(
      "payout",
      await call("/v1/payments/payouts", {
        method: "POST",
        body: payoutBody(arg ?? "25.00", `proof-${Date.now()}`),
      }),
    );
    break;
  case "payout-repeat": {
    // Same sender_batch_id twice: the second must not create a second payment.
    const id = `proof-repeat-${Date.now()}`;
    show("payout-repeat-1", await call("/v1/payments/payouts", { method: "POST", body: payoutBody("1.00", id) }));
    show("payout-repeat-2", await call("/v1/payments/payouts", { method: "POST", body: payoutBody("1.00", id) }));
    break;
  }
  case "topup": {
    // Refills the sandbox estate with PayPal's published sandbox test card. Fake money only.
    const result = await call("/v2/checkout/orders", {
      method: "POST",
      headers: { "PayPal-Request-Id": randomUUID() },
      body: {
        intent: "CAPTURE",
        purchase_units: [{ amount: { currency_code: "USD", value: Number(arg ?? "100").toFixed(2) }, description: "Sandbox balance refill" }],
        payment_source: {
          card: { number: "4111111111111111", expiry: "2030-12", security_code: "123", name: "Sandbox Refill" },
        },
      },
    });
    record("topup", { status: result.status, id: result.json.id, state: result.json.status, name: result.json.name, details: result.json.details });
    console.log("topup HTTP", result.status, result.json.id ?? "", result.json.status ?? result.json.name ?? "", JSON.stringify(result.json.details ?? ""));
    const caps = (result.json.purchase_units ?? []).flatMap((u) => u.payments?.captures ?? []);
    console.log(caps.map((c) => [c.id, c.status, c.amount.value, c.seller_receivable_breakdown?.paypal_fee?.value]));
    break;
  }
  case "get-order":
    show("get-order", await call(`/v2/checkout/orders/${arg}`));
    break;
  case "payout-status":
    show("payout-status", await call(`/v1/payments/payouts/${arg}`));
    break;
  case "search": {
    const end = new Date();
    const start = new Date(end.getTime() - 25 * 24 * 3600 * 1000);
    const q = new URLSearchParams({
      start_date: start.toISOString().replace(/\.\d+Z$/, "Z"),
      end_date: end.toISOString().replace(/\.\d+Z$/, "Z"),
      fields: "all",
      page_size: "20",
    });
    show("search", await call(`/v1/reporting/transactions?${q}`));
    break;
  }
  default:
    console.log("Commands: token | balances | order | capture <id> | mock-capture <id> | payout <amount> | payout-repeat | payout-status <id> | search");
}
