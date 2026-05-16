/**
 * Marketplace listing reads. ISR-friendly — every helper is pure-DB
 * (read-only, no auth). The route handlers wrapping these can declare
 * `export const revalidate = 60` to hit the §6 200ms TTFB budget.
 */
import { supabaseService } from "@/server/db/service";

export interface MarketplaceCard {
  id: string;
  slug: string;
  headline: string;
  founder_handle: string | null;
  featured: boolean;
  sort_score: number;
}

export async function getFeatured(limit = 24): Promise<MarketplaceCard[]> {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("marketplace_listings")
    .select("id, slug, headline, founder_handle, featured, sort_score")
    .not("published_at", "is", null)
    .order("featured", { ascending: false })
    .order("sort_score", { ascending: false })
    .limit(limit);
  if (error !== null) throw new Error(`marketplace list: ${error.message}`);
  return data ?? [];
}

export interface MarketplaceDetail extends MarketplaceCard {
  body_md: string;
  hero_image_path: string | null;
  published_at: string | null;
  created_at: string;
}

export async function getBySlug(slug: string): Promise<MarketplaceDetail | null> {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("marketplace_listings")
    .select("id, slug, headline, founder_handle, featured, sort_score, body_md, hero_image_path, published_at, created_at")
    .eq("slug", slug)
    .not("published_at", "is", null)
    .maybeSingle();
  if (error !== null) throw new Error(`marketplace getBySlug: ${error.message}`);
  return data;
}
