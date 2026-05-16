/**
 * privacy.purge_authors — daily cron, 03:00 UTC.
 *
 * Honors invariant §9: "Never store Reddit usernames longer than 90 days
 * unless the cluster has been Saved by a user."
 *
 * For every signal where `author_collected_at < now() - 90d` AND the
 * containing cluster has NO `cluster_saves` row, NULL the author +
 * author_collected_at fields. Saved clusters are exempt.
 *
 * `buildPurgeSql()` is a pure helper that returns the equivalent
 * single-statement SQL — used by verify-phase-2 (and as documentation
 * for what the JS-driven implementation actually computes).
 */
import { inngest } from "../client";
import { supabaseService } from "@/server/db/service";
import { log } from "@/lib/log";

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Documentation-grade SQL describing what the purge does. The actual
 * implementation walks Supabase via the JS client (raw SQL through the
 * client requires a stored function we haven't shipped yet). Kept here so
 * verify-phase-2 can structurally assert the intent — and so a DBA can
 * reproduce the effect by hand.
 */
export function buildPurgeSql(): string {
  return [
    "update signals",
    "   set author = null,",
    "       author_collected_at = null",
    " where author is not null",
    "   and author_collected_at < now() - interval '90 days'",
    "   and (cluster_id is null",
    "        or cluster_id not in (select cluster_id from cluster_saves));",
  ].join("\n");
}

export interface PurgeResult {
  candidates: number;
  saved_exempt: number;
  purged: number;
}

/**
 * Test/verify hook: drives the purge logic against the supabaseService()
 * client (real DB locally; mock setups can substitute the service-role
 * client via dependency injection in a later phase if needed).
 */
export async function purgeAuthors(): Promise<PurgeResult> {
  const sb = supabaseService();
  const cutoffIso = new Date(Date.now() - RETENTION_MS).toISOString();

  const { data: candidates, error: cErr } = await sb
    .from("signals")
    .select("id, cluster_id")
    .not("author", "is", null)
    .lt("author_collected_at", cutoffIso);
  if (cErr !== null) throw new Error(`purge candidates: ${cErr.message}`);
  if (candidates === null || candidates.length === 0) {
    return { candidates: 0, saved_exempt: 0, purged: 0 };
  }

  const clusterIds = candidates
    .map((c) => c.cluster_id)
    .filter((id): id is string => id !== null);
  let savedClusterIds = new Set<string>();
  if (clusterIds.length > 0) {
    const { data: saves, error: sErr } = await sb
      .from("cluster_saves")
      .select("cluster_id")
      .in("cluster_id", clusterIds);
    if (sErr !== null) throw new Error(`purge cluster_saves probe: ${sErr.message}`);
    savedClusterIds = new Set((saves ?? []).map((s) => s.cluster_id));
  }

  const toPurge = candidates.filter(
    (c) => c.cluster_id === null || !savedClusterIds.has(c.cluster_id),
  );
  if (toPurge.length === 0) {
    return { candidates: candidates.length, saved_exempt: candidates.length, purged: 0 };
  }

  const { error: upErr } = await sb
    .from("signals")
    .update({ author: null, author_collected_at: null })
    .in(
      "id",
      toPurge.map((t) => t.id),
    );
  if (upErr !== null) throw new Error(`purge update: ${upErr.message}`);

  return {
    candidates: candidates.length,
    saved_exempt: candidates.length - toPurge.length,
    purged: toPurge.length,
  };
}

export const privacyPurgeAuthors = inngest.createFunction(
  {
    id: "privacy.purge_authors",
    retries: 2,
    triggers: [{ cron: "0 3 * * *" }],
  },
  async ({ step }) => {
    const result = await step.run("purge", purgeAuthors);
    log.info("privacy.purge_authors", {
      candidates: result.candidates,
      saved_exempt: result.saved_exempt,
      purged: result.purged,
    });
    return result;
  },
);
