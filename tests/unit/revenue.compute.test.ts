import { describe, expect, it } from "vitest";
import { computePayout, defaultRevenueShareBps } from "@/server/payments/revenue";

describe("computePayout", () => {
  it("10% bps yields 90% net to the founder", () => {
    const r = computePayout(100, 1000);
    expect(r.gross_usd).toBe(100);
    expect(r.fee_usd).toBe(10);
    expect(r.net_usd).toBe(90);
  });

  it("0 bps yields full pass-through", () => {
    const r = computePayout(123.45, 0);
    expect(r.fee_usd).toBe(0);
    expect(r.net_usd).toBe(123.45);
  });

  it("10000 bps yields zero net", () => {
    const r = computePayout(50, 10000);
    expect(r.net_usd).toBe(0);
    expect(r.fee_usd).toBe(50);
  });

  it("rounds to cents", () => {
    const r = computePayout(33.333, 1500); // 15%
    expect(r.fee_usd).toBe(5);
    expect(r.net_usd).toBe(28.33);
  });

  it("throws on negative gross", () => {
    expect(() => computePayout(-1, 1000)).toThrow(/non-negative/);
  });

  it("throws on bps outside [0, 10000]", () => {
    expect(() => computePayout(10, -1)).toThrow(/bps/);
    expect(() => computePayout(10, 10001)).toThrow(/bps/);
  });
});

describe("defaultRevenueShareBps", () => {
  it("returns 1000 (10%) when env unset or invalid", () => {
    const prev = process.env.PAINPILOT_REVENUE_SHARE_BPS;
    delete process.env.PAINPILOT_REVENUE_SHARE_BPS;
    expect(defaultRevenueShareBps()).toBe(1000);
    process.env.PAINPILOT_REVENUE_SHARE_BPS = "not-a-number";
    expect(defaultRevenueShareBps()).toBe(1000);
    process.env.PAINPILOT_REVENUE_SHARE_BPS = "20000";
    expect(defaultRevenueShareBps()).toBe(1000);
    if (prev === undefined) delete process.env.PAINPILOT_REVENUE_SHARE_BPS;
    else process.env.PAINPILOT_REVENUE_SHARE_BPS = prev;
  });

  it("honors a valid env value", () => {
    const prev = process.env.PAINPILOT_REVENUE_SHARE_BPS;
    process.env.PAINPILOT_REVENUE_SHARE_BPS = "1500";
    expect(defaultRevenueShareBps()).toBe(1500);
    if (prev === undefined) delete process.env.PAINPILOT_REVENUE_SHARE_BPS;
    else process.env.PAINPILOT_REVENUE_SHARE_BPS = prev;
  });
});
