import { describe, expect, it } from "vitest";
import { newMemoryStore } from "@/lib/ledger/store";
import {
  LIVE_MONEY_RUNS_PER_DAY,
  VISITOR_ESTATES_PER_DAY,
  mayMoveMoney,
  mayStartEstate,
  requestIp,
  visitorKey,
} from "@/lib/limits";

describe("visitor limits", () => {
  it("refuses a visitor past the daily number of estates", async () => {
    const s = newMemoryStore();
    for (let i = 0; i < VISITOR_ESTATES_PER_DAY; i++) expect(await mayStartEstate(s, "v1")).toBe(true);
    expect(await mayStartEstate(s, "v1")).toBe(false);
    expect(await mayStartEstate(s, "v2")).toBe(true);
  });

  it("hashes the address, so the raw IP isn't stored", () => {
    const key = visitorKey("203.0.113.9");
    expect(key).not.toContain("203");
    expect(key).toHaveLength(24);
  });

  it("reads the IP from platform headers", () => {
    expect(requestIp(new Headers({ "x-real-ip": "1.2.3.4" }))).toBe("1.2.3.4");
    expect(requestIp(new Headers({ "x-forwarded-for": "5.6.7.8, 9.9.9.9" }))).toBe("5.6.7.8");
    expect(requestIp(new Headers())).toBe("unknown");
  });
});

describe("the daily cap on live money runs", () => {
  it("stops new estates from moving money past the cap", async () => {
    const s = newMemoryStore();
    for (let i = 0; i < LIVE_MONEY_RUNS_PER_DAY; i++) expect(await mayMoveMoney(s, `w${i}`)).toBe(true);
    expect(await mayMoveMoney(s, "one-too-many")).toBe(false);
  });

  it("lets an estate already moving money finish, even past the cap", async () => {
    const s = newMemoryStore();
    await s.append("started", "payment_requested", {});
    for (let i = 0; i < LIVE_MONEY_RUNS_PER_DAY; i++) await mayMoveMoney(s, `w${i}`);
    expect(await mayMoveMoney(s, "started")).toBe(true);
  });

  it("finds the estate a PayPal event belongs to", async () => {
    const s = newMemoryStore();
    await s.append("wsA", "payment_requested", { ledgerId: "la123456789012345678901" });
    expect(await s.findWorkspaceByLedger("la123456789012345678901".slice(0, 30))).toBe("wsA");
    expect(await s.findWorkspaceByLedger("nope")).toBeNull();
  });
});
