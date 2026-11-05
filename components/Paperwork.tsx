"use client";

import { useEffect, useMemo, useState } from "react";
import { usd } from "@/lib/ledger/describe";
import type { EstateState } from "@/lib/ledger/state";
import { AgentLimits } from "./AgentLimits";

interface DocEntry {
  id: string;
  title: string;
  kind: string;
  incoming: boolean;
}

export function Paperwork({ state, aiOff, onChange }: { state: EstateState; aiOff: boolean; onChange: () => Promise<unknown> }) {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/docs").then((r) => r.json()).then(setDocs).catch(() => {});
  }, []);

  const reads = useMemo(() => {
    const map = new Map<string, any>();
    for (const e of state.events) if (e.type === "document_read") map.set(e.data.docId, e.data);
    return map;
  }, [state.events]);

  async function read(docId: string) {
    setBusy(true);
    setSelected(docId);
    try {
      await fetch("/api/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId, aiOff }),
      });
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  const current = selected ? docs.find((d) => d.id === selected) : undefined;
  const reading = selected ? reads.get(selected) : undefined;
  const claim = selected ? state.claims.find((c) => c.id === selected) : undefined;
  const pile = docs.filter((d) => !d.incoming);
  const incoming = docs.filter((d) => d.incoming);

  const tag = (r: any) =>
    !r ? null : r.suspiciousText?.length ? (
      <span className="badge stop">Warning</span>
    ) : r.via === "live" ? (
      <span className="badge paid">Read by Gemini</span>
    ) : r.via === "saved" ? (
      <span className="badge sent">Saved reading</span>
    ) : (
      <span className="badge owed">Not read</span>
    );

  const row = (d: DocEntry) => {
    const r = reads.get(d.id);
    return (
      <li key={d.id} className={selected === d.id ? "on" : undefined}>
        <button className="doc-pick" onClick={() => setSelected(d.id)} aria-current={selected === d.id ? "true" : undefined}>
          {d.title}
        </button>
        {r ? (
          tag(r)
        ) : (
          <button className="link" disabled={busy} onClick={() => read(d.id)}>
            {d.incoming ? "Open and read" : "Read"}
          </button>
        )}
      </li>
    );
  };

  return (
    <section id="paperwork" aria-labelledby="paper-heading">
      <div className="section-head"><h2 id="paper-heading">The paperwork</h2></div>
      <p className="section-note">
        Gemini reads each page. Every fact has to quote the page, and we check the quote. It reads the paper, code decides the money. Please don&apos;t add real documents: this demo is for fictional ones.
      </p>
      <AgentLimits state={state} />
      <div className="paper-grid">
        <div className="doc-lists">
          <p className="list-title">Arrived with the case</p>
          <ul className="doc-list">{pile.map(row)}</ul>
          <p className="list-title">New in the post</p>
          <ul className="doc-list">{incoming.map(row)}</ul>
        </div>
        <div className="reading-pane" aria-live="polite">
          {!current && <p className="empty">Choose a document to see the page and what was read from it.</p>}
          {current && (
            <div className="swap" key={current.id}>
              <div className="reading-head">
                {tag(reading) ?? <span className="badge owed">Not read yet</span>}
                <h3>{current.title}</h3>
                {claim && reading && (
                  <p className="reading-result">
                    <span className="money big">{usd(claim.amountCents)}</span>
                    <span>
                      {claim.triage === "valid" && "Accepted as a claim."}
                      {claim.triage === "needs_proof" && "Reserved until there's proof."}
                      {claim.triage === "suspected_fake" && "Suspected fake. Reserved, and not paid."}
                    </span>
                  </p>
                )}
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/docs/${current.id}`} alt={`Page: ${current.title}`} className="page-img" />
              {busy && selected === current.id && <p className="section-note">Reading the page…</p>}
              {reading?.failure && (
                <div className="notice fail">
                  <p>
                    {reading.simulated ? "Simulated: " : ""}{reading.failure}{" "}
                    {reading.via === "saved" ? "Showing a saved reading from an earlier real run." : ""} Money stays held.
                  </p>
                </div>
              )}
              {reading?.via === "saved" && !reading.failure && (
                <p className="section-note">Saved reading from a real run{reading.recordedAt ? ` on ${reading.recordedAt.slice(0, 10)}` : ""}.</p>
              )}
              {reading?.summary && <p>{reading.summary}</p>}
              {reading?.suspiciousText?.length > 0 && (
                <div className="notice stop" role="alert">
                  <p><strong>This letter tries to instruct software.</strong></p>
                  {reading.suspiciousText.map((t: string, i: number) => <blockquote key={i} className="quote bad">&ldquo;{t}&rdquo;</blockquote>)}
                  <p>Ignored. The AI can&apos;t approve a payment, and this is now on the record.</p>
                </div>
              )}
              {reading?.facts?.length > 0 && (
                <>
                  <p className="list-title">What was read, and where it says so</p>
                  <ul className="facts">
                    {reading.facts.map((f: any, i: number) => (
                      <li key={i}>
                        <span className={`dot ${f.verified ? "ok" : "bad"}`} aria-hidden />
                        <div>
                          <strong>{f.label}:</strong> {f.value}
                          <blockquote className={f.verified ? "quote ok" : "quote bad"}>
                            &ldquo;{f.quote}&rdquo; <span className="tag">{f.verified ? "On the page" : "Not on the page, ignored"}</span>
                          </blockquote>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
