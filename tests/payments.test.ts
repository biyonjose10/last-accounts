import { beforeEach, describe, expect, it, vi } from "vitest";
import { newMemoryStore, type Store } from "@/lib/ledger/store";
import { buildState } from "@/lib/ledger/state";
import { agentMayAutoPay } from "@/lib/agent/limits";
import type { Claim } from "@/lib/engine/types";

// No PayPal calls in unit tests. The real path is proven by the end-to-end run.
const payBatch = vi.fn();
const batchStatus = vi.fn();
vi.mock("@/lib/paypal/payouts", async (original) => ({
  ...(await original<typeof import("@/lib/paypal/payouts")>()),
  payBatch: (...a: unknown[]) => payBatch(...a),
  batchStatus: (...a: unknown[]) => batchStatus(...a),
}));

const { checkPayment, pay, payClaimsInOrder, syncPayments, approvalToken } = await import("@/lib/payments");

const WS = "test-workspace";
const ALL_CLAIMS = ["lawyer", "funeral", "tax", "hospital", "card"];
let s: Store;

beforeEach(() => {
  s = newMemoryStore();
  payBatch.mockReset();
  batchStatus.mockReset();
  payBatch.mockResolvedValue({ kind: "sent", batchId: "BATCH1", duplicate: false });
  process.env.SANDBOX_HEIR_TOM_EMAIL = "tom@example.com";
  process.env.SANDBOX_HEIR_DANA_EMAIL = "dana@example.com";
  process.env.SANDBOX_HEIR_NIECE_EMAIL = "aoife@example.com";
  process.env.SANDBOX_CREDITOR_EMAIL = "creditors@example.com";
});

const state = async () => buildState(await s.list(WS));

async function payAllClaims() {
  const r = await payClaimsInOrder(WS, ALL_CLAIMS, { store: s });
  expect(r.ok).toBe(true);
}

