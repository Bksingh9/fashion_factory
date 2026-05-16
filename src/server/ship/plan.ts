/**
 * Ship plan — the structured file list the LLM produces from a locked
 * spec, plus helpers to turn a plan into a list of generation calls.
 *
 * The plan + per-file generation are split so the Inngest pipeline can
 * `step.parallel` over independent files (after the plan resolves).
 */
import { z } from "zod";

export const shipPlanFileSchema = z.object({
  path: z.string().regex(/^[a-zA-Z0-9._\-/]+$/, "safe path"),
  kind: z.enum(["route", "component", "lib", "config", "test"]),
  summary: z.string().min(3),
  deps: z.array(z.string()).max(20).default([]),
});

export const shipPlanSchema = z.object({
  files: z.array(shipPlanFileSchema).min(1).max(40),
});
export type ShipPlan = z.infer<typeof shipPlanSchema>;
export type ShipPlanFile = z.infer<typeof shipPlanFileSchema>;

export const shipFileContentsSchema = z.object({
  path: z.string().min(1),
  contents: z.string().min(1),
});
export type ShipFileContents = z.infer<typeof shipFileContentsSchema>;

export const shipReadmeSchema = z.object({
  contents: z.string().min(20),
});

export const shipCommitMessageSchema = z.object({
  title: z.string().min(8).max(72),
  body: z.string().min(10),
});
