import type { MetadataRoute } from "next";
import { env } from "@/env";
import { listMarketplaceEntries } from "@/server/marketplace/sitemap";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const now = new Date().toISOString();
  const fixed: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now },
    { url: `${base}/marketplace`, lastModified: now },
    { url: `${base}/blog`, lastModified: now },
  ];

  let listings: { loc: string; lastModified: string }[] = [];
  try {
    listings = await listMarketplaceEntries();
  } catch {
    // Sandbox / unreachable DB — fall back to fixed routes only.
    listings = [];
  }

  return [
    ...fixed,
    ...listings.map((l) => ({ url: `${base}${l.loc}`, lastModified: l.lastModified })),
  ];
}
