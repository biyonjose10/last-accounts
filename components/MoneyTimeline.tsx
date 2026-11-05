"use client";

// Who gets paid, and when. Every bar comes from the ledger; nothing here is estimated.
//
// Bryntum Scheduler Community has no TimeRanges feature (that is a paid tier), so the
// shared band and the Today line are our own elements, placed with getCoordinateFromDate.

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Scheduler, ViewPresetConfig } from "@bryntum/scheduler-community";
import { START_DATE } from "@/fixtures/scenario";
import { longDate, usd } from "@/lib/ledger/describe";
import type { EstateState, Target } from "@/lib/ledger/state";
import "@/app/timeline.css";

// Bryntum touches the browser as soon as it loads, so it must never load on the server.
const BryntumScheduler = dynamic(
  () => import("@bryntum/scheduler-react-community").then((m) => m.BryntumScheduler),
  { ssr: false },
);

/** Room for a label such as "Paid $98,800.00" at the narrowest tick width. */
const LABEL_DAYS = 19;
const RESERVED_LABEL_DAYS = 32;

interface Row {
  id: string;
  name: string;
}

interface Bar {
  id: string;
  resourceId: string;
  name: string;
  startDate: string;
  endDate: string;
  cls: string;
  tip: string;
}

interface Model {
  rows: Row[];
  bars: Bar[];
  axisStart: string;
  axisEnd: string;
  bandStart: string;
  bandEnd: string;
  today: string;
  todayLabel: string;
}

const addDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
// A date's position on the chart is its midday, so a Paid bar ending today meets the Today line.
const noon = (iso: string) => `${iso}T12:00:00`;
const dayStart = (iso: string) => `${iso}T00:00:00`;
const later = (a: string, b: string) => (a > b ? a : b);
const earlier = (a: string, b: string) => (a < b ? a : b);
const rowId = (t: Target) => `${t.kind}:${t.id}`;

/** The simulated date on which each payment was requested and settled, from the event order. */
function paymentDates(state: EstateState) {
  const requested = new Map<string, string>();
  const settled = new Map<string, string>();
  let date = START_DATE;
  for (const e of state.events) {
    if (e.type === "date_advanced") date = e.data.to;
    else if (e.type === "payment_requested") requested.set(e.data.ledgerId, date);
    else if (e.type === "payment_settled") settled.set(e.data.ledgerId, date);
  }
  return { requested, settled };
}

