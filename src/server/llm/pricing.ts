/**
 * Cost calculation for LLM calls.
 *
 * Prices live in the `models` table and are loaded by `registry.ts`. This
 * module is pure: hand it the per-1M numbers and token counts, get USD back.
 */

export interface PricePerMillion {
  inputPer1m: number | null;
  outputPer1m: number | null;
}

export function computeCost(
  price: PricePerMillion,
  inputTokens: number,
  outputTokens: number,
): number {
  const inputCost =
    price.inputPer1m === null ? 0 : (inputTokens / 1_000_000) * price.inputPer1m;
  const outputCost =
    price.outputPer1m === null ? 0 : (outputTokens / 1_000_000) * price.outputPer1m;
  // Round to 6 decimal places — matches the `numeric(12, 6)` columns.
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}
