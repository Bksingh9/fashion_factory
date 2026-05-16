/**
 * zod schemas for the structured outputs of every Phase 3 prompt.
 *
 * Used by the Inngest pipeline (`pipeline.ts`) to validate LLM responses,
 * by the streaming route (`stream.ts`) to close-out streamed content with
 * a final validation pass, and by tests/verify-phase-3 for fixture
 * roundtrips. Mirrors the pattern at `/src/server/sources/schemas.ts`.
 *
 * Schema field names match the prompt body field names verbatim — any
 * drift between the body and the schema breaks the schema-retry path in
 * the LLM router.
 */
import { z } from "zod";

export const audienceSchema = z.object({
  primary: z.object({
    role: z.string().min(2),
    size: z.string().min(1),
    channels: z.array(z.string()).min(1).max(8),
    jobs_to_be_done: z.array(z.string()).min(1).max(8),
  }),
  secondary: z
    .array(z.object({ role: z.string().min(2), size: z.string().min(1) }))
    .max(3)
    .default([]),
  anti_personas: z.array(z.string()).max(5).default([]),
  confidence: z.number().min(0).max(1),
});
export type Audience = z.infer<typeof audienceSchema>;

export const competitorsSchema = z.object({
  direct: z
    .array(
      z.object({
        name: z.string().min(1),
        url: z.string().url(),
        positioning: z.string().min(1),
        pricing: z.string().min(1),
        gap: z.string().min(1),
      }),
    )
    .max(10)
    .default([]),
  adjacent: z
    .array(
      z.object({
        name: z.string().min(1),
        url: z.string().url(),
        positioning: z.string().min(1),
      }),
    )
    .max(10)
    .default([]),
  moats: z.array(z.string()).max(8).default([]),
  summary: z.string().min(10),
});
export type Competitors = z.infer<typeof competitorsSchema>;

export const wtpPricingSchema = z.object({
  wtp_band: z.enum(["<$10", "$10-50", "$50-200", "$200-1k", "$1k+"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(10),
  plans: z
    .array(
      z.object({
        name: z.string().min(1),
        price_usd: z.number().min(0),
        limits: z.string().min(1),
        target: z.string().min(1),
      }),
    )
    .min(1)
    .max(5),
});
export type WtpPricing = z.infer<typeof wtpPricingSchema>;

export const featuresSchema = z.object({
  mvp: z
    .array(
      z.object({
        slug: z.string().regex(/^[a-z0-9-]+$/, "kebab-case slug"),
        title: z.string().min(2),
        desc: z.string().min(5),
        priority: z.enum(["must", "should", "could"]),
      }),
    )
    .min(3)
    .max(12),
  v2: z
    .array(
      z.object({
        slug: z.string().regex(/^[a-z0-9-]+$/, "kebab-case slug"),
        title: z.string().min(2),
        desc: z.string().min(5),
      }),
    )
    .max(15)
    .default([]),
});
export type Features = z.infer<typeof featuresSchema>;

export const gtmSchema = z.object({
  channels: z
    .array(
      z.object({
        name: z.string().min(1),
        hypothesis: z.string().min(5),
        first_move: z.string().min(5),
      }),
    )
    .min(1)
    .max(8),
  positioning: z.string().min(10),
  first_100_users_plan: z.string().min(10),
  risks: z.array(z.string()).min(1).max(6),
});
export type Gtm = z.infer<typeof gtmSchema>;

export const specSummarySchema = z.object({
  title: z.string().min(6),
  markdown: z.string().min(50),
});
export type SpecSummary = z.infer<typeof specSummarySchema>;

/** Map of section kind → schema. Drives dispatch in pipeline.ts. */
export const SECTION_SCHEMAS = {
  audience: audienceSchema,
  competitors: competitorsSchema,
  wtp_pricing: wtpPricingSchema,
  features: featuresSchema,
  gtm: gtmSchema,
} as const;

export type SectionKind = keyof typeof SECTION_SCHEMAS;
