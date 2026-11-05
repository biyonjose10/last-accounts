import { describe, expect, it } from "vitest";
import { checkClaimPayment, checkHeirPayment, entitlements, isTimeBarred, planEstate } from "@/lib/engine/plan";
import { FUNERAL_CAP_CENTS, addMonths, claimDeadline, classify } from "@/lib/engine/rules-fl";
import type { Claim, EstateFacts } from "@/lib/engine/types";
import { AFTER_WINDOW_DATE, START_DATE, claims, estate, lateLetter } from "@/fixtures/scenario";

const setAllPaid = (cs: Claim[]) => cs.map((c) => ({ ...c, paidCents: c.amountCents }));
const CLAIMS_TOTAL = claims.reduce((s, c) => s + c.amountCents, 0);
const LETTER = lateLetter.amountCents;

describe("733.707 payment classes", () => {
  it("puts each category in the class the statute names", () => {
    expect(classify("administration", 100, FUNERAL_CAP_CENTS)[0]?.class).toBe(1);
    expect(classify("federal", 100, FUNERAL_CAP_CENTS)[0]?.class).toBe(3);
    expect(classify("last_illness", 100, FUNERAL_CAP_CENTS)[0]?.class).toBe(4);
    expect(classify("family_allowance", 100, FUNERAL_CAP_CENTS)[0]?.class).toBe(5);
    expect(classify("child_support", 100, FUNERAL_CAP_CENTS)[0]?.class).toBe(6);
    expect(classify("business_continuation", 100, FUNERAL_CAP_CENTS)[0]?.class).toBe(7);
    expect(classify("other", 100, FUNERAL_CAP_CENTS)[0]?.class).toBe(8);
  });

  it("caps funeral costs at $6,000 in Class 2 and moves the rest to Class 8", () => {
    expect(classify("funeral", 824_000, 600_000)).toEqual([
      { class: 2, amountCents: 600_000 },
      { class: 8, amountCents: 224_000 },
    ]);
  });

  it("applies the funeral cap across several funeral claims", () => {
    const two: Claim[] = [
      { id: "a", creditor: "Funeral", amountCents: 500_000, category: "funeral", triage: "valid", receivedOn: "2026-09-02", paidCents: 0 },
      { id: "b", creditor: "Grave marker", amountCents: 300_000, category: "funeral", triage: "valid", receivedOn: "2026-09-02", paidCents: 0 },
    ];
    const plan = planEstate(estate, two, START_DATE);
    const class2 = plan.claimLines.filter((l) => l.class === 2).reduce((s, l) => s + l.amountCents, 0);
    expect(class2).toBe(600_000);
  });

  it("sorts claim lines into payment order", () => {
    const plan = planEstate(estate, claims, START_DATE);
    const classes = plan.claimLines.map((l) => l.class);
    expect(classes).toEqual([...classes].sort((a, b) => a - b));
  });

  it("refuses a lower class while a higher class is unpaid", () => {
    const plan = planEstate(estate, claims, START_DATE);
    const check = checkClaimPayment(plan, "card");
    expect(check.allowed).toBe(false);
    expect(check.blocks.map((b) => b.code)).toContain("UNPAID_PRIOR_CLASS");
    expect(check.blocks.map((b) => b.code)).toContain("UNPAID_FEDERAL_CLAIM");
  });

  it("allows the highest class first", () => {
    const plan = planEstate(estate, claims, START_DATE);
    expect(checkClaimPayment(plan, "lawyer").allowed).toBe(true);
  });
});

describe("733.702 claim window", () => {
  it("closes 3 months after first publication", () => {
    expect(claimDeadline("2026-09-01")).toBe("2026-12-01");
  });

  it("uses 30 days after service when that is later", () => {
    expect(claimDeadline("2026-09-01", "2026-11-15")).toBe("2026-12-15");
  });

  it("keeps the 3 months when service came early", () => {
    expect(claimDeadline("2026-09-01", "2026-09-05")).toBe("2026-12-01");
  });

  it("clamps month ends", () => {
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
  });

  it("is open on the closing date and shut the day after", () => {
    expect(planEstate(estate, claims, "2026-12-01").windowOpen).toBe(true);
    expect(planEstate(estate, claims, AFTER_WINDOW_DATE).windowOpen).toBe(false);
  });

  it("marks a claim filed after its deadline as barred, and pays nothing on it", () => {
    const late: Claim = { ...lateLetter, id: "late", triage: "valid", receivedOn: "2026-12-20" };
    expect(isTimeBarred(late, estate)).toBe(true);
    const plan = planEstate(estate, [...claims, late], "2026-12-21");
    expect(plan.claimLines.find((l) => l.claimId === "late")?.status).toBe("barred");
    expect(checkClaimPayment(plan, "late").allowed).toBe(false);
  });

  it("does not bar a served creditor inside its own later deadline", () => {
    const served: Claim = { ...lateLetter, id: "s", triage: "valid", receivedOn: "2026-12-10", servedOn: "2026-11-15" };
    expect(isTimeBarred(served, estate)).toBe(false);
  });
});

