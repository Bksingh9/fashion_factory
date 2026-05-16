import { beforeEach, describe, expect, it } from "vitest";
import {
  limitLlm,
  resetRateLimitStub,
  setRateLimitClockMs,
} from "@/server/ratelimit";

beforeEach(() => {
  resetRateLimitStub();
});

describe("limitLlm — free plan", () => {
  it("allows exactly 20 calls per 24h then refuses", async () => {
    setRateLimitClockMs(1_000_000);
    for (let i = 0; i < 20; i++) {
      const r = await limitLlm("user-free-1", "free");
      expect(r.success).toBe(true);
    }
    const blocked = await limitLlm("user-free-1", "free");
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("resets after the 24h window slides past", async () => {
    setRateLimitClockMs(1_000_000);
    for (let i = 0; i < 20; i++) await limitLlm("user-free-2", "free");

    // Advance 25 hours — all prior hits should have aged out.
    setRateLimitClockMs(1_000_000 + 25 * 60 * 60 * 1000);
    const ok = await limitLlm("user-free-2", "free");
    expect(ok.success).toBe(true);
  });

  it("counts users independently", async () => {
    setRateLimitClockMs(1_000_000);
    for (let i = 0; i < 20; i++) await limitLlm("user-a", "free");
    const otherUser = await limitLlm("user-b", "free");
    expect(otherUser.success).toBe(true);
  });
});
