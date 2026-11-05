// Runs Gemini once over each fictional document and saves the result, for use when the AI is unavailable.
// Run: npx --yes tsx --env-file=.env scripts/record-readings.ts
// Uses about 14 free-tier calls. Skips documents already recorded.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MODEL } from "../lib/ai/gemini";
import { guardAction, nextAction, readDocument, triageClaim } from "../lib/ai/reader";
import type { Claim } from "../lib/engine/types";
import { claims as seedClaims } from "../fixtures/scenario";

const INCOMING = new Set(["filing", "northgate"]);
const root = path.join(process.cwd(), "fixtures");
const out = path.join(root, "readings");
mkdirSync(out, { recursive: true });

const docs = JSON.parse(readFileSync(path.join(root, "docs", "manifest.json"), "utf8"));

async function main() {
for (const doc of docs) {
  const file = path.join(out, `${doc.id}.json`);
  if (existsSync(file)) {
    console.log(`${doc.id}: already recorded`);
    continue;
  }
  const bytes = readFileSync(path.join(root, "docs", doc.file));
  const checked = await readDocument({ mimeType: "image/png", base64: bytes.toString("base64") }, doc.text);
  const record: Record<string, unknown> = { model: MODEL, recordedAt: new Date().toISOString(), reading: checked.reading };

  const unverified = checked.facts.filter((f) => !f.verified).length;
  console.log(`${doc.id}: ${checked.reading.documentType}, ${checked.facts.length} facts, ${unverified} unverified, amount ${checked.amountCents} (verified ${checked.amountVerified}), software text ${checked.suspiciousText.length}`);

  if (INCOMING.has(doc.id) && checked.reading.claim) {
    const triage = await triageClaim({
      claim: checked.reading.claim,
      amountVerified: checked.amountVerified,
      suspiciousText: checked.suspiciousText,
      facts: checked.facts.map((f) => ({ label: f.label, value: f.value })),
      today: "2026-10-21",
      knownCreditors: seedClaims.map((c) => c.creditor),
    });
    const claim: Claim = {
      id: doc.id,
      creditor: checked.reading.claim.creditor,
      amountCents: checked.amountCents ?? 0,
      category: checked.reading.claim.category,
      triage: triage.triage,
      receivedOn: "2026-10-06",
      paidCents: 0,
    };
    const action = guardAction(await nextAction(claim, triage), claim, 0);
    record.triage = triage;
    record.action = action;
    console.log(`  triage: ${triage.triage}: ${triage.reasons.join(" / ")}`);
    console.log(`  next: ${action.action}: ${action.reason}`);
  }
  writeFileSync(file, JSON.stringify(record, null, 2));
}
}

main();
