import type { MetadataRoute } from "next";
import { env } from "@/env";

export default function robots(): MetadataRoute.Robots {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/marketplace", "/blog", "/founder"],
        disallow: ["/app", "/api"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
