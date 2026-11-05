"use client";

import { useEffect, useMemo, useState } from "react";
import { usd } from "@/lib/ledger/describe";
import type { EstateState } from "@/lib/ledger/state";

interface DocEntry {
  id: string;
  title: string;
  kind: string;
  incoming: boolean;
}

export function Paperwork({ state, aiOff, onChange }: { state: EstateState; aiOff: boolean; onChange: () => Promise<void> }) {
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

  const row = (d: DocEntry) => {
    const r = reads.get(d.id);
    return (
      <tr key={d.id} className={selected === d.id ? "selected" : undefined}>
        <td>
          <button className="link doc-title" onClick={() => setSelected(d.id)}>{d.title}</button>
        </td>
        <td>
          {r ? (
            <span className={r.suspiciousText?.length ? "state stop" : "state paid"}>
              {r.via === "live" ? "Read by Gemini" : r.via === "saved" ? "Saved reading" : "Not read"}
              {r.suspiciousText?.length ? ", warning" : ""}
            </span>
          ) : (
            <button className="link" disabled={busy} onClick={() => read(d.id)}>
              {d.incoming ? "Open and read" : "Read"}
            </button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <section aria-labelledby="paper-heading">
      <div className="section-head"><h2 id="paper-heading">The paperwork</h2></div>
      <p className="section-note">
        Gemini reads each page. Every fact has to quote the page, and we check the quote. It reads the paper, code decides the money. Please don&apos;t add real documents: this demo is for fictional ones.
      </p>
      <div className="paper-grid">
        <div>
          <table className="ledger">
            <thead><tr><th>Arrived with the case</th><th>Reading</th></tr></thead>
            <tbody>{pile.map(row)}</tbody>
          </table>
          <table className="ledger" style={{ marginTop: 16 }}>
            <thead><tr><th>New in the post</th><th>Reading</th></tr></thead>
            <tbody>{incoming.map(row)}</tbody>
          </table>
        </div>
        <div className="reading-pane" aria-live="polite">
          {!current && <p className="section-note">Choose a document to see the page and what was read from it.</p>}
          {current && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/docs/${current.id}`} alt={`Page: ${current.title}`} className="page" />
              {busy && selected === current.id && <p className="section-note">Reading the page…</p>}
              {reading?.failure && (
                <div className="fail-panel">
                  {reading.simulated ? "Simulated: " : ""}{reading.failure}{" "}
                  {reading.via === "saved" ? "Showing a saved reading from an earlier real run." : ""} Money stays held.
                </div>
              )}
              {reading?.via === "saved" && !reading.failure && (
                <p className="section-note">Saved reading from a real run{reading.recordedAt ? ` on ${reading.recordedAt.slice(0, 10)}` : ""}.</p>
              )}
              {reading?.summary && <p>{reading.summary}</p>}
              {reading?.facts?.length > 0 && (
                <ul className="facts">
                  {reading.facts.map((f: any, i: number) => (
                    <li key={i}>
                      <strong>{f.label}:</strong> {f.value}
                      <blockquote className={f.verified ? "quote ok" : "quote bad"}>
                        &ldquo;{f.quote}&rdquo; <span className="tag">{f.verified ? "On the page" : "Not on the page, ignored"}</span>
                      </blockquote>
                    </li>
                  ))}
                </ul>
              )}
              {reading?.suspiciousText?.length > 0 && (
                <div className="stop-panel" role="alert">
                  <h3>This letter tries to instruct software.</h3>
                  {reading.suspiciousText.map((t: string, i: number) => <blockquote key={i} className="quote bad">&ldquo;{t}&rdquo;</blockquote>)}
                  <p>Ignored. The AI can&apos;t approve a payment, and this is now on the record.</p>
                </div>
              )}
              {claim && reading && (
                <p>
                  <strong>Result:</strong>{" "}
                  {claim.triage === "valid" && `Accepted as a claim for ${usd(claim.amountCents)}.`}
                  {claim.triage === "needs_proof" && `${usd(claim.amountCents)} reserved until there's proof.`}
                  {claim.triage === "suspected_fake" && `Suspected fake. ${usd(claim.amountCents)} reserved, and not paid.`}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
