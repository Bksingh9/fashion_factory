/**
 * Sitemap entries for the marketplace + blog. Drives /sitemap.ts.
 */
import { supabaseService } from "@/server/db/service";

export interface SitemapEntry {
  loc: string;
  lastModified: string;
}

export async function listMarketplaceEntries(): Promise<SitemapEntry[]> {
  const sb = supabaseService();
  const { data } = await sb
    .from("marketplace_listings")
    .select("slug, published_at")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(1000);
  return (data ?? []).map((r) => ({
    loc: `/marketplace/${r.slug}`,
    lastModified: r.published_at ?? new Date().toISOString(),
  }));
}
