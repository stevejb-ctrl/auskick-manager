import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

const BASE = SITE_URL;

// Block crawlers from authed / tokenised / API routes. The public
// marketing + help pages remain indexable. If you add a new
// subtree under src/app that shouldn't be indexed, add it here.
export default function robots(): MetadataRoute.Robots {
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
