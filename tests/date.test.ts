import { describe, expect, it } from "vitest";
import { canGoBack } from "@/lib/ledger/state";

const ev = (...types: string[]) => types.map((type) => ({ type }));

describe("going back from the simulated date", () => {
  it("isn't offered before any jump", () => {
    expect(canGoBack(ev("document_read", "payment_blocked"))).toBe(false);
  });

  it("is allowed while nothing has moved since the jump", () => {
    expect(canGoBack(ev("payment_requested", "date_advanced", "document_read", "payment_blocked"))).toBe(true);
  });

  it("is refused once money moves after the jump", () => {
    expect(canGoBack(ev("date_advanced", "payment_requested"))).toBe(false);
    expect(canGoBack(ev("date_advanced", "order_created"))).toBe(false);
    expect(canGoBack(ev("date_advanced", "claim_released"))).toBe(false);
  });

  it("is not offered again once back, until the next jump", () => {
    expect(canGoBack(ev("date_advanced", "date_reverted"))).toBe(false);
    expect(canGoBack(ev("date_advanced", "date_reverted", "date_advanced"))).toBe(true);
  });
});
