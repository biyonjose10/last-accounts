// All money is integer US cents. All dates are ISO "YYYY-MM-DD" strings.
// This module has no network access and no AI. Code decides the money.

export type Cents = number;
export type IsoDate = string;

export type ClaimCategory =
  | "administration"
  | "funeral"
  | "federal"
  | "last_illness"
  | "family_allowance"
  | "child_support"
  | "business_continuation"
  | "other";

/** Set by triage. It never carries an amount. */
export type ClaimTriage = "valid" | "needs_proof" | "suspected_fake";

export interface Claim {
  id: string;
  creditor: string;
  amountCents: Cents;
  category: ClaimCategory;
  triage: ClaimTriage;
  /** Date the claim was filed or received. */
  receivedOn: IsoDate;
  /** Date a copy of the notice to creditors was served on this creditor, if any. */
  servedOn?: IsoDate;
  /** Amount already paid against this claim. */
  paidCents: Cents;
}

export interface Heir {
  id: string;
  name: string;
  country: string;
}

export type Devise =
  | { kind: "general"; heirId: string; amountCents: Cents }
  /** Share of the residue, in basis points. All residuary shares must total 10,000. */
  | { kind: "residuary"; heirId: string; shareBps: number };

export interface EstateFacts {
  decedent: string;
  state: "FL";
  dateOfDeath: IsoDate;
  /** First publication of the notice to creditors. */
  noticePublishedOn: IsoDate;
  /** Cash the estate holds today, net of everything that has moved. */
  cashCents: Cents;
  /** Non-cash assets still in the estate, at appraised value. */
  otherAssets: { id: string; name: string; valueCents: Cents }[];
  heirs: Heir[];
  devises: Devise[];
  /** Amounts already distributed to each heir. */
  distributedCents: Record<string, Cents>;
}

export interface Citation {
  /** Short form, e.g. "Fla. Stat. 733.707". */
  source: string;
  url: string;
}

export type BlockCode =
  | "CLAIM_WINDOW_OPEN"
  | "OVER_ENTITLEMENT"
  | "UNPAID_FEDERAL_CLAIM"
  | "UNPAID_PRIOR_CLASS"
  | "SUSPECTED_FAKE"
  | "CLAIM_NOT_PROVEN"
  | "CLAIM_TIME_BARRED"
  | "INSUFFICIENT_CASH"
  | "NOTHING_DUE";

export interface Block {
  code: BlockCode;
  message: string;
  /** Every block cites its statute, or says plainly that it is our own prudence policy. */
  citation: Citation | { source: "Last Accounts prudence policy"; url: null };
}

export interface ClaimLine {
  claimId: string;
  creditor: string;
  /** 733.707 class this portion falls in, 1 to 8. */
  class: number;
  amountCents: Cents;
  owedCents: Cents;
  status: "payable" | "held" | "barred" | "paid";
  reason?: Block;
}

export interface HeirLine {
  heirId: string;
  name: string;
  entitledCents: Cents;
  distributedCents: Cents;
  safeNowCents: Cents;
  heldBackCents: Cents;
}

export interface EstatePlan {
  asOf: IsoDate;
  windowClosesOn: IsoDate;
  windowOpen: boolean;
  grossCents: Cents;
  cashCents: Cents;
  claimLines: ClaimLine[];
  /** Valid claims still unpaid. */
  owedCents: Cents;
  /** Claims held in full until resolved. Never spent. */
  disputedReserveCents: Cents;
  /** Our own extra margin while the window is open. Not a legal figure. */
  contingencyReserveCents: Cents;
  /** Cash left after claims and reserves, shared among heirs. */
  distributableNowCents: Cents;
  heirs: HeirLine[];
  /** True if claims exceed what the estate holds. */
  insolvent: boolean;
}

export interface PaymentCheck {
  allowed: boolean;
  requestedCents: Cents;
  /** The most that can safely go now. Offered in place of a refusal. */
  safeCents: Cents;
  blocks: Block[];
}
