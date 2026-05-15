/**
 * Service-role Supabase client.
 *
 * BYPASSES RLS. Never import from /src/app/* — only from /src/server/* code
 * that intentionally needs admin-level reads/writes (webhook handlers,
 * Inngest functions, server actions explicitly marked admin).
 *
 * Throws if called from a browser environment.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/env";
import type { Database } from "@/types/database";

let cached: SupabaseClient<Database> | null = null;

export function supabaseService(): SupabaseClient<Database> {
  if (typeof window !== "undefined") {
    throw new Error(
      "supabaseService() called in a browser context. The service-role key must never leave the server.",
    );
  }
  if (cached !== null) return cached;
  cached = createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return cached;
}
