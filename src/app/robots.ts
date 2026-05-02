import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

// Block crawlers from authed / tokenised / API routes. The public
// marketing + help pages remain indexable. If you add a new
// subtree under src/app that shouldn't be indexed, add it here.
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
        disallow: [
          "/api/",
          "/auth/",
          "/dashboard",
          "/teams/",
          "/run/",
          "/join/",
          "/reset",
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
