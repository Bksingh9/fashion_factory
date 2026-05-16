#!/usr/bin/env tsx
/**
 * Affiliate rotation script. Idempotent.
 *
 * Reads `affiliates where active = true`, redistributes rotation_weight
 * proportionally to recent clicks (last 30 days) so high-performing
 * partners get more impressions. Floor at 10 to keep underperformers
 * in the pool.
 *
 * Run nightly via Inngest cron (`marketplace.affiliate_rotate`) or
 * manually via `pnpm tsx scripts/rotate-affiliates.ts`.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database";

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url === undefined || key === undefined) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const sb = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: affiliates, error } = await sb
    .from("affiliates")
    .select("id, slug, active, rotation_weight")
    .eq("active", true);
  if (error !== null) throw new Error(`affiliates read: ${error.message}`);
  if (affiliates === null || affiliates.length === 0) {
    console.log("No active affiliates to rotate.");
    return;
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const updates: { id: string; weight: number }[] = [];

  for (const a of affiliates) {
    const { count } = await sb
      .from("affiliate_clicks")
      .select("id", { count: "exact", head: true })
      .eq("affiliate_id", a.id)
      .gte("created_at", thirtyDaysAgo);
    const weight = Math.max(10, (count ?? 0) + 10);
    updates.push({ id: a.id, weight });
  }

  for (const u of updates) {
    const { error: upErr } = await sb
      .from("affiliates")
      .update({ rotation_weight: u.weight })
      .eq("id", u.id);
    if (upErr !== null) {
      console.error(`Failed to update ${u.id}: ${upErr.message}`);
    }
  }

  console.log(`Updated rotation_weight on ${String(updates.length)} affiliates.`);
}

void main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
