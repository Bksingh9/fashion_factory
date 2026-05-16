/**
 * cluster.summarize — `cluster.touched` worker, debounced 5m by cluster_id.
 *
 * Debounce semantics: when many signals land in the same cluster in a short
 * window, only the LAST event in a 5m bucket fires the handler. Saves LLM
 * cost and keeps the summary fresh-ish without thrashing.
 *
 * Steps:
 *   1. load-members — top 10 signals for the cluster by score desc.
 *   2. summarize    — llm.premium with the `cluster.summarize` prompt.
 *   3. persist      — write title/summary/pain_score/audience/keywords.
 */
import { inngest } from "../client";
import { llm } from "@/server/llm/router";
import { supabaseService } from "@/server/db/service";
import { clusterSummarySchema } from "@/server/sources/schemas";

export const clusterSummarize = inngest.createFunction(
  {
    id: "cluster.summarize",
    retries: 2,
    debounce: { period: "5m", key: "event.data.cluster_id" },
    triggers: [{ event: "cluster.touched" }],
  },
  async ({ event, step }) => {
    const clusterId = event.data.cluster_id;

    const members = await step.run("load-members", async () => {
      const sb = supabaseService();
      const { data, error } = await sb
        .from("signals")
        .select("title, body, score, posted_at")
        .eq("cluster_id", clusterId)
        .order("score", { ascending: false, nullsFirst: false })
        .limit(10);
      if (error !== null) throw new Error(`signals read: ${error.message}`);
      return data ?? [];
    });

    if (members.length === 0) {
      return { cluster_id: clusterId, skipped: "no-members" as const };
    }

    const summary = await step.run("summarize", async () => {
      const input = members
        .map((s, i) => `# Signal ${String(i + 1)}\nTitle: ${s.title ?? "(no title)"}\nBody: ${s.body}`)
        .join("\n\n");
      const result = await llm.premium({
        purpose: "cluster.summarize",
        promptName: "cluster.summarize",
        schema: clusterSummarySchema,
        messages: [{ role: "user", content: input }],
      });
      return typeof result.data === "object" ? result.data : null;
    });

    if (summary === null) {
      console.warn(
        `[cluster.summarize] LLM returned unparseable JSON for ${clusterId}; not updating cluster row`,
      );
      return { cluster_id: clusterId, skipped: "unparseable" as const };
    }

    await step.run("persist", async () => {
      const sb = supabaseService();
      const { error } = await sb
        .from("clusters")
        .update({
          title: summary.title,
          summary: summary.summary,
          pain_score: summary.pain_score,
          audience: summary.audience,
          keywords: summary.keywords,
        })
        .eq("id", clusterId);
      if (error !== null) throw new Error(`cluster update: ${error.message}`);
    });

    return { cluster_id: clusterId, title: summary.title };
  },
);
