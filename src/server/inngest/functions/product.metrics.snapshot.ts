/**
 * product.metrics.snapshot — hourly cron.
 *
 * Walks every active product and writes a `product_metrics` snapshot.
 * Phase 5 reads MRR/users from Polar (POLAR_STUB=1 returns canned
 * fixtures); Phase 6 wires real Polar SDK calls.
 */
import { inngest } from "../client";
import { supabaseService } from "@/server/db/service";

export const productMetricsSnapshot = inngest.createFunction(
  {
    id: "product.metrics.snapshot",
    retries: 1,
    triggers: [{ cron: "0 * * * *" }],
  },
  async ({ step }) => {
    const products = await step.run("list-active-products", async () => {
      const sb = supabaseService();
      const { data, error } = await sb
        .from("products")
        .select("id, polar_product_id")
        .neq("polar_product_id", null);
      if (error !== null) throw new Error(`products list: ${error.message}`);
      return data ?? [];
    });

    if (products.length === 0) return { snapshots: 0 };

    await step.run("write-snapshots", async () => {
      const sb = supabaseService();
      // Sandbox/stub: deterministic dummy metrics. Real wiring lands in Phase 6.
      const rows = products.map((p) => ({
        product_id: p.id,
        source: "polar" as const,
        mrr_usd: 0,
        arr_usd: 0,
        users_count: 0,
        active_users_count: 0,
        churn_30d: 0,
      }));
      const { error } = await sb.from("product_metrics").insert(rows);
      if (error !== null) throw new Error(`metrics insert: ${error.message}`);
    });

    return { snapshots: products.length };
  },
);
