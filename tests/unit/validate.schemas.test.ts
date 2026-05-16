import { describe, expect, it } from "vitest";
import {
  audienceSchema,
  competitorsSchema,
  featuresSchema,
  gtmSchema,
  wtpPricingSchema,
} from "@/server/validate/schemas";

describe("validate schemas", () => {
  it("audienceSchema parses a well-formed payload", () => {
    const v = {
      primary: {
        role: "Indie SaaS founder",
        size: "~50k",
        channels: ["r/SaaS", "Indie Hackers"],
        jobs_to_be_done: ["validate demand", "ship faster"],
      },
      secondary: [{ role: "Bootstrapper", size: "~10k" }],
      anti_personas: ["VC-funded enterprise"],
      confidence: 0.7,
    };
    expect(audienceSchema.safeParse(v).success).toBe(true);
  });

  it("audienceSchema rejects empty channels array", () => {
    const bad = {
      primary: { role: "X", size: "Y", channels: [], jobs_to_be_done: ["j"] },
      secondary: [],
      anti_personas: [],
      confidence: 0.5,
    };
    expect(audienceSchema.safeParse(bad).success).toBe(false);
  });

  it("competitorsSchema requires URLs", () => {
    const bad = {
      direct: [{ name: "X", url: "not-a-url", positioning: "p", pricing: "$10/mo", gap: "g" }],
      adjacent: [],
      moats: [],
      summary: "Some long enough summary text.",
    };
    expect(competitorsSchema.safeParse(bad).success).toBe(false);
  });

  it("competitorsSchema accepts a valid payload with optional arrays defaulted", () => {
    const v = {
      direct: [
        {
          name: "Stripe",
          url: "https://stripe.com",
          positioning: "payments for devs",
          pricing: "2.9% + 30¢",
          gap: "slow payouts",
        },
      ],
      adjacent: [],
      moats: ["network effects"],
      summary: "Crowded payments space dominated by Stripe.",
    };
    expect(competitorsSchema.safeParse(v).success).toBe(true);
  });

  it("wtpPricingSchema accepts valid bands + plans", () => {
    const v = {
      wtp_band: "$10-50",
      confidence: 0.8,
      rationale: "Survey signals from r/SaaS show $19-29/mo sweet spot.",
      plans: [
        { name: "Free", price_usd: 0, limits: "5 reports", target: "trial" },
        { name: "Pro", price_usd: 29, limits: "unlimited", target: "indie" },
      ],
    };
    expect(wtpPricingSchema.safeParse(v).success).toBe(true);
  });

  it("wtpPricingSchema rejects an unknown wtp_band enum", () => {
    const bad = {
      wtp_band: "$1m+",
      confidence: 0.5,
      rationale: "long enough rationale text",
      plans: [{ name: "X", price_usd: 1, limits: "L", target: "T" }],
    };
    expect(wtpPricingSchema.safeParse(bad).success).toBe(false);
  });

  it("featuresSchema enforces kebab-case slugs", () => {
    const bad = {
      mvp: [
        {
          slug: "Camel_Case_Slug",
          title: "X",
          desc: "Short desc",
          priority: "must",
        },
        { slug: "a", title: "Y", desc: "another", priority: "must" },
        { slug: "b", title: "Z", desc: "another", priority: "should" },
      ],
      v2: [],
    };
    expect(featuresSchema.safeParse(bad).success).toBe(false);
  });

  it("featuresSchema accepts valid mvp + empty v2", () => {
    const v = {
      mvp: [
        { slug: "signup", title: "Signup", desc: "Magic-link auth", priority: "must" },
        { slug: "feed", title: "Feed", desc: "Cluster cards", priority: "must" },
        { slug: "save", title: "Save", desc: "Pin a cluster", priority: "should" },
      ],
      v2: [],
    };
    expect(featuresSchema.safeParse(v).success).toBe(true);
  });

  it("gtmSchema accepts a representative payload", () => {
    const v = {
      channels: [
        {
          name: "Reddit r/SaaS",
          hypothesis: "Founders complain about Stripe here",
          first_move: "Post a recap thread of crawled complaints",
        },
      ],
      positioning: "The opportunity browser for indie founders.",
      first_100_users_plan: "Hand-curate 20 launches from saved clusters; founders DM us.",
      risks: ["Reddit moderators may purge", "Stripe rate-limits us"],
    };
    expect(gtmSchema.safeParse(v).success).toBe(true);
  });
});
