import { describe, expect, it } from "vitest";
import {
  shipCommitMessageSchema,
  shipFileContentsSchema,
  shipPlanSchema,
  shipReadmeSchema,
} from "@/server/ship/plan";

describe("shipPlanSchema", () => {
  it("accepts a valid 3-file plan", () => {
    const v = {
      files: [
        { path: "src/app/page.tsx", kind: "route", summary: "Home page", deps: [] },
        { path: "src/components/header.tsx", kind: "component", summary: "Header", deps: ["next/link"] },
        { path: "README.md", kind: "config", summary: "Readme", deps: [] },
      ],
    };
    expect(shipPlanSchema.safeParse(v).success).toBe(true);
  });

  it("rejects unsafe path characters", () => {
    const bad = {
      files: [
        { path: "src/app/../../../etc/passwd", kind: "route", summary: "X", deps: [] },
      ],
    };
    expect(shipPlanSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    const bad = {
      files: [{ path: "src/x.ts", kind: "weird", summary: "X", deps: [] }],
    };
    expect(shipPlanSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects > 40 files", () => {
    const bad = {
      files: Array.from({ length: 41 }, (_, i) => ({
        path: `src/x${String(i)}.ts`,
        kind: "lib",
        summary: "x",
        deps: [],
      })),
    };
    expect(shipPlanSchema.safeParse(bad).success).toBe(false);
  });
});

describe("shipFileContentsSchema", () => {
  it("accepts a path + contents pair", () => {
    expect(
      shipFileContentsSchema.safeParse({ path: "src/a.tsx", contents: "export default 1" }).success,
    ).toBe(true);
  });
  it("rejects empty contents", () => {
    expect(shipFileContentsSchema.safeParse({ path: "a", contents: "" }).success).toBe(false);
  });
});

describe("shipReadmeSchema", () => {
  it("requires ≥ 20 chars of contents", () => {
    expect(shipReadmeSchema.safeParse({ contents: "short" }).success).toBe(false);
    expect(shipReadmeSchema.safeParse({ contents: "# Hello\n\nThis is a long enough README." }).success).toBe(true);
  });
});

describe("shipCommitMessageSchema", () => {
  it("enforces title 8-72 chars + body ≥ 10", () => {
    expect(
      shipCommitMessageSchema.safeParse({
        title: "feat: initial ship via PainPilot",
        body: "First commit with MVP scaffold + Stripe + Supabase.",
      }).success,
    ).toBe(true);
  });
  it("rejects a too-short title", () => {
    expect(
      shipCommitMessageSchema.safeParse({ title: "feat", body: "body body body" }).success,
    ).toBe(false);
  });
});
