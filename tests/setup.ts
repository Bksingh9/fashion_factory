/**
 * Vitest setup — runs before any test module is imported.
 *
 * Populates dummy values for every required env var so env.ts doesn't throw
 * at module-load. URL/email fields get format-correct stubs. All "stub"
 * flags are flipped on so I/O routes to in-memory fakes.
 */

const DUMMY: Record<string, string> = {
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: "https://stub.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "stub",
  SUPABASE_SERVICE_ROLE_KEY: "stub",
  // LLM
  ANTHROPIC_API_KEY: "stub",
  GROQ_API_KEY: "stub",
  PERPLEXITY_API_KEY: "stub",
  VOYAGE_API_KEY: "stub",
  COHERE_API_KEY: "stub",
  OPENROUTER_API_KEY: "stub",
  BRAVE_SEARCH_API_KEY: "stub",
  // Stripe
  STRIPE_SECRET_KEY: "sk_test_stub",
  STRIPE_WEBHOOK_SECRET: "whsec_stub",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_stub",
  // Polar
  POLAR_ACCESS_TOKEN: "stub",
  POLAR_WEBHOOK_SECRET: "stub",
  // Upstash
  UPSTASH_REDIS_REST_URL: "https://stub.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "stub",
  // Inngest
  INNGEST_EVENT_KEY: "stub",
  INNGEST_SIGNING_KEY: "signkey-stub-12345",
  // Email
  RESEND_API_KEY: "stub",
  FROM_EMAIL: "stub@example.com",
  // Langfuse
  LANGFUSE_PUBLIC_KEY: "stub",
  LANGFUSE_SECRET_KEY: "stub",
  LANGFUSE_HOST: "https://stub.langfuse.com",
  // Axiom
  AXIOM_TOKEN: "stub",
  AXIOM_DATASET: "stub",
  // Sentry
  SENTRY_DSN: "stub",
  NEXT_PUBLIC_SENTRY_DSN: "stub",
  // PostHog
  NEXT_PUBLIC_POSTHOG_KEY: "stub",
  NEXT_PUBLIC_POSTHOG_HOST: "https://stub.i.posthog.com",
  // App
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  REDDIT_USER_AGENT: "painpilot-test/0.1",
  // GitHub
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY: "stub",
  GITHUB_APP_CLIENT_ID: "stub",
  GITHUB_APP_CLIENT_SECRET: "stub",
  GITHUB_APP_WEBHOOK_SECRET: "stub",
};

for (const [k, v] of Object.entries(DUMMY)) {
  if (process.env[k] === undefined) process.env[k] = v;
}

// Stub knobs — turn on in-memory fakes for every external integration.
process.env.LLM_STUB = process.env.LLM_STUB ?? "1";
process.env.STRIPE_STUB = process.env.STRIPE_STUB ?? "1";
process.env.RATELIMIT_STUB = process.env.RATELIMIT_STUB ?? "1";
process.env.OBSERVABILITY_STUB = process.env.OBSERVABILITY_STUB ?? "1";

// NODE_ENV is declared readonly by Next's process types. Vitest sets it to
// "test" already; we don't touch it here.
