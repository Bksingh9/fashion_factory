/**
 * crawl.run — `crawl.run.requested` worker.
 *
 * Steps:
 *   1. load-cursor      — latest crawl_runs.cursor for the source.
 *   2. fetch            — invoke the crawler module (no DB writes).
 *   3. persist          — INSERT … ON CONFLICT DO NOTHING; capture newly-
 *                         inserted ids.
 *   4. log-run          — write a crawl_runs row.
 *   5. fanout-ingested  — sendEvent `signal.ingested` per new id.
 */
import { inngest } from "../client";
import { supabaseService } from "@/server/db/service";
import type { CrawlSourceId } from "@/types/database";
import type { Crawler, RawSignal } from "@/server/sources/types";

import reddit from "@/server/sources/reddit";
import hn from "@/server/sources/hn";
import ph from "@/server/sources/ph";
import app_store from "@/server/sources/app_store";
import play_store from "@/server/sources/play_store";
import trustpilot from "@/server/sources/trustpilot";
import g2 from "@/server/sources/g2";
import ih from "@/server/sources/ih";

const CRAWLERS: Record<CrawlSourceId, Crawler> = {
  reddit,
  hn,
  ph,
  app_store,
  play_store,
  trustpilot,
  g2,
  ih,
};

/**
 * Pure: dedup raw rows by (source, source_id). Used both by the Inngest
 * worker (before the DB roundtrip) and the verify-phase-2 dedup test.
 */
export function dedupRawSignals(rows: readonly RawSignal[]): RawSignal[] {
  const seen = new Set<string>();
  const out: RawSignal[] = [];
  for (const r of rows) {
    const k = `${r.source}:${r.source_id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/**
 * Persist rows to Supabase. Dedups in-memory first, then writes with an
 * upsert that ignores conflicts on the (source, source_id) unique index.
 * Returns ids that were actually inserted (i.e. were NEW).
 *
 * Note: Supabase's upsert+ignoreDuplicates returns rows considered for
 * insert. To get only the *truly new* rows, we read back `(source,
 * source_id)` and rely on the unique-constraint behaviour.
 */
export async function persistSignals(
  rows: readonly RawSignal[],
): Promise<{ insertedIds: string[]; consideredCount: number; insertedCount: number }> {
  const deduped = dedupRawSignals(rows);
  if (deduped.length === 0) {
    return { insertedIds: [], consideredCount: 0, insertedCount: 0 };
  }
  const sb = supabaseService();

  // Pre-check which (source, source_id) pairs already exist; only insert the new ones.
  const sourceIds = deduped.map((d) => d.source_id);
  const source = deduped[0]?.source;
  if (source === undefined) {
    return { insertedIds: [], consideredCount: deduped.length, insertedCount: 0 };
  }
  const { data: existing } = await sb
    .from("signals")
    .select("source_id")
    .eq("source", source)
    .in("source_id", sourceIds);
  const existingIds = new Set((existing ?? []).map((r) => r.source_id));
  const fresh = deduped.filter((d) => !existingIds.has(d.source_id));

  if (fresh.length === 0) {
    return { insertedIds: [], consideredCount: deduped.length, insertedCount: 0 };
  }

  const { data, error } = await sb
    .from("signals")
    .insert(
      fresh.map((r) => ({
        source: r.source,
        source_id: r.source_id,
        url: r.url,
        title: r.title,
        body: r.body,
        author: r.author,
        posted_at: r.posted_at,
        score: r.score,
        comments_count: r.comments_count,
      })),
    )
    .select("id");
  if (error !== null) throw new Error(`signals insert: ${error.message}`);

  const insertedIds = (data ?? []).map((d) => d.id);
  return {
    insertedIds,
    consideredCount: deduped.length,
    insertedCount: insertedIds.length,
  };
}

export const crawlRun = inngest.createFunction(
  {
    id: "crawl.run",
    retries: 3,
    triggers: [{ event: "crawl.run.requested" }],
  },
  async ({ event, step }) => {
    // Inngest's AppEvents union types event.data; the client's runtime
    // generic isn't passed (we don't `new Inngest<...>({schemas})`), so
    // narrow via a single cast to the declared union.
    const source = event.data.source as CrawlSourceId;

    const { cursor, params } = await step.run("load-cursor", async () => {
      const sb = supabaseService();
      const [srcRes, runRes] = await Promise.all([
        sb.from("crawl_sources").select("params").eq("id", source).maybeSingle(),
        sb
          .from("crawl_runs")
          .select("cursor")
          .eq("source", source)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (srcRes.error !== null) throw new Error(`crawl_sources read: ${srcRes.error.message}`);
      const paramsObj = (srcRes.data?.params ?? {}) as Record<string, unknown>;
      const cursorVal = runRes.data?.cursor ?? null;
      return { cursor: cursorVal, params: paramsObj };
    });

    const result = await step.run("fetch", async () => {
      const crawler = CRAWLERS[source];
      return crawler({ cursor, params });
    });

    const persisted = await step.run("persist", async () => {
      return persistSignals(result.items);
    });

    await step.run("log-run", async () => {
      const sb = supabaseService();
      const { error } = await sb.from("crawl_runs").insert({
        source,
        finished_at: new Date().toISOString(),
        cursor: result.nextCursor,
        items_fetched: result.items.length,
        items_kept: persisted.insertedCount,
      });
      if (error !== null) {
        // Loud — don't throw, let the rest of the pipeline proceed.
        console.error(`crawl_runs insert failed: ${error.message}`);
      }
    });

    if (persisted.insertedIds.length > 0) {
      await step.sendEvent(
        "fanout-ingested",
        persisted.insertedIds.map((id) => ({
          name: "signal.ingested" as const,
          data: { signal_id: id },
        })),
      );
    }

    return {
      source,
      fetched: result.items.length,
      considered: persisted.consideredCount,
      inserted: persisted.insertedCount,
    };
  },
);
