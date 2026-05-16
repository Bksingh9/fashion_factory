import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  clusterSummarySchema,
  extractSignalsSchema,
} from "@/server/sources/schemas";

const MIGRATION = readFileSync(
  path.join(process.cwd(), "supabase/migrations/0003_signals.sql"),
  "utf8",
);

describe("Phase 2 prompt bodies (migration 0003)", () => {
  it("extract.signals body is non-placeholder and references the JSON shape", () => {
    expect(MIGRATION).toMatch(/update\s+public\.prompts[\s\S]*extract\.signals/i);
    // Body must explain the JSON output shape (mentions all 5 keys).
    expect(MIGRATION).toMatch(/"pain"/);
    expect(MIGRATION).toMatch(/"audience"/);
    expect(MIGRATION).toMatch(/"willingness_to_pay"/);
    expect(MIGRATION).toMatch(/"keywords"/);
    expect(MIGRATION).not.toContain("TBD, see Phase 2+\n");
  });

  it("cluster.summarize body is non-placeholder and references the output shape", () => {
    expect(MIGRATION).toMatch(/update\s+public\.prompts[\s\S]*cluster\.summarize/i);
    expect(MIGRATION).toMatch(/"title"/);
    expect(MIGRATION).toMatch(/"summary"/);
    expect(MIGRATION).toMatch(/"pain_score"/);
  });
});

describe("Phase 2 zod schemas", () => {
  it("extractSignalsSchema accepts a well-formed payload", () => {
    const valid = {
      pain: "Stripe payouts take 7+ days for new merchants",
      audience: "indie SaaS founders",
      current_solution: "switching to Lemon Squeezy",
      willingness_to_pay: "medium",
      keywords: ["stripe", "payouts", "delays", "merchants"],
    };
    const parsed = extractSignalsSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("extractSignalsSchema rejects an invalid willingness_to_pay enum value", () => {
    const bad = {
      pain: "Some pain",
      audience: "devs",
      current_solution: null,
      willingness_to_pay: "maybe",
      keywords: ["x"],
    };
    const parsed = extractSignalsSchema.safeParse(bad);
    expect(parsed.success).toBe(false);
  });

  it("extractSignalsSchema rejects too many keywords (>8)", () => {
    const bad = {
      pain: "X",
      audience: "y",
      current_solution: null,
      willingness_to_pay: "low",
      keywords: Array.from({ length: 9 }, (_, i) => `kw${String(i)}`),
    };
    expect(extractSignalsSchema.safeParse(bad).success).toBe(false);
  });

  it("clusterSummarySchema accepts a well-formed payload", () => {
    const valid = {
      title: "Faster Stripe payouts for new SaaS merchants",
      summary:
        "Indie founders consistently wait over a week for first payouts. Migration to Lemon Squeezy is common but breaks accounting.",
      pain_score: 7.5,
      audience: "indie SaaS founders",
      keywords: ["stripe", "payouts", "delays", "lemonsqueezy", "indie"],
    };
    expect(clusterSummarySchema.safeParse(valid).success).toBe(true);
  });

  it("clusterSummarySchema rejects out-of-range pain_score", () => {
    const bad = {
      title: "Long enough title here",
      summary: "Long enough summary here for the test case to pass.",
      pain_score: 11, // > 10
      audience: "devs",
      keywords: ["a", "b", "c"],
    };
    expect(clusterSummarySchema.safeParse(bad).success).toBe(false);
  });
});
