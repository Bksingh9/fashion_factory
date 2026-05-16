/**
 * signal.embed — `signal.ingested` worker.
 *
 * Steps:
 *   1. load    — read the freshly-ingested signal row.
 *   2. embed   — call `llm.embed` (title + body); router routes via voyage
 *                in prod or the stub provider in tests/sandbox.
 *   3. persist — write `signals.embedding` (vector(1024) over the wire).
 *   4. fanout  — sendEvent `signal.embedded`.
 */
import { inngest } from "../client";
import { llm } from "@/server/llm/router";
import { vectorToString } from "@/server/llm/vector";
import { supabaseService } from "@/server/db/service";

/**
 * Pure-ish helper used by tests + verify-phase-2: takes a signal body and
 * returns the embedding vector. No DB; routes through the (stubbed in test
 * mode) LLM router.
 */
export async function embedSignalForTest(
  body: string,
): Promise<{ embedding: number[] }> {
  const result = await llm.embed({ input: body, purpose: "signal.embed" });
  return { embedding: result.embeddings[0] ?? [] };
}

export const signalEmbed = inngest.createFunction(
  {
    id: "signal.embed",
    retries: 2,
    triggers: [{ event: "signal.ingested" }],
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
      return data;
    });

    // Already embedded → no-op.
    if (signal.embedding !== null) {
      return { signal_id: signalId, skipped: "already-embedded" as const };
    }

    const { embedding } = await step.run("embed", async () => {
      const input = `${signal.title ?? ""}\n${signal.body}`.trim();
      return embedSignalForTest(input);
    });

    await step.run("persist", async () => {
      const sb = supabaseService();
      const { error } = await sb
        .from("signals")
        .update({ embedding: vectorToString(embedding) })
        .eq("id", signalId);
      if (error !== null) throw new Error(`signals update: ${error.message}`);
    });

    await step.sendEvent("emit-embedded", {
      name: "signal.embedded",
      data: { signal_id: signalId },
    });

    return { signal_id: signalId, dim: embedding.length };
  },
);
