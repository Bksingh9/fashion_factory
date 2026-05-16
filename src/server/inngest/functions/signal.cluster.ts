/**
 * signal.cluster — `signal.embedded` worker.
 *
 * Steps:
 *   1. load            — read embedding + body for the signal.
 *   2. assign          — kNN against `clusters.centroid`; if cosine sim >
 *                        threshold, attach to the existing cluster +
 *                        update its centroid (running mean) +
 *                        member_count + last_signal_at. Otherwise create
 *                        a new cluster with this embedding as centroid.
 *   3. extract         — `llm.hot` with the `extract.signals` prompt;
 *                        zod-parse against extractSignalsSchema; write
 *                        `signals.extracted`.
 *   4. fanout          — sendEvent `cluster.touched`.
 */
import { inngest } from "../client";
import { llm } from "@/server/llm/router";
import {
  cosineSimilarity,
  DEFAULT_CLUSTER_THRESHOLD,
  stringToVector,
  updateCentroid,
  vectorToString,
} from "@/server/llm/vector";
import { supabaseService } from "@/server/db/service";
import { extractSignalsSchema } from "@/server/sources/schemas";

export interface NeighborCluster {
  id: string;
  centroid: number[];
  member_count: number;
}

/**
 * Pure helper: pick the best neighbor whose cosine sim >= threshold, or
 * return `null` to signal "create new cluster". Drives the verify-phase-2
 * `cluster assignment unit` check and the cluster.assign.test.ts coverage.
 */
export function assignClusterForTest(
  embedding: readonly number[],
  neighbors: readonly NeighborCluster[],
  threshold: number = DEFAULT_CLUSTER_THRESHOLD,
): { matchedId: string | null; matchedSim: number } {
  let bestId: string | null = null;
  let bestSim = -Infinity;
  for (const n of neighbors) {
    const sim = cosineSimilarity(embedding, n.centroid);
    if (sim > bestSim) {
      bestSim = sim;
      bestId = n.id;
    }
  }
  if (bestId !== null && bestSim >= threshold) {
    return { matchedId: bestId, matchedSim: bestSim };
  }
  return { matchedId: null, matchedSim: bestSim === -Infinity ? 0 : bestSim };
}

export const signalCluster = inngest.createFunction(
  {
    id: "signal.cluster",
    retries: 2,
    triggers: [{ event: "signal.embedded" }],
  },
  async ({ event, step }) => {
    const signalId = event.data.signal_id;

    const signal = await step.run("load", async () => {
      const sb = supabaseService();
      const { data, error } = await sb
        .from("signals")
        .select("id, title, body, embedding")
        .eq("id", signalId)
        .maybeSingle();
      if (error !== null) throw new Error(`signals read: ${error.message}`);
      if (data === null) throw new Error(`signals: row ${signalId} not found`);
      if (data.embedding === null) throw new Error(`signals: ${signalId} has no embedding`);
      return { ...data, embedding: stringToVector(data.embedding) };
    });

    const clusterId = await step.run("assign", async () => {
      const sb = supabaseService();
      // Phase 2 uses client-side kNN: pull the most-recently-touched 200
      // cluster centroids and pick the nearest in JS. Cheap and correct at
      // MVP scale (<10k clusters). When cluster cardinality grows, swap in
      // a Postgres stored function that wraps `order by centroid <=> $1
      // using hnsw` so the planner uses the HNSW index. The pgvector
      // index is already in place (migration 0003), just unused for now.
      const embeddingLiteral = vectorToString(signal.embedding);
      const { data: candidates, error: cErr } = await sb
        .from("clusters")
        .select("id, centroid, member_count")
        .order("last_signal_at", { ascending: false })
        .limit(200);
      if (cErr !== null) throw new Error(`clusters read: ${cErr.message}`);

      const neighbors: NeighborCluster[] = (candidates ?? []).map((c) => ({
        id: c.id,
        centroid: stringToVector(c.centroid),
        member_count: c.member_count,
      }));

      const { matchedId } = assignClusterForTest(
        signal.embedding,
        neighbors,
        DEFAULT_CLUSTER_THRESHOLD,
      );

      const matchedNeighbor =
        matchedId === null ? null : neighbors.find((n) => n.id === matchedId) ?? null;

      if (matchedId !== null && matchedNeighbor !== null) {
        // Existing cluster: update centroid (running mean) + member_count + last_signal_at.
        const newCentroid = updateCentroid(
          matchedNeighbor.centroid,
          matchedNeighbor.member_count,
          signal.embedding,
        );
        const { error: updErr } = await sb
          .from("clusters")
          .update({
            centroid: vectorToString(newCentroid),
            member_count: matchedNeighbor.member_count + 1,
            last_signal_at: new Date().toISOString(),
          })
          .eq("id", matchedId);
        if (updErr !== null) throw new Error(`cluster update: ${updErr.message}`);

        const { error: bindErr } = await sb
          .from("signals")
          .update({ cluster_id: matchedId })
          .eq("id", signalId);
        if (bindErr !== null) throw new Error(`signal cluster_id update: ${bindErr.message}`);
        return matchedId;
      }

      // No match → create a fresh cluster centred on this embedding.
      const { data: created, error: createErr } = await sb
        .from("clusters")
        .insert({ centroid: embeddingLiteral, member_count: 1 })
        .select("id")
        .single();
      if (createErr !== null) throw new Error(`cluster insert: ${createErr.message}`);
      if (created === null) throw new Error("cluster insert returned no row");
      const newId = created.id;

      const { error: bindErr } = await sb
        .from("signals")
        .update({ cluster_id: newId })
        .eq("id", signalId);
      if (bindErr !== null) throw new Error(`signal cluster_id update: ${bindErr.message}`);
      return newId;
    });

    await step.run("extract", async () => {
      const input = `${signal.title ?? ""}\n${signal.body}`.trim();
      const result = await llm.hot({
        purpose: "extract.signals",
        promptName: "extract.signals",
        schema: extractSignalsSchema,
        messages: [{ role: "user", content: input }],
      });
      // result.data is either the parsed object (schema matched) or the raw string.
      const extracted = typeof result.data === "object" ? result.data : null;
      if (extracted === null) {
        console.warn(`[signal.cluster] extract.signals returned unparseable JSON for ${signalId}`);
        return;
      }
      const sb = supabaseService();
      const { error } = await sb
        .from("signals")
        .update({ extracted })
        .eq("id", signalId);
      if (error !== null) {
        console.error(`[signal.cluster] extracted write failed: ${error.message}`);
      }
    });

    await step.sendEvent("emit-touched", {
      name: "cluster.touched",
      data: { cluster_id: clusterId },
    });

    return { signal_id: signalId, cluster_id: clusterId };
  },
);
