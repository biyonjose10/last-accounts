"use client";

import { useLayoutEffect, useRef, useState } from "react";

export interface Segment {
  value: string;
  label: string;
  disabled?: boolean;
  title?: string;
}

/** A row of choices. The dark thumb slides to the one chosen. */
export function Segmented({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: Segment[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = row.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`);
      setThumb(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [value, options.length]);

  return (
    <div className="segmented" role="radiogroup" aria-label={label} ref={row}>
      {thumb && <span aria-hidden className="segmented-thumb" style={{ transform: `translateX(${thumb.left}px)`, width: thumb.width }} />}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          data-value={o.value}
          title={o.title}
          className={o.value === value ? "on" : undefined}
          disabled={disabled || o.disabled}
          onClick={() => o.value !== value && onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
