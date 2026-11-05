// The fictional Calloway estate. No real person, firm or debt.

import type { Claim, EstateFacts } from "@/lib/engine/types";

export const START_DATE = "2026-10-05";
export const AFTER_WINDOW_DATE = "2026-12-02";

export const estate: EstateFacts = {
  decedent: "Ruth Calloway",
  state: "FL",
  dateOfDeath: "2026-03-14",
  noticePublishedOn: "2026-09-01",
  cashCents: 19_760_000,
  otherAssets: [{ id: "car", name: "2019 hatchback", valueCents: 1_440_000 }],
  heirs: [
    { id: "dana", name: "Dana Calloway", country: "US" },
    { id: "tom", name: "Tom Calloway", country: "US" },
    { id: "aoife", name: "Aoife Calloway", country: "IE" },
  ],
  devises: [
    { kind: "general", heirId: "aoife", amountCents: 1_000_000 },
    { kind: "residuary", heirId: "dana", shareBps: 5_000 },
    { kind: "residuary", heirId: "tom", shareBps: 5_000 },
  ],
  distributedCents: {},
};

export const claims: Claim[] = [
  { id: "lawyer", creditor: "Probate attorney and filing costs", amountCents: 385_000, category: "administration", triage: "valid", receivedOn: "2026-09-02", paidCents: 0 },
  { id: "funeral", creditor: "Bayview Funeral Home", amountCents: 824_000, category: "funeral", triage: "valid", receivedOn: "2026-09-10", paidCents: 0 },
  { id: "tax", creditor: "US Treasury, final income tax", amountCents: 190_000, category: "federal", triage: "valid", receivedOn: "2026-09-15", paidCents: 0 },
  { id: "hospital", creditor: "St. Brendan Hospital, last illness", amountCents: 1_260_000, category: "last_illness", triage: "valid", receivedOn: "2026-09-18", servedOn: "2026-09-05", paidCents: 0 },
  { id: "card", creditor: "Harbor Credit Card", amountCents: 431_000, category: "other", triage: "valid", receivedOn: "2026-09-22", paidCents: 0 },
];

/** Arrives during the demo. Triage decides what it is; the engine decides what happens. */
export const lateLetter: Claim = {
  id: "northgate",
  creditor: "Northgate Recovery Partners",
  amountCents: 940_000,
  category: "other",
  triage: "suspected_fake",
  receivedOn: "2026-10-20",
  paidCents: 0,
};
