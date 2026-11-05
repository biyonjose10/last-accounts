// A document goes in. Facts, a judgement and a next step come out. Money only moves through lib/payments.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { AiUnavailable, MODEL } from "@/lib/ai/gemini";
import {
  checkReading,
  guardAction,
  nextAction,
  parseStatedAmount,
  readDocument,
  triageClaim,
  triageWithoutAi,
  type CheckedReading,
} from "@/lib/ai/reader";
import { ClerkAction, Reading, Triage } from "@/lib/ai/schemas";
import type { Claim, ClaimCategory } from "@/lib/engine/types";
import { buildState } from "@/lib/ledger/state";
import { store, type Store } from "@/lib/ledger/store";
import { VISITOR_READS_PER_DAY } from "@/lib/limits";
import { approvalToken, pay } from "@/lib/payments";

export interface DocInfo {
  id: string;
  file: string;
  title: string;
  kind: "will" | "statement" | "asset" | "claim";
  creditor?: string;
  amountCents?: number;
  category?: ClaimCategory;
  receivedOn?: string;
  text: string;
}

const ROOT = path.join(process.cwd(), "fixtures");

export async function manifest(): Promise<DocInfo[]> {
  return JSON.parse(await readFile(path.join(ROOT, "docs", "manifest.json"), "utf8"));
}

/** Letters that arrive during the demo, rather than being in the pile from the start. */
export const INCOMING = new Set(["filing", "northgate"]);

export const VISITOR_LIVE_READS = 4;
export const DAILY_LIVE_READS = 60;

interface Saved {
  model: string;
  recordedAt: string;
  reading: Reading;
  triage?: Triage;
  action?: ClerkAction;
}

