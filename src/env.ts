/**
 * Single source of truth for environment variables.
 *
 * Imports are eager — this module throws at load time if any required var is
 * missing or malformed. Every feature module reads env via `import { env } from "@/env"`,
 * never via `process.env` directly. Secrets are never logged.
 */
import { z } from "zod";

const schema = z.object({
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // LLM providers
  ANTHROPIC_API_KEY: z.string().min(1),
  GROQ_API_KEY: z.string().min(1),
  PERPLEXITY_API_KEY: z.string().min(1),
  VOYAGE_API_KEY: z.string().min(1),
  COHERE_API_KEY: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  BRAVE_SEARCH_API_KEY: z.string().min(1),

  // Stripe
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),

  // Polar
  POLAR_ACCESS_TOKEN: z.string().min(1),
  POLAR_WEBHOOK_SECRET: z.string().min(1),
  // Phase 5: org id + configurable rev-share. Defaults to 1000 bps (10%).
  POLAR_ORG_ID: z.string().min(1).optional(),
  PAINPILOT_REVENUE_SHARE_BPS: z.coerce.number().int().min(0).max(10000).optional(),

  // Upstash Redis
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),

  // Inngest
  INNGEST_EVENT_KEY: z.string().min(1),
  INNGEST_SIGNING_KEY: z.string().min(1),

  // Email
  RESEND_API_KEY: z.string().min(1),
  FROM_EMAIL: z.string().email(),

  // Langfuse
  LANGFUSE_PUBLIC_KEY: z.string().min(1),
  LANGFUSE_SECRET_KEY: z.string().min(1),
  LANGFUSE_HOST: z.string().url(),

  // Axiom
  AXIOM_TOKEN: z.string().min(1),
  AXIOM_DATASET: z.string().min(1),

  // Sentry
  SENTRY_DSN: z.string().min(1),
  NEXT_PUBLIC_SENTRY_DSN: z.string().min(1),

  // PostHog
  NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url(),

  // Reddit OAuth (optional — anonymous JSON fallback at reddit.com/r/X/new.json
  // works without these. Provide them only if you want OAuth's higher rate ceiling).
  REDDIT_CLIENT_ID: z.string().min(1).optional(),
  REDDIT_CLIENT_SECRET: z.string().min(1).optional(),

  // Product Hunt GraphQL (Phase 2 listen).
  PRODUCT_HUNT_API_TOKEN: z.string().min(1),

  // Vercel deploy (Phase 4 ship). Both optional — the ship pipeline
  // skips the deploy step when either is absent.
  VERCEL_API_TOKEN: z.string().min(1).optional(),
  VERCEL_TEAM_ID: z.string().min(1).optional(),

  // Optional override for the default ship template repo URL.
  SHIP_TEMPLATE_REPO: z.string().url().optional(),

  // Phase 6 ops knobs (all .optional()).
  STAGING: z.string().optional(),
  EVAL_FAIL_ON_REGRESSION: z.string().optional(),
  LANGFUSE_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url(),
  REDDIT_USER_AGENT: z.string().min(1),

  // GitHub App
  GITHUB_APP_ID: z.string().min(1),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1),
  GITHUB_APP_CLIENT_ID: z.string().min(1),
  GITHUB_APP_CLIENT_SECRET: z.string().min(1),
  GITHUB_APP_WEBHOOK_SECRET: z.string().min(1),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment variables:\n${issues}`);
}

export const env = parsed.data;
export type Env = typeof env;
