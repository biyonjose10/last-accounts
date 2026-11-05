// Works out who may be paid what, today. Pure functions: same input, same answer.

import {
  CITE,
  CONTINGENCY_BPS,
  FUNERAL_CAP_CENTS,
  POLICY,
  claimDeadline,
  classify,
  windowCloses,
} from "./rules-fl";
import type {
  Block,
  Cents,
  Claim,
  ClaimLine,
  EstateFacts,
  EstatePlan,
  HeirLine,
  IsoDate,
  PaymentCheck,
} from "./types";

const usd = (cents: Cents) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function claimBlock(claim: Claim): Block | undefined {
  if (claim.triage === "suspected_fake") {
    return {
      code: "SUSPECTED_FAKE",
      message: `${claim.creditor}: no record of this debt. Money is reserved, and nothing is paid unless the creditor proves it.`,
      citation: POLICY,
    };
  }
  if (claim.triage === "needs_proof") {
    return {
      code: "CLAIM_NOT_PROVEN",
      message: `${claim.creditor}: waiting for proof. Money is reserved until then.`,
      citation: POLICY,
    };
  }
  return undefined;
}

/** A claim is out of time if it arrived after its own deadline. Courts can extend for fraud, estoppel or poor notice. */
export function isTimeBarred(claim: Claim, facts: EstateFacts): boolean {
  if (claim.category === "administration") return false; // Costs of administering the estate arise after the notice.
  return claim.receivedOn > claimDeadline(facts.noticePublishedOn, claim.servedOn);
}

export function planEstate(facts: EstateFacts, claims: Claim[], asOf: IsoDate): EstatePlan {
  const closes = windowCloses(facts.noticePublishedOn);
  const windowOpen = asOf <= closes;
  const otherValue = facts.otherAssets.reduce((s, a) => s + a.valueCents, 0);

  let funeralCapLeft = FUNERAL_CAP_CENTS;
  const lines: ClaimLine[] = [];
  let disputedReserve = 0;

  for (const claim of claims) {
    const unresolved = claimBlock(claim);
    const barred = isTimeBarred(claim, facts);
    let paidLeft = claim.paidCents;

    for (const part of classify(claim.category, claim.amountCents, funeralCapLeft)) {
      if (part.class === 2) funeralCapLeft -= part.amountCents;
      const paidHere = Math.min(paidLeft, part.amountCents);
      paidLeft -= paidHere;
      const owed = part.amountCents - paidHere;

      let status: ClaimLine["status"] = owed === 0 ? "paid" : "payable";
      let reason: Block | undefined;
      if (owed > 0 && barred) {
        status = "barred";
        reason = {
          code: "CLAIM_TIME_BARRED",
          message: `${claim.creditor}: filed after the deadline, so it isn't binding unless a court extends it.`,
          citation: CITE.claimWindow,
        };
      } else if (owed > 0 && unresolved) {
        status = "held";
        reason = unresolved;
        disputedReserve += owed;
      }
      lines.push({
        claimId: claim.id,
        creditor: claim.creditor,
        class: part.class,
        amountCents: part.amountCents,
        owedCents: owed,
        status,
        reason,
      });
    }
  }
  lines.sort((a, b) => a.class - b.class);

  const owed = lines.filter((l) => l.status === "payable").reduce((s, l) => s + l.owedCents, 0);
  const gross = facts.cashCents + otherValue;

  const contingency = windowOpen ? Math.floor((gross * CONTINGENCY_BPS) / 10_000) : 0;
  const distributableNow = Math.max(0, facts.cashCents - owed - disputedReserve - contingency);

  // Heirs' entitlements come out of the whole estate, after everything owed and reserved.
  // Anything already distributed is still part of what they were entitled to.
  const alreadyOut = Object.values(facts.distributedCents).reduce((s, v) => s + v, 0);
  const netForHeirs = Math.max(0, gross + alreadyOut - owed - disputedReserve);
  const entitlement = entitlements(facts, netForHeirs);

  const heirs: HeirLine[] = facts.heirs.map((heir) => {
    const entitled = entitlement[heir.id] ?? 0;
    const distributed = facts.distributedCents[heir.id] ?? 0;
    return {
      heirId: heir.id,
      name: heir.name,
      entitledCents: entitled,
      distributedCents: distributed,
      safeNowCents: 0,
      heldBackCents: Math.max(0, entitled - distributed),
    };
  });

  // Share what's safe in proportion to what each heir is still owed.
  const stillDue = heirs.reduce((s, h) => s + h.heldBackCents, 0);
  let handedOut = 0;
  heirs.forEach((h, i) => {
    const portion =
      stillDue === 0
        ? 0
        : i === heirs.length - 1
          ? distributableNow - handedOut
          : Math.floor((distributableNow * h.heldBackCents) / stillDue);
    h.safeNowCents = Math.max(0, Math.min(portion, h.heldBackCents));
    handedOut += portion;
    h.heldBackCents -= h.safeNowCents;
  });

  return {
    asOf,
    windowClosesOn: closes,
    windowOpen,
    grossCents: gross,
    cashCents: facts.cashCents,
    claimLines: lines,
    owedCents: owed,
    disputedReserveCents: disputedReserve,
    contingencyReserveCents: contingency,
    distributableNowCents: distributableNow,
    heirs,
    insolvent: gross < owed + disputedReserve,
  };
}

