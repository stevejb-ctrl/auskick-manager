import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";
import { PRIVATE_PATH_PREFIXES } from "@/lib/public-routes";

// Block crawlers from authed / tokenised / API routes. The public
// marketing + help pages remain indexable. The private prefixes live
// in src/lib/public-routes.ts, alongside the sitemap's pages.
//
// Host + sitemap URL are resolved per brand via the inbound x-brand
// header so each domain serves its own canonical sitemap.
export default function robots(): MetadataRoute.Robots {
  const BASE = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...PRIVATE_PATH_PREFIXES],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
