/**
 * Revenue share — pure math.
 *
 * computePayout(gross, bps) returns { gross, fee, net }. bps is basis
 * points (1 bps = 0.01%); 1000 = 10% fee.
 *
 * The Inngest `payouts.compute` cron uses this to roll up product_metrics
 * MRR into per-user monthly payouts.
 */

export interface PayoutMath {
  gross_usd: number;
  fee_usd: number;
  net_usd: number;
}

export function computePayout(grossUsd: number, revenueShareBps: number): PayoutMath {
  if (grossUsd < 0) throw new Error("gross must be non-negative");
  if (revenueShareBps < 0 || revenueShareBps > 10000) {
    throw new Error("bps must be in [0, 10000]");
  }
  const fee = Math.round(grossUsd * revenueShareBps) / 10000;
  const net = grossUsd - fee;
  // Round to 2dp (USD cents).
  return {
    gross_usd: Math.round(grossUsd * 100) / 100,
    fee_usd: Math.round(fee * 100) / 100,
    net_usd: Math.round(net * 100) / 100,
  };
}

export function defaultRevenueShareBps(): number {
  const v = process.env.PAINPILOT_REVENUE_SHARE_BPS;
  if (v === undefined) return 1000;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n) || n < 0 || n > 10000) return 1000;
  return n;
}
