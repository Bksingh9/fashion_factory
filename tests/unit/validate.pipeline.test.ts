import { describe, expect, it } from "vitest";
import {
  buildSectionInput,
  SECTION_ORDER,
  type SectionContext,
} from "@/server/validate/pipeline";

function ctxFixture(overrides: Partial<SectionContext> = {}): SectionContext {
  return {
    spec: {
      id: "spec-1",
      user_id: "user-1",
      cluster_id: "cluster-1",
      audience: null,
      competitors: null,
      wtp: null,
      pricing: null,
      features: null,
      gtm: null,
    },
    cluster: {
      id: "cluster-1",
      title: "Faster Stripe payouts for new SaaS",
      summary: "Founders consistently wait 7-14 days for first payout.",
      audience: "indie SaaS founders",
      keywords: ["stripe", "payouts", "indie"],
    },
    signals: [
      {
        title: "Why is Stripe holding my payout?",
        body: "Day 12 since my first sale and Stripe still hasn't released funds.",
        score: 87,
        source: "reddit",
      },
      {
        title: "Switched to Lemon Squeezy",
        body: "Stripe is too slow. Lemon Squeezy paid me in 3 days.",
        score: 42,
        source: "hn",
      },
    ],
    ...overrides,
  };
}

describe("buildSectionInput", () => {
  it("includes the cluster title, summary, and signal bodies", () => {
    const out = buildSectionInput(ctxFixture(), "audience");
    expect(out).toContain("Faster Stripe payouts");
    expect(out).toContain("Stripe still hasn't released funds");
    expect(out).toContain("Switched to Lemon Squeezy");
  });

  it("omits prior-section context for audience (first in order)", () => {
    const out = buildSectionInput(ctxFixture(), "audience");
    expect(out).not.toContain("# Prior sections");
  });

  it("includes prior audience context when generating competitors", () => {
    const ctx = ctxFixture({
      spec: {
        ...ctxFixture().spec,
        audience: {
          primary: {
            role: "Indie SaaS founder",
            size: "50k",
            channels: ["r/SaaS"],
            jobs_to_be_done: ["validate demand"],
          },
        },
      },
    });
    const out = buildSectionInput(ctx, "competitors");
    expect(out).toContain("# Prior sections");
    expect(out).toContain("Indie SaaS founder");
  });

  it("includes audience+competitors+wtp_pricing when generating features", () => {
    const ctx = ctxFixture({
      spec: {
        ...ctxFixture().spec,
        audience: { primary: { role: "X" } },
        competitors: { summary: "Stripe dominates" },
        wtp: { wtp_band: "$10-50" },
        pricing: { plans: [{ name: "Pro" }] },
      },
    });
    const out = buildSectionInput(ctx, "features");
    expect(out).toContain("Stripe dominates");
    expect(out).toContain("$10-50");
  });

  it("truncates signal bodies to 280 chars to keep prompt budget", () => {
    const ctx = ctxFixture({
      signals: [
        {
          title: "Long signal",
          body: "x".repeat(1000),
          score: 1,
          source: "hn",
        },
      ],
    });
    const out = buildSectionInput(ctx, "audience");
    // The signal body inside the bullet should be at most ~280 chars.
    const bullet = out.split("\n").find((l) => l.startsWith("- [hn]")) ?? "";
    expect(bullet.length).toBeLessThan(360);
  });
});

describe("SECTION_ORDER", () => {
  it("is the canonical 5-section pipeline order", () => {
    expect(SECTION_ORDER).toEqual([
      "audience",
      "competitors",
      "wtp_pricing",
      "features",
      "gtm",
    ]);
  });
});