function buildModel(state: EstateState): Model {
  const { plan, asOf, facts } = state;
  const closes = plan.windowClosesOn;
  const closeEdge = dayStart(addDays(closes, 1));
  const bars: Bar[] = [];

  const rows: Row[] = plan.heirs.map((h) => ({ id: `heir:${h.heirId}`, name: h.name }));
  const seen = new Set<string>();
  for (const l of plan.claimLines) {
    if (seen.has(l.claimId)) continue;
    seen.add(l.claimId);
    rows.push({ id: `claim:${l.claimId}`, name: l.creditor });
  }

  // Money that moved, one bar per person per date. A Paid bar ends on the day it happened.
  const { requested, settled } = paymentDates(state);
  const moved = new Map<string, { kind: "paid" | "sent"; row: string; payee: string; date: string; cents: number }>();
  for (const p of state.payments) {
    if (p.status === "failed") continue;
    const kind = p.status === "paid" ? "paid" : "sent";
    const date = (kind === "paid" ? settled.get(p.ledgerId) : undefined) ?? requested.get(p.ledgerId) ?? asOf;
    const key = `${kind}:${rowId(p.target)}:${date}`;
    const entry = moved.get(key) ?? { kind, row: rowId(p.target), payee: p.payee, date, cents: 0 };
    entry.cents += p.amountCents;
    moved.set(key, entry);
  }
  for (const [id, m] of moved) {
    bars.push({
      id,
      resourceId: m.row,
      name: `${m.kind === "paid" ? "Paid" : "Sent"} ${usd(m.cents)}`,
      startDate: noon(addDays(m.date, -LABEL_DAYS)),
      endDate: noon(m.date),
      cls: m.kind === "paid" ? "mt-paid" : "mt-sent",
      tip:
        m.kind === "paid"
          ? `Paid ${usd(m.cents)} to ${m.payee} on ${longDate(m.date)}.`
          : `${usd(m.cents)} sent to ${m.payee} on ${longDate(m.date)}. Waiting for PayPal to confirm it.`,
    });
  }

  // Heir money still due. It runs from today to the close of the window.
  for (const h of plan.heirs) {
    const due = h.entitledCents - h.distributedCents;
    if (due <= 0) continue;
    bars.push({
      id: `held:${h.heirId}`,
      resourceId: `heir:${h.heirId}`,
      name: `${plan.windowOpen ? "Held" : "Due"} ${usd(due)}`,
      startDate: noon(asOf),
      endDate: later(closeEdge, noon(addDays(asOf, LABEL_DAYS))),
      cls: "mt-held",
      tip: `${usd(due)} still due to ${h.name}: ${usd(h.safeNowCents)} safe today, ${usd(h.heldBackCents)} held back.`,
    });
  }

  // What each creditor is owed, added up across the parts of a claim.
  const received = (id: string) => state.claims.find((c) => c.id === id)?.receivedOn ?? asOf;
  for (const row of rows) {
    if (!row.id.startsWith("claim:")) continue;
    const claimId = row.id.slice("claim:".length);
    const lines = plan.claimLines.filter((l) => l.claimId === claimId);
    const sum = (status: string) => lines.filter((l) => l.status === status).reduce((s, l) => s + l.owedCents, 0);
    const since = received(claimId);

    const owed = sum("payable");
    if (owed > 0) {
      const start = earlier(since, asOf);
      bars.push({
        id: `owed:${claimId}`,
        resourceId: row.id,
        name: `Owed ${usd(owed)}`,
        startDate: noon(start),
        endDate: noon(later(asOf, addDays(start, LABEL_DAYS))),
        cls: "mt-owed",
        tip: `${usd(owed)} owed to ${row.name}, filed ${longDate(since)}.`,
      });
    }
    const reserved = sum("held");
    if (reserved > 0) {
      bars.push({
        id: `reserved:${claimId}`,
        resourceId: row.id,
        name: `Reserved, not paid ${usd(reserved)}`,
        startDate: noon(since),
        endDate: later(later(closeEdge, noon(asOf)), noon(addDays(since, RESERVED_LABEL_DAYS))),
        cls: "mt-stop",
        tip: lines.find((l) => l.status === "held")?.reason?.message ?? `${usd(reserved)} reserved, not paid.`,
      });
    }
    const barred = sum("barred");
    if (barred > 0) {
      bars.push({
        id: `barred:${claimId}`,
        resourceId: row.id,
        name: `Out of time ${usd(barred)}`,
        startDate: noon(since),
        endDate: noon(addDays(since, LABEL_DAYS)),
        cls: "mt-barred",
        tip: lines.find((l) => l.status === "barred")?.reason?.message ?? `${usd(barred)} filed out of time.`,
      });
    }
  }

  // The chart always holds the whole window, today and every bar.
  const bandStart = dayStart(facts.noticePublishedOn);
  const first = bars.reduce((min, b) => earlier(min, b.startDate), bandStart).slice(0, 10);
  const last = bars.reduce((max, b) => later(max, b.endDate), later(closeEdge, noon(asOf))).slice(0, 10);

  return {
    rows,
    bars,
    axisStart: dayStart(first),
    axisEnd: dayStart(addDays(last, 1)),
    bandStart,
    bandEnd: closeEdge,
    today: noon(asOf),
    todayLabel: state.simulatedDate ? "Today (simulated)" : "Today",
  };
}

/** Finds or makes one of our own elements inside a Bryntum element. */
function mark(parent: Element, className: string, text?: string) {
  let el = parent.querySelector<HTMLElement>(`:scope > .${className}`);
  if (!el) {
    el = document.createElement("div");
    el.className = className;
    el.setAttribute("aria-hidden", "true");
    parent.appendChild(el);
  }
  if (text !== undefined && el.textContent !== text) el.textContent = text;
  return el;
}

/** Draws the band and the Today line in the body, and their labels in the empty top header row. */
function paintMarks(scheduler: Scheduler, model: Model) {
  if (scheduler.isDestroyed) return;
  const body = scheduler.timeAxisSubGridElement?.querySelector(".b-sch-foreground-canvas")?.parentElement;
  const head = scheduler.timeAxisColumn?.element;
  if (!body || !head) return;

  const x = (date: string) => scheduler.getCoordinateFromDate(new Date(date), true) as number;
  const bandLeft = x(model.bandStart);
  const bandWidth = x(model.bandEnd) - bandLeft;
  const todayLeft = x(model.today);

  const band = mark(body, "mt-band");
  band.style.left = `${bandLeft}px`;
  band.style.width = `${bandWidth}px`;
  mark(body, "mt-today").style.left = `${todayLeft}px`;

  const bandHead = mark(head, "mt-band-head", "Creditors can file claims");
  bandHead.style.left = `${bandLeft}px`;
  bandHead.style.width = `${bandWidth}px`;
  const todayHead = mark(head, "mt-today-head", model.todayLabel);
  todayHead.style.left = `${todayLeft}px`;
  // Near the right edge the label sits to the left of its line, so it never clips.
  todayHead.classList.toggle("mt-flip", todayLeft + 130 > x(model.axisEnd));
}

