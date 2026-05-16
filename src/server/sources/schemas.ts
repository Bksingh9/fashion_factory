/**
 * zod schemas for the LLM-validated outputs produced during Phase 2's
 * extract + summarize steps. Imported by:
 *   - `signal.cluster` Inngest function (extract.signals output)
 *   - `cluster.summarize` Inngest function (cluster.summarize output)
 *
 * The schemas live with the crawlers (not under /src/server/llm/) because
 * they describe Phase 2's domain shapes, not the router itself.
 *
 * Bodies for the matching prompts are seeded by migration 0003 in chunk 5.
 */
import { z } from "zod";

export const extractSignalsSchema = z.object({
  pain: z.string().min(4),
  audience: z.string().min(2),
  current_solution: z.string().nullable(),
  willingness_to_pay: z.enum(["none", "low", "medium", "high"]),
  keywords: z.array(z.string()).min(1).max(8),
});
export type ExtractSignals = z.infer<typeof extractSignalsSchema>;

export const clusterSummarySchema = z.object({
  title: z.string().min(8),
  summary: z.string().min(20),
  pain_score: z.number().min(0).max(10),
  audience: z.string().min(2),
  keywords: z.array(z.string()).min(3).max(10),
});
export type ClusterSummary = z.infer<typeof clusterSummarySchema>;
