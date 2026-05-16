/**
 * Performance budget scanner.
 *
 * Computes p95s from recent `llm_traces` + crawl_runs + ship_runs and
 * writes a `perf_budget_violations` row when a §6 budget breaks.
 *
 * Phase 6 ships the structure + stub-mode skip; real p95 computation
 * over rolling windows lands in Phase 6.5.
 */
import { supabaseService } from "@/server/db/service";

export const BUDGETS = {
  marketplace_ttfb_ms: 200,
  app_feed_ms: 800,
  validate_total_ms: 12_000,
  spec_generate_stream_first_byte_ms: 1_000,
  ship_repo_created_ms: 20_000,
  crawl_lag_min: 30,
  llm_cache_hit_rate: 0.55,
  sentry_error_rate: 0.005,
} as const;

export type BudgetMetric = keyof typeof BUDGETS;

export interface Violation {
  route: string;
  metric: BudgetMetric;
  threshold: number;
  observed: number;
  window: string;
}

export async function recordViolation(v: Violation): Promise<void> {
  const sb = supabaseService();
  const { error } = await sb.from("perf_budget_violations").insert({
    route: v.route,
    metric: v.metric,
    threshold: v.threshold,
    observed: v.observed,
    window: v.window,
  });
  if (error !== null) {
    console.error(`[perf] violation insert failed: ${error.message}`);
  }
}

/**
 * Pure: given a list of latencies and a threshold, returns the p95 +
 * whether it violates. Sortable in place; caller can pass spread arrays.
 */
export function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return sorted[idx] ?? 0;
}
