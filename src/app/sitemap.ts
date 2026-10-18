import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";
import { INDEXABLE_ROUTES } from "@/lib/public-routes";

// Canonical production host. Resolved per-domain via the inbound
// brand header — sirenfooty.com.au gets www.sirenfooty.com.au URLs;
// sirennetball.com.au gets www.sirennetball.com.au URLs. Matches
// the Vercel domain with the apex redirecting to www — don't list
// both or Search Console flags them as duplicates.
//
// The pages, their priorities and lastmod dates live in
// src/lib/public-routes.ts, which robots.ts and the GA gate share.
export default function sitemap(): MetadataRoute.Sitemap {
  const BASE = siteUrl();
  return INDEXABLE_ROUTES.map(({ path, priority, changeFrequency, lastModified }) => ({
    url: `${BASE}${path}`,
    lastModified: new Date(lastModified),
    changeFrequency,
    priority,
  }));
}
