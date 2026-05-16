import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = readFileSync(
  path.join(process.cwd(), "supabase/migrations/0004_validate.sql"),
  "utf8",
);

const REQUIRED = [
  "validate.audience",
  "validate.competitors",
  "validate.wtp_pricing",
  "validate.features",
  "validate.gtm",
  "spec.generate",
];

describe("Phase 3 prompts (migration 0004)", () => {
  it.each(REQUIRED)("%s is present in migration 0004 with a non-TBD body", (name) => {
    const escaped = name.replace(/\./g, "\\.");
    const refPresent = new RegExp(`'${escaped}'`, "i").test(MIGRATION);
    expect(refPresent).toBe(true);
    // body $body$…$body$ block (used for both UPDATE and INSERT). Must be
    // longer than the seeded "TBD, see Phase 2+" placeholder.
    const bodyRe = new RegExp(
      `'${escaped}'[\\s\\S]{0,3000}\\$body\\$([\\s\\S]+?)\\$body\\$|\\$body\\$([\\s\\S]+?)\\$body\\$[\\s\\S]{0,3000}'${escaped}'`,
      "i",
    );
    const match = bodyRe.exec(MIGRATION);
    expect(match).not.toBeNull();
    const captured = (match?.[1] ?? match?.[2] ?? "").trim();
    expect(captured.length).toBeGreaterThan(100);
    expect(captured).not.toContain("TBD, see Phase 2+");
  });

  it("competitors prompt instructs cite-only-from-research (no invention)", () => {
    expect(MIGRATION).toMatch(/Do not invent/i);
  });

  it("wtp_pricing prompt defines all 5 wtp_band enum values", () => {
    expect(MIGRATION).toMatch(/<\$10/);
    expect(MIGRATION).toMatch(/\$10-50/);
    expect(MIGRATION).toMatch(/\$50-200/);
    expect(MIGRATION).toMatch(/\$200-1k/);
    expect(MIGRATION).toMatch(/\$1k\+/);
  });

  it("features prompt mandates kebab-case slugs", () => {
    expect(MIGRATION).toMatch(/kebab-case/i);
  });
});