const preset: ViewPresetConfig = {
  id: "moneyTimelineWeeks",
  name: "Weeks",
  tickWidth: 44,
  displayDateFormat: "ll",
  shiftUnit: "week",
  shiftIncrement: 1,
  defaultSpan: 16,
  timeResolution: { unit: "day", increment: 1 },
  // The empty top row holds the band and Today labels.
  headers: [
    { unit: "year", renderer: () => "" },
    { unit: "week", dateFormat: "MMM D" },
  ],
};

// The product has one motion, the strike-through. Bars change in place, without animating.
const noMotion = { removeEvent: false, changeEvent: false, insertRecord: false, removeRecord: false };

const eventTooltip = {
  template: ({ eventRecord }: { eventRecord: { get: (field: string) => unknown } }) => ({
    tag: "span",
    text: String(eventRecord.get("tip")),
  }),
};

export function MoneyTimeline({ state }: { state: EstateState }) {
  // Polling hands us a new state object every few seconds. Only real changes reach Bryntum.
  const signature = JSON.stringify(buildModel(state));
  const model = useMemo(() => JSON.parse(signature) as Model, [signature]);

  const modelRef = useRef(model);
  const schedulerRef = useRef<Scheduler | null>(null);
  const axisRef = useRef(`${model.axisStart}|${model.axisEnd}`);
  // Read once at mount. These only seed Bryntum's first render; later changes go through setTimeSpan.
  const [firstSpan] = useState(() => ({ start: new Date(model.axisStart), end: new Date(model.axisEnd) }));
  const [columns] = useState(() => {
    const narrow = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
    return [{ text: "Who", field: "name", width: narrow ? 128 : 248, sortable: false, cellCls: "mt-who" }];
  });

  const repaint = useCallback(({ source }: { source?: unknown }) => {
    const scheduler = source as Scheduler | undefined;
    if (!scheduler) return;
    schedulerRef.current = scheduler;
    paintMarks(scheduler, modelRef.current);
  }, []);

  useEffect(() => {
    modelRef.current = model;
    const scheduler = schedulerRef.current;
    if (!scheduler || scheduler.isDestroyed) return;
    const axis = `${model.axisStart}|${model.axisEnd}`;
    if (axis !== axisRef.current) {
      axisRef.current = axis;
      scheduler.setTimeSpan(new Date(model.axisStart), new Date(model.axisEnd));
    }
    paintMarks(scheduler, model);
  }, [model]);

  return (
    <div className="money-timeline">
      <p className="section-note">Each Paid bar ends on the day the money moved.</p>
      <div className="money-timeline-chart">
        <BryntumScheduler
          ariaLabel="Timeline of who gets paid, and when"
          height={338}
          rowHeight={32}
          barMargin={4}
          resourceMargin={0}
          eventStyle="filled"
          eventLayout="stack"
          viewPreset={preset}
          startDate={firstSpan.start}
          endDate={firstSpan.end}
          columns={columns}
          resources={model.rows}
          events={model.bars}
          readOnly
          useInitialAnimation={false}
          transition={noMotion}
          eventSelectionDisabled
          zoomOnMouseWheel={false}
          zoomOnTimeAxisDoubleClick={false}
          eventDragFeature={false}
          eventDragCreateFeature={false}
          eventResizeFeature={false}
          eventEditFeature={false}
          eventMenuFeature={false}
          scheduleMenuFeature={false}
          scheduleTooltipFeature={false}
          timeAxisHeaderMenuFeature={false}
          resourceMenuFeature={false}
          headerMenuFeature={false}
          cellMenuFeature={false}
          cellEditFeature={false}
          columnPickerFeature={false}
          columnReorderFeature={false}
          columnResizeFeature={false}
          regionResizeFeature={false}
          sortFeature={false}
          stripeFeature={false}
          dependenciesFeature={false}
          eventTooltipFeature={eventTooltip}
          onPaint={repaint}
          onTimeAxisChange={repaint}
          onTimelineViewportResize={repaint}
        />
      </div>
    </div>
  );
}
