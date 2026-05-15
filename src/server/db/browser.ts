/**
 * Supabase browser client.
 *
 * Singleton per page-load. Bound to NEXT_PUBLIC_* env only. Used from
 * `"use client"` components.
 */
import { createBrowserClient } from "@supabase/ssr";
import { clientEnv } from "@/env.client";
import type { Database } from "@/types/database";

let cached: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function supabaseBrowser(): ReturnType<typeof createBrowserClient<Database>> {
  if (cached !== null) return cached;
  cached = createBrowserClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  return cached;
}