describe("733.805 abatement", () => {
  const facts: EstateFacts = estate;

  it("pays the general gift before the residue", () => {
    const e = entitlements(facts, 2_200_000);
    expect(e.aoife).toBe(200_000);
    expect(e.dana).toBe(1_000_000);
    expect(e.tom).toBe(1_000_000);
  });

  it("reduces the residue first, wiping it out before touching the general gift", () => {
    const e = entitlements(facts, 200_000);
    expect(e.aoife).toBe(200_000);
    expect(e.dana).toBe(0);
    expect(e.tom).toBe(0);
  });

  it("reduces the general gift once the residue is gone", () => {
    const e = entitlements(facts, 150_000);
    expect(e.aoife).toBe(150_000);
    expect(e.dana).toBe(0);
  });

  it("never loses a cent when splitting an odd residue", () => {
    const e = entitlements(facts, 200_000 + 1_000_001);
    expect((e.aoife ?? 0) + (e.dana ?? 0) + (e.tom ?? 0)).toBe(1_200_001);
  });
});

describe("the stop moment", () => {
  it("blocks paying Tom his full share while the window is open, and offers a safe amount", () => {
    const paid = { ...estate };
    const allPaid = setAllPaid(claims);
    const plan = planEstate({ ...paid, cashCents: paid.cashCents - CLAIMS_TOTAL }, allPaid, START_DATE);
    const tom = plan.heirs.find((h) => h.heirId === "tom")!;
    const check = checkHeirPayment(plan, "tom", tom.entitledCents);
    expect(check.allowed).toBe(false);
    expect(check.blocks.map((b) => b.code)).toContain("CLAIM_WINDOW_OPEN");
    expect(check.safeCents).toBeGreaterThan(0);
    expect(check.safeCents).toBeLessThan(tom.entitledCents);
    expect(checkHeirPayment(plan, "tom", check.safeCents).allowed).toBe(true);
  });

  it("blocks every heir payment while the federal claim is unpaid, citing 31 USC 3713", () => {
    const plan = planEstate(estate, claims, START_DATE);
    const check = checkHeirPayment(plan, "tom", 100);
    expect(check.allowed).toBe(false);
    const federal = check.blocks.find((b) => b.code === "UNPAID_FEDERAL_CLAIM");
    expect(federal?.citation.source).toBe("31 U.S.C. 3713(b)");
    expect(check.safeCents).toBe(0);
  });

  it("refuses more than an heir is due", () => {
    const allPaid = setAllPaid(claims);
    const plan = planEstate({ ...estate, cashCents: estate.cashCents - CLAIMS_TOTAL }, allPaid, AFTER_WINDOW_DATE);
    const aoife = plan.heirs.find((h) => h.heirId === "aoife")!;
    const check = checkHeirPayment(plan, "aoife", aoife.entitledCents + 1);
    expect(check.blocks.map((b) => b.code)).toContain("OVER_ENTITLEMENT");
  });

  it("gives every block a citation or says it is policy", () => {
    const plan = planEstate(estate, [...claims, lateLetter], START_DATE);
    const blocks = [
      ...checkHeirPayment(plan, "tom", 99_999_999).blocks,
      ...checkClaimPayment(plan, "card").blocks,
      ...checkClaimPayment(plan, "northgate").blocks,
    ];
    expect(blocks.length).toBeGreaterThan(2);
    for (const b of blocks) {
      expect(b.citation.source.length).toBeGreaterThan(3);
      if (b.citation.source !== "Last Accounts prudence policy") expect(b.citation.url).toMatch(/^https?:/);
    }
  });
});

describe("a suspected fake debt", () => {
  it("is reserved in full and can never be paid", () => {
    const plan = planEstate(estate, [...claims, lateLetter], START_DATE);
    expect(plan.disputedReserveCents).toBe(LETTER);
    const check = checkClaimPayment(plan, "northgate");
    expect(check.allowed).toBe(false);
    expect(check.safeCents).toBe(0);
    expect(check.blocks[0]?.code).toBe("SUSPECTED_FAKE");
  });

  it("lowers what heirs can safely receive", () => {
    const allPaid = setAllPaid(claims);
    const facts = { ...estate, cashCents: estate.cashCents - CLAIMS_TOTAL };
    const before = planEstate(facts, allPaid, START_DATE);
    const after = planEstate(facts, [...allPaid, lateLetter], START_DATE);
    expect(after.distributableNowCents).toBe(before.distributableNowCents - LETTER);
  });

  it("stays reserved after the window closes, until it is resolved", () => {
    const plan = planEstate(estate, [...claims, lateLetter], AFTER_WINDOW_DATE);
    expect(plan.disputedReserveCents).toBe(LETTER);
  });
});

