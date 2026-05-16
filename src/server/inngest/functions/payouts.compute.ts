/**
 * payouts.compute — monthly cron (1st of month, 06:00 UTC).
 *
 * Aggregates last month's MRR per user → writes a `payouts` row
 * (idempotent on (user_id, period_start, period_end)). Status starts as
 * 'pending'; Phase 6 wires the actual Polar payout call.
 */
import { inngest } from "../client";
import { supabaseService } from "@/server/db/service";
import { computePayout, defaultRevenueShareBps } from "@/server/payments/revenue";

function lastMonthRange(now: Date): { start: string; end: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-11; "last" month = m-1
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0)); // last day of previous month
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export const payoutsCompute = inngest.createFunction(
  {
    id: "payouts.compute",
    retries: 1,
    triggers: [{ cron: "0 6 1 * *" }],
  },
  async ({ step }) => {
    const { start, end } = lastMonthRange(new Date());
    const bps = defaultRevenueShareBps();

    const users = await step.run("list-users-with-products", async () => {
      const sb = supabaseService();
      const { data, error } = await sb.from("products").select("user_id, id");
      if (error !== null) throw new Error(`products list: ${error.message}`);
      const set = new Set<string>();
      for (const row of data ?? []) set.add(row.user_id);
      return Array.from(set);
    });

    if (users.length === 0) return { computed: 0, period_start: start, period_end: end };

    const written = await step.run("write-payouts", async () => {
      const sb = supabaseService();
      // Phase 5 stubs gross at 0 (Phase 6 reads real Polar). Idempotent
      // via the (user_id, period_start, period_end) unique index.
      const rows = users.map((user_id) => {
        const math = computePayout(0, bps);
        return {
          user_id,
          period_start: start,
          period_end: end,
          gross_usd: math.gross_usd,
          fee_usd: math.fee_usd,
          net_usd: math.net_usd,
          status: "pending" as const,
        };
      });
      const { error } = await sb.from("payouts").upsert(rows, {
        onConflict: "user_id,period_start,period_end",
        ignoreDuplicates: true,
      });
      if (error !== null) throw new Error(`payouts upsert: ${error.message}`);
      return rows.length;
    });

    return { computed: written, period_start: start, period_end: end };
  },
);
