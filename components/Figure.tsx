"use client";

import { useEffect, useRef, useState } from "react";
import { usd } from "@/lib/ledger/describe";

/** Shows a figure. When it changes, the old one stays on the page, struck through. */
export function Figure({ cents, className = "figure" }: { cents: number; className?: string }) {
  const last = useRef(cents);
  const [previous, setPrevious] = useState<number | null>(null);

  useEffect(() => {
    if (last.current !== cents) {
      setPrevious(last.current);
      last.current = cents;
    }
  }, [cents]);

  return (
    <>
      {previous !== null && (
        <span key={previous} className="struck" aria-label={`was ${usd(previous)}`}>
          {usd(previous)}
        </span>
      )}
      <span className={className}>{usd(cents)}</span>
    </>
  );
}
