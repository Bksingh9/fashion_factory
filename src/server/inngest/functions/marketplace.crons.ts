/**
 * marketplace.reindex — event marketplace.listing.updated. Recomputes
 * sort_score for a listing using freshness + featured boost.
 *
 * marketplace.affiliate_rotate — daily cron. Mirrors the standalone
 * `/scripts/rotate-affiliates.ts` script logic inline so it runs without
 * shelling out.
 */
import { inngest } from "../client";
import { supabaseService } from "@/server/db/service";

export const marketplaceReindex = inngest.createFunction(
  {
    id: "marketplace.reindex",
    retries: 1,
    triggers: [{ event: "marketplace.listing.updated" }],
  },
  async ({ event, step }) => {
    const listingId = (event.data as { listing_id?: string }).listing_id;
    if (typeof listingId !== "string") {
      return { skipped: "no listing_id" };
    }
    return step.run("recompute-score", async () => {
      const sb = supabaseService();
      const { data: listing } = await sb
        .from("marketplace_listings")
        .select("featured, created_at")
        .eq("id", listingId)
        .maybeSingle();
      if (listing === null) return { skipped: "not found" };
      // Score = days-old penalty + featured boost. Lower is older.
      const ageDays = Math.max(
        0,
        (Date.now() - new Date(listing.created_at).getTime()) / (24 * 60 * 60 * 1000),
      );
      const score = (listing.featured ? 1000 : 0) + Math.max(0, 365 - ageDays);
      await sb
        .from("marketplace_listings")
        .update({ sort_score: score })
        .eq("id", listingId);
      return { listing_id: listingId, score };
    });
  },
);

export const marketplaceAffiliateRotate = inngest.createFunction(
  {
    id: "marketplace.affiliate_rotate",
    retries: 0,
    triggers: [{ cron: "0 0 * * *" }],
  },
  async ({ step }) => {
    return step.run("rotate", async () => {
      const sb = supabaseService();
      const { data: affs } = await sb
        .from("affiliates")
        .select("id")
        .eq("active", true);
      const ids = (affs ?? []).map((a) => a.id);
      if (ids.length === 0) return { rotated: 0 };
      const thirty = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      let rotated = 0;
      for (const id of ids) {
        const { count } = await sb
          .from("affiliate_clicks")
          .select("id", { count: "exact", head: true })
          .eq("affiliate_id", id)
          .gte("created_at", thirty);
        const weight = Math.max(10, (count ?? 0) + 10);
        await sb.from("affiliates").update({ rotation_weight: weight }).eq("id", id);
        rotated++;
      }
      return { rotated };
    });
  },
);