describe("paying heirs", () => {
  it("blocks full share with an unpaid federal claim, calls nobody, and records the attempt", async () => {
    const check = await checkPayment(WS, { kind: "heir", id: "tom" }, 1_000_000, s);
    expect(check.allowed).toBe(false);
    expect(check.token).toBeNull();
    expect(payBatch).not.toHaveBeenCalled();
    expect((await s.list(WS)).some((e) => e.type === "payment_blocked")).toBe(true);
  });

  it("refuses a forged approval", async () => {
    const r = await pay(WS, { kind: "heir", id: "tom" }, 100, "forged", 0, { store: s });
    expect(r.ok).toBe(false);
    expect(payBatch).not.toHaveBeenCalled();
  });

  it("re-checks at payment time, so a token can't beat the engine", async () => {
    const token = approvalToken(WS, { kind: "heir", id: "tom" }, 1_000_000, 0);
    const r = await pay(WS, { kind: "heir", id: "tom" }, 1_000_000, token, 0, { store: s });
    expect(r).toMatchObject({ ok: false, reason: "blocked" });
    expect(payBatch).not.toHaveBeenCalled();
  });

  it("pays the safe amount once the claims are settled, once only on a double click", async () => {
    await payAllClaims();
    payBatch.mockClear();
    const tom = { kind: "heir", id: "tom" } as const;
    const first = await checkPayment(WS, tom, 1_470_000, s);
    expect(first.allowed).toBe(false);
    expect(first.safeCents).toBeGreaterThan(0);
    expect(first.blocks.map((b) => b.code)).toContain("CLAIM_WINDOW_OPEN");

    const [a, b] = await Promise.all([
      pay(WS, tom, first.safeCents, first.safeToken as string, first.version, { store: s }),
      pay(WS, tom, first.safeCents, first.safeToken as string, first.version, { store: s }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect(payBatch).toHaveBeenCalledTimes(1);
    const payments = (await state()).payments.filter((p) => p.target.id === "tom");
    expect(payments).toHaveLength(1);
    expect((await state()).facts.distributedCents.tom).toBe(first.safeCents);
  });

  it("uses a fixed batch ID for one approval, so PayPal also refuses a repeat", async () => {
    await payAllClaims();
    const ids = payBatch.mock.calls.map((c) => c[0]);
    expect(ids[0]).toMatch(/^la-/);
    payBatch.mockClear();
    const check = await checkPayment(WS, { kind: "heir", id: "dana" }, 100, s);
    await pay(WS, { kind: "heir", id: "dana" }, 100, check.token as string, check.version, { store: s });
    await pay(WS, { kind: "heir", id: "dana" }, 100, check.token as string, check.version, { store: s });
    expect(payBatch).toHaveBeenCalledTimes(1);
  });
});

describe("a failed payout", () => {
  it("leaves the money owed and nothing marked paid", async () => {
    payBatch.mockResolvedValueOnce({ kind: "failed", code: "VALIDATION", message: "Declined", simulated: true });
    const before = await state();
    const r = await payClaimsInOrder(WS, ["lawyer"], { store: s });
    expect(r.ok).toBe(false);
    const after = await state();
    expect(after.claims.find((c) => c.id === "lawyer")?.paidCents).toBe(0);
    expect(after.facts.cashCents).toBe(before.facts.cashCents);
    expect(after.payments[0]?.status).toBe("failed");
  });

  it("restores the money if PayPal later reports failure", async () => {
    await payClaimsInOrder(WS, ["lawyer"], { store: s });
    const p = (await state()).payments[0]!;
    batchStatus.mockResolvedValue({
      batchId: "BATCH1",
      batchStatus: "DENIED",
      feesCents: 0,
      items: [{ ledgerId: p.ledgerId.slice(0, 30), status: "FAILED", transactionId: null, amountCents: p.amountCents, feeCents: 0, receiver: "x", itemId: "i" }],
    });
    await syncPayments(WS, s);
    expect((await state()).claims.find((c) => c.id === "lawyer")?.paidCents).toBe(0);
  });

  it("marks paid only when PayPal says SUCCESS, and counts the fee once", async () => {
    await payClaimsInOrder(WS, ["lawyer"], { store: s });
    const p = (await state()).payments[0]!;
    const cashBefore = (await state()).facts.cashCents;
    batchStatus.mockResolvedValue({
      batchId: "BATCH1",
      batchStatus: "SUCCESS",
      feesCents: 25,
      items: [{ ledgerId: p.ledgerId.slice(0, 30), status: "SUCCESS", transactionId: "TX1", amountCents: p.amountCents, feeCents: 25, receiver: "x", itemId: "i" }],
    });
    await syncPayments(WS, s);
    const after = (await state()).payments[0]!;
    expect(after.status).toBe("paid");
    expect(after.transactionId).toBe("TX1");
    expect((await state()).facts.cashCents).toBe(cashBefore - 25);
  });
});

describe("paying claims", () => {
  it("won't pay a lower class alone", async () => {
    const r = await payClaimsInOrder(WS, ["card"], { store: s });
    expect(r).toMatchObject({ ok: false, reason: "blocked" });
    expect(payBatch).not.toHaveBeenCalled();
  });

  it("pays all claims as one batch, in class order", async () => {
    await payAllClaims();
    expect(payBatch).toHaveBeenCalledTimes(1);
    const items = payBatch.mock.calls[0]![1] as { note: string }[];
    expect(items.map((i) => i.note.split(": ")[1])).toEqual([
      "Probate attorney and filing costs",
      "Bayview Funeral Home",
      "US Treasury, final income tax",
      "St. Brendan Hospital, last illness",
      "Harbor Credit Card",
    ]);
  });

  it("never pays a suspected fake, even in a batch", async () => {
    await s.append(WS, "claim_added", {
      claim: { id: "fake", creditor: "Northgate", amountCents: 440_000, category: "other", triage: "suspected_fake", receivedOn: "2026-10-20", paidCents: 0 },
    });
    const r = await payClaimsInOrder(WS, [...ALL_CLAIMS, "fake"], { store: s });
    expect(r).toMatchObject({ ok: false, reason: "blocked", claimId: "fake" });
    expect(payBatch).not.toHaveBeenCalled();
  });
});

describe("the agent's limits", () => {
  const base: Claim = { id: "c", creditor: "Clerk of court", amountCents: 40_000, category: "administration", triage: "valid", receivedOn: "2026-10-01", paidCents: 0 };

  it("allows a small administration cost", () => {
    expect(agentMayAutoPay(base, 0).allowed).toBe(true);
  });
  it("refuses above $500 per item", () => {
    expect(agentMayAutoPay({ ...base, amountCents: 50_001 }, 0).allowed).toBe(false);
  });
  it("allows exactly $500", () => {
    expect(agentMayAutoPay({ ...base, amountCents: 50_000 }, 0).allowed).toBe(true);
  });
  it("refuses past $1,000 a day", () => {
    expect(agentMayAutoPay(base, 70_000).allowed).toBe(false);
  });
  it("refuses any other class, whatever the size", () => {
    expect(agentMayAutoPay({ ...base, category: "other", amountCents: 100 }, 0).allowed).toBe(false);
  });
  it("refuses an unproven claim", () => {
    expect(agentMayAutoPay({ ...base, triage: "needs_proof" }, 0).allowed).toBe(false);
  });
});