/**
 * 733.805: residuary gifts are reduced first, then general gifts.
 * Residue shares are the remainder after general gifts.
 */
export function entitlements(facts: EstateFacts, netCents: Cents): Record<string, Cents> {
  const result: Record<string, Cents> = {};
  const general = facts.devises.flatMap((d) => (d.kind === "general" ? [d] : []));
  const residuary = facts.devises.flatMap((d) => (d.kind === "residuary" ? [d] : []));

  const generalTotal = general.reduce((s, d) => s + d.amountCents, 0);
  const paidToGeneral = Math.min(generalTotal, netCents);
  for (const d of general) {
    const share = generalTotal === 0 ? 0 : Math.floor((d.amountCents * paidToGeneral) / generalTotal);
    result[d.heirId] = (result[d.heirId] ?? 0) + share;
  }

  const residue = netCents - paidToGeneral;
  let handed = 0;
  residuary.forEach((d, i) => {
    const share =
      i === residuary.length - 1 ? residue - handed : Math.floor((residue * d.shareBps) / 10_000);
    handed += share;
    result[d.heirId] = (result[d.heirId] ?? 0) + share;
  });
  return result;
}

/** Called before any money goes to an heir. */
export function checkHeirPayment(plan: EstatePlan, heirId: string, requestedCents: Cents): PaymentCheck {
  const heir = plan.heirs.find((h) => h.heirId === heirId);
  if (!heir) throw new Error(`Unknown heir: ${heirId}`);

  const blocks: Block[] = [];
  const safe = heir.safeNowCents;
  const remaining = heir.entitledCents - heir.distributedCents;

  if (remaining <= 0) {
    blocks.push({
      code: "NOTHING_DUE",
      message: `${heir.name} has already received everything due.`,
      citation: CITE.improperDistribution,
    });
  }
  if (requestedCents > remaining && remaining > 0) {
    blocks.push({
      code: "OVER_ENTITLEMENT",
      message: `${heir.name} is due ${usd(remaining)} in all, less than ${usd(requestedCents)}. Anyone overpaid may have to return it.`,
      citation: CITE.improperDistribution,
    });
  }
  const federalUnpaid = plan.claimLines.filter((l) => l.class === 3 && l.owedCents > 0 && l.status === "payable");
  for (const line of federalUnpaid) {
    blocks.push({
      code: "UNPAID_FEDERAL_CLAIM",
      message: `${line.creditor} is owed ${usd(line.owedCents)}. Paying others first can make you personally liable for it, up to what you paid out.`,
      citation: CITE.federalPriority,
    });
  }
  if (requestedCents > safe && remaining > 0) {
    if (plan.windowOpen) {
      blocks.push({
        code: "CLAIM_WINDOW_OPEN",
        message: `Creditors can still file claims until ${plan.windowClosesOn}. If you pay this now and the money runs short, you could be held liable for the loss. ${usd(safe)} is safe today.`,
        citation: CITE.fiduciaryLiability,
      });
    } else {
      blocks.push({
        code: "UNPAID_PRIOR_CLASS",
        message: `Claims and reserves come first. ${usd(safe)} is safe today.`,
        citation: CITE.paymentOrder,
      });
    }
  }
  const allowed = blocks.length === 0 && requestedCents > 0;
  // With a federal claim unpaid, nothing is safe for heirs until it's settled.
  const safeCents = federalUnpaid.length > 0 ? 0 : Math.max(0, Math.min(safe, remaining));
  return { allowed, requestedCents, safeCents, blocks };
}

/** Called before any money goes to a creditor. Enforces class order. */
export function checkClaimPayment(plan: EstatePlan, claimId: string): PaymentCheck {
  const lines = plan.claimLines.filter((l) => l.claimId === claimId);
  if (lines.length === 0) throw new Error(`Unknown claim: ${claimId}`);
  const requested = lines.reduce((s, l) => s + l.owedCents, 0);
  const blocks: Block[] = [];

  for (const line of lines) {
    if (line.reason) blocks.push(line.reason);
  }

  const payable = lines.filter((l) => l.status === "payable");
  if (payable.length > 0) {
    // A claim that spans classes is judged on its highest priority part.
    const myClass = Math.min(...payable.map((l) => l.class));
    const prior = plan.claimLines.filter(
      (l) => l.class < myClass && l.status === "payable" && l.owedCents > 0 && l.claimId !== claimId,
    );
    for (const line of prior) {
      blocks.push({
        code: line.class === 3 ? "UNPAID_FEDERAL_CLAIM" : "UNPAID_PRIOR_CLASS",
        message: `${line.creditor} (Class ${line.class}) comes first.`,
        citation: line.class === 3 ? CITE.federalPriority : CITE.paymentOrder,
      });
    }
  }
  if (requested > plan.cashCents) {
    blocks.push({
      code: "INSUFFICIENT_CASH",
      message: `The estate holds ${usd(plan.cashCents)}. Creditors in the same class share what's left in proportion.`,
      citation: CITE.paymentOrder,
    });
  }
  const safeCents = blocks.length === 0 ? payable.reduce((s, l) => s + l.owedCents, 0) : 0;
  return { allowed: blocks.length === 0 && requested > 0, requestedCents: requested, safeCents, blocks };
}