describe("whole-estate arithmetic", () => {
  it("shares out everything once the window closes and all claims are paid", () => {
    const allPaid = setAllPaid(claims);
    const facts = { ...estate, cashCents: estate.cashCents - CLAIMS_TOTAL, otherAssets: [] };
    const plan = planEstate(facts, allPaid, AFTER_WINDOW_DATE);
    expect(plan.contingencyReserveCents).toBe(0);
    const safe = plan.heirs.reduce((s, h) => s + h.safeNowCents, 0);
    expect(safe).toBe(facts.cashCents);
  });

  it("drops the prudence margin when the window closes", () => {
    expect(planEstate(estate, claims, START_DATE).contingencyReserveCents).toBeGreaterThan(0);
    expect(planEstate(estate, claims, AFTER_WINDOW_DATE).contingencyReserveCents).toBe(0);
  });

  it("counts money already distributed, so nobody gets paid twice", () => {
    const allPaid = setAllPaid(claims);
    const facts: EstateFacts = {
      ...estate,
      otherAssets: [],
      cashCents: estate.cashCents - CLAIMS_TOTAL - 500_000,
      distributedCents: { tom: 500_000 },
    };
    const plan = planEstate(facts, allPaid, AFTER_WINDOW_DATE);
    const tom = plan.heirs.find((h) => h.heirId === "tom")!;
    const dana = plan.heirs.find((h) => h.heirId === "dana")!;
    expect(tom.entitledCents).toBe(dana.entitledCents);
    expect(tom.safeNowCents).toBe(dana.safeNowCents - 500_000);
    expect(plan.heirs.reduce((s, h) => s + h.safeNowCents, 0)).toBe(facts.cashCents);
  });

  it("can't be drained by paying the safe amount again and again while the window is open", () => {
    const allPaid = setAllPaid(claims);
    let facts: EstateFacts = { ...estate, cashCents: estate.cashCents - CLAIMS_TOTAL, distributedCents: {} };
    const first = planEstate(facts, allPaid, START_DATE);
    const margin = first.contingencyReserveCents;
    for (let round = 0; round < 6; round++) {
      const plan = planEstate(facts, allPaid, START_DATE);
      const paid: Record<string, number> = { ...facts.distributedCents };
      let cash = facts.cashCents;
      for (const h of plan.heirs) {
        paid[h.heirId] = (paid[h.heirId] ?? 0) + h.safeNowCents;
        cash -= h.safeNowCents;
      }
      facts = { ...facts, cashCents: cash, distributedCents: paid };
    }
    expect(facts.cashCents).toBeGreaterThanOrEqual(margin);
    expect(planEstate(facts, allPaid, START_DATE).distributableNowCents).toBe(0);
    expect(planEstate(facts, allPaid, START_DATE).contingencyReserveCents).toBe(margin);
  });

  it("doesn't let one heir taking their share first reduce another's", () => {
    const allPaid = setAllPaid(claims);
    const base: EstateFacts = { ...estate, cashCents: estate.cashCents - CLAIMS_TOTAL };
    const before = planEstate(base, allPaid, START_DATE);
    const tomSafe = before.heirs.find((h) => h.heirId === "tom")!.safeNowCents;
    const after = planEstate({ ...base, cashCents: base.cashCents - tomSafe, distributedCents: { tom: tomSafe } }, allPaid, START_DATE);
    expect(after.heirs.find((h) => h.heirId === "tom")!.safeNowCents).toBe(0);
    const danaBefore = before.heirs.find((h) => h.heirId === "dana")!.safeNowCents;
    expect(after.heirs.find((h) => h.heirId === "dana")!.safeNowCents).toBe(danaBefore);
  });

  it("pays the general gift in full before the residue shares what's safe", () => {
    const allPaid = setAllPaid(claims);
    const plan = planEstate({ ...estate, cashCents: estate.cashCents - CLAIMS_TOTAL }, allPaid, START_DATE);
    expect(plan.heirs.find((h) => h.heirId === "aoife")!.safeNowCents).toBe(200_000);
  });

  it("selling the car turns it into cash and raises what's safe now", () => {
    const allPaid = setAllPaid(claims);
    const before = { ...estate, cashCents: estate.cashCents - CLAIMS_TOTAL };
    const netFromSale = 640_000 - 17_000;
    const after = { ...before, cashCents: before.cashCents + netFromSale, otherAssets: [] };
    const a = planEstate(before, allPaid, START_DATE);
    const b = planEstate(after, allPaid, START_DATE);
    expect(b.distributableNowCents).toBeGreaterThan(a.distributableNowCents);
  });

  it("flags an insolvent estate and pays heirs nothing", () => {
    const facts = { ...estate, cashCents: 500_000, otherAssets: [] };
    const plan = planEstate(facts, claims, AFTER_WINDOW_DATE);
    expect(plan.insolvent).toBe(true);
    expect(plan.distributableNowCents).toBe(0);
    expect(plan.heirs.every((h) => h.safeNowCents === 0)).toBe(true);
  });
});
