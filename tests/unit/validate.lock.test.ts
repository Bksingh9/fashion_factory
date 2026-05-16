import { describe, expect, it } from "vitest";
import { isLockable } from "@/server/validate/lock";

describe("isLockable", () => {
  it("rejects when any section is null", () => {
    expect(
      isLockable({
        audience: { role: "x" },
        competitors: { summary: "y" },
        wtp: { rationale: "z" },
        pricing: { plans: [{}] },
        features: { mvp: [{}] },
        gtm: null,
      }),
    ).toBe(false);
  });

  it("rejects when any section is an empty object", () => {
    expect(
      isLockable({
        audience: {},
        competitors: { summary: "y" },
        wtp: { rationale: "z" },
        pricing: { plans: [{}] },
        features: { mvp: [{}] },
        gtm: { channels: [{}] },
      }),
    ).toBe(false);
  });

  it("rejects when any section is an empty array", () => {
    expect(
      isLockable({
        audience: { role: "x" },
        competitors: [],
        wtp: { rationale: "z" },
        pricing: { plans: [{}] },
        features: { mvp: [{}] },
        gtm: { channels: [{}] },
      }),
    ).toBe(false);
  });

  it("accepts when every section is a non-empty object", () => {
    expect(
      isLockable({
        audience: { role: "x" },
        competitors: { summary: "y" },
        wtp: { rationale: "z" },
        pricing: { plans: [{ name: "p" }] },
        features: { mvp: [{ slug: "s" }] },
        gtm: { channels: [{ name: "c" }] },
      }),
    ).toBe(true);
  });

  it("rejects when sections are completely absent", () => {
    expect(isLockable({})).toBe(false);
  });
});
