// Saves the latest complete real run as the replay. Only PayPal IDs and fictional names are in it.
// Run: npx --yes tsx --env-file=.env.local scripts/export-replay.ts

import { mkdirSync, writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);
  const found = await sql`
    SELECT workspace FROM ledger_events WHERE type = 'order_captured'
    AND workspace IN (SELECT workspace FROM ledger_events WHERE type = 'date_advanced')
    ORDER BY seq DESC LIMIT 1`;
  if (!found[0]) throw new Error("No complete run found.");
  const rows = await sql`SELECT seq, at, type, data, key FROM ledger_events WHERE workspace = ${found[0].workspace} ORDER BY seq`;
  // Renumbered, and without the workspace ID or idempotency keys.
  const events = rows.map((r, i) => ({ seq: i + 1, at: new Date(r.at).toISOString(), type: r.type, data: r.data, key: null }));
  mkdirSync("fixtures/replay", { recursive: true });
  writeFileSync("fixtures/replay/run.json", JSON.stringify(events, null, 1));
  const count = (t: string) => events.filter((e) => e.type === t).length;
  console.log(`events ${events.length}, payments ${count("payment_requested")}, settled ${count("payment_settled")}, failed ${count("payment_failed")}, captured ${count("order_captured")}, webhooks ${count("webhook_received")}`);
}

main();