async function savedReading(id: string): Promise<Saved | null> {
  try {
    return JSON.parse(await readFile(path.join(ROOT, "readings", `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}

export type ReadVia = "live" | "saved" | "none";

export interface ReadOptions {
  /** Fault drill: treat the AI as down. */
  aiOff?: boolean;
  /** Hashed visitor, so clearing cookies doesn't reset the limit. */
  visitor?: string;
  store?: Store;
}

export async function processDocument(workspace: string, docId: string, opts: ReadOptions = {}) {
  const s = opts.store ?? store();
  const doc = (await manifest()).find((d) => d.id === docId);
  if (!doc) return { ok: false as const, error: "Unknown document." };

  const events = await s.list(workspace);
  const done = events.find((e) => e.type === "document_read" && e.data.docId === docId);
  if (done && !opts.aiOff) {
    // If an earlier attempt stopped after reading but before logging the claim, finish that step.
    const claimLogged = events.some((e) => e.type === "claim_added" && e.data.claim?.id === docId);
    if (INCOMING.has(docId) && !claimLogged) {
      const saved = await savedReading(docId);
      const checked = saved ? checkReading(saved.reading, doc.text) : null;
      await handleIncoming(s, workspace, doc, checked, saved, "saved", false);
    }
    return { ok: true as const, duplicate: true, event: done };
  }

  // Limits are checked first, and a saved reading from a real run takes over when they're reached.
  const day = new Date().toISOString().slice(0, 10);
  const mayGoLive =
    !opts.aiOff &&
    (await s.bump(`reads:${workspace}`, VISITOR_LIVE_READS)) &&
    (await s.bump(`reads:${opts.visitor ?? "unknown"}:${day}`, VISITOR_READS_PER_DAY)) &&
    (await s.bump(`reads:${day}`, DAILY_LIVE_READS));

  let checked: CheckedReading | null = null;
  let via: ReadVia = "none";
  let failure: string | undefined;
  const saved = await savedReading(docId);

  if (mayGoLive) {
    try {
      const bytes = await readFile(path.join(ROOT, "docs", doc.file));
      checked = await readDocument({ mimeType: "image/png", base64: bytes.toString("base64") }, doc.text);
      via = "live";
    } catch (err) {
      if (!(err instanceof AiUnavailable)) throw err;
      failure = err.message;
    }
  } else {
    failure = opts.aiOff ? "AI switched off for this drill." : "Live reading limit reached for now.";
  }
  if (!checked && saved) {
    checked = checkReading(saved.reading, doc.text);
    via = "saved";
  }

  await s.append(
    workspace,
    "document_read",
    {
      docId,
      title: doc.title,
      via,
      failure,
      model: via === "live" ? MODEL : saved?.model,
      recordedAt: via === "saved" ? saved?.recordedAt : undefined,
      summary: checked?.reading.summary,
      facts: checked?.facts ?? [],
      suspiciousText: checked?.suspiciousText ?? [],
      simulated: Boolean(opts.aiOff),
    },
    `read:${docId}:${via}:${opts.aiOff ? "drill" : "normal"}`,
  );

  if (INCOMING.has(docId)) await handleIncoming(s, workspace, doc, checked, saved, via, Boolean(opts.aiOff));
  return { ok: true as const, duplicate: false, via, failure };
}

async function handleIncoming(
  s: Store,
  workspace: string,
  doc: DocInfo,
  checked: CheckedReading | null,
  saved: Saved | null,
  via: ReadVia,
  aiOff: boolean,
) {
  const state = buildState(await s.list(workspace));
  if (state.claims.some((c) => c.id === doc.id)) return;

  const claimFacts = checked?.reading.claim;
  // Without a usable reading, take the figure from the known paperwork, and hold it for a person.
  const amount = checked?.amountCents ?? (claimFacts ? parseStatedAmount(claimFacts.statedAmount) : null) ?? doc.amountCents ?? 0;

  let triage: Triage;
  let action: ClerkAction;
  const aiWorking = via === "live";
  try {
    if (!claimFacts || !aiWorking) throw new AiUnavailable("No live reading.", "MODEL_ERROR");
    triage = await triageClaim({
      claim: claimFacts,
      amountVerified: checked?.amountVerified ?? false,
      suspiciousText: checked?.suspiciousText ?? [],
      facts: checked?.facts.map((f) => ({ label: f.label, value: f.value })) ?? [],
      today: state.asOf,
      knownCreditors: state.claims.map((c) => c.creditor),
    });
  } catch (err) {
    if (!(err instanceof AiUnavailable)) throw err;
    // Saved judgements are used only when the AI is limited, not during an AI-off drill.
    triage = !aiOff && saved?.triage ? saved.triage : triageWithoutAi();
  }

  const claim: Claim = {
    id: doc.id,
    creditor: claimFacts?.creditor ?? doc.creditor ?? doc.title,
    amountCents: amount,
    category: claimFacts?.category ?? doc.category ?? "other",
    triage: triage.triage,
    receivedOn: state.asOf,
    paidCents: 0,
  };

  const today = state.events
    .filter((e) => e.type === "payment_requested" && e.data.auto)
    .reduce((sum, e) => sum + (e.data.amountCents as number), 0);

  try {
    if (!aiWorking) throw new AiUnavailable("No live reading.", "MODEL_ERROR");
    action = guardAction(await nextAction(claim, triage), claim, today);
  } catch (err) {
    if (!(err instanceof AiUnavailable)) throw err;
    action =
      !aiOff && saved?.action
        ? guardAction(saved.action, claim, today)
        : { action: "ask_dana", reason: "The AI is unavailable, so this waits for Dana. No money moves." };
  }

  await s.append(workspace, "claim_added", { claim, reason: triage.reasons.join(" "), triage: triage.triage }, `claim:${doc.id}`);
  await s.append(workspace, "agent_note", { text: `${action.reason}`, action: action.action, docId: doc.id });

  if (action.action === "pay_administration_cost") {
    const after = await s.list(workspace);
    const v = after.filter((e) => e.type === "payment_requested").length;
    const target = { kind: "claim" as const, id: claim.id };
    await pay(workspace, target, claim.amountCents, approvalToken(workspace, target, claim.amountCents, v), v, { auto: true, store: s });
  }
}
