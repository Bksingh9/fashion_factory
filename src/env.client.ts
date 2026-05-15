/**
 * Browser-safe environment variables.
 *
 * Importable from `"use client"` components. Only NEXT_PUBLIC_* vars are
 * defined here — every other secret stays out of the client bundle.
 *
 * `process.env.NEXT_PUBLIC_*` is statically replaced by Next at build time,
 * so this module's runtime cost in the browser is just the zod parse.
 */
import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SENTRY_DSN: z.string().min(1),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

// In the browser, only NEXT_PUBLIC_* keys exist on process.env after Next's
// build-time substitution. Build the source object explicitly so we don't
// accidentally trip on missing server keys when running in the browser.
const source = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
};

const parsed = schema.safeParse(source);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid public environment variables:\n${issues}`);
}

export const clientEnv = parsed.data;
export type ClientEnv = typeof clientEnv;
