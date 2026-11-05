// Florida rules, each tied to the text it comes from. Read from primary sources on 5 Nov 2026.
// Not legal advice. A demonstration of one state's rules, for use alongside a lawyer.

import type { ClaimCategory, Citation, Cents, IsoDate } from "./types";

const fl = (section: string): Citation => {
  const chapter = section.slice(0, 3);
  return {
    source: `Fla. Stat. ${section}`,
    url: `http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0${chapter}/Sections/0${section}.html`,
  };
};

export const CITE = {
  paymentOrder: fl("733.707"),
  claimWindow: fl("733.702"),
  abatement: fl("733.805"),
  fiduciaryLiability: fl("733.609"),
  improperDistribution: fl("733.812"),
  federalPriority: {
    source: "31 U.S.C. 3713(b)",
    url: "https://www.law.cornell.edu/uscode/text/31/3713",
  } satisfies Citation,
};

export const POLICY = { source: "Last Accounts prudence policy" as const, url: null };

/** 733.707(1)(b): funeral, burial and grave marker expenses, aggregate cap. */
export const FUNERAL_CAP_CENTS: Cents = 600_000;

/** Our own margin for claims not yet seen, while the window is open. This is policy, not law. */
export const CONTINGENCY_BPS = 2_000;

const CLASS_OF: Record<ClaimCategory, number> = {
  administration: 1,
  funeral: 2,
  federal: 3,
  last_illness: 4,
  family_allowance: 5,
  child_support: 6,
  business_continuation: 7,
  other: 8,
};

/** Splits a claim across classes. Funeral costs above the cap fall to Class 8 under 733.707(1)(h). */
export function classify(
  category: ClaimCategory,
  amountCents: Cents,
  funeralCapLeft: Cents,
): { class: number; amountCents: Cents }[] {
  if (category !== "funeral") return [{ class: CLASS_OF[category], amountCents }];
  const inClass2 = Math.min(amountCents, funeralCapLeft);
  const parts: { class: number; amountCents: Cents }[] = [];
  if (inClass2 > 0) parts.push({ class: 2, amountCents: inClass2 });
  if (amountCents > inClass2) parts.push({ class: 8, amountCents: amountCents - inClass2 });
  return parts;
}

/** Adds calendar months, clamping to the last day of the target month. */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/** 733.702(1): the later of 3 months after first publication or 30 days after service. */
export function claimDeadline(noticePublishedOn: IsoDate, servedOn?: IsoDate): IsoDate {
  const general = addMonths(noticePublishedOn, 3);
  if (!servedOn) return general;
  const served = addDays(servedOn, 30);
  return served > general ? served : general;
}

/** The general window for creditors not individually served. */
export function windowCloses(noticePublishedOn: IsoDate): IsoDate {
  return claimDeadline(noticePublishedOn);
}
