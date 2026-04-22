import type { MetadataRoute } from "next";

// Canonical production host. Matches the Vercel domain with the apex
// redirecting to www — don't list both or Search Console flags them
// as duplicates.
const BASE = "https://www.sirenfooty.com.au";

// Bump this when a substantive content change rolls out so search
// engines see the lastmod move. Individual pages can override via
// the `lastModified` field below.
const DEFAULT_LAST_MODIFIED = new Date("2026-04-22");

// Keep this list in sync with the public (non-authed) routes under
// src/app. Authed routes — /dashboard, /teams/**, /run/<token>,
// /join/<token>, /auth/callback, /api/** — must NOT be indexed.
export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, priority: 1.0, changeFrequency: "monthly" },
    { url: `${BASE}/demo`, priority: 0.9, changeFrequency: "monthly" },

    // Help hub
    { url: `${BASE}/help`, priority: 0.8, changeFrequency: "monthly" },
    { url: `${BASE}/help/getting-started`, priority: 0.7, changeFrequency: "monthly" },
    { url: `${BASE}/help/teams`, priority: 0.6, changeFrequency: "monthly" },
    { url: `${BASE}/help/squads`, priority: 0.6, changeFrequency: "monthly" },
    { url: `${BASE}/help/games`, priority: 0.6, changeFrequency: "monthly" },
    { url: `${BASE}/help/rotations`, priority: 0.6, changeFrequency: "monthly" },
    { url: `${BASE}/help/live-game`, priority: 0.6, changeFrequency: "monthly" },
    { url: `${BASE}/help/track-scoring`, priority: 0.6, changeFrequency: "monthly" },
    { url: `${BASE}/help/stats`, priority: 0.6, changeFrequency: "monthly" },
    { url: `${BASE}/help/faq`, priority: 0.7, changeFrequency: "monthly" },
    { url: `${BASE}/help/troubleshooting`, priority: 0.6, changeFrequency: "monthly" },

    // Transactional landing pages — useful for brand search
    { url: `${BASE}/login`, priority: 0.4, changeFrequency: "yearly" },
    { url: `${BASE}/signup`, priority: 0.5, changeFrequency: "yearly" },
    { url: `${BASE}/contact`, priority: 0.5, changeFrequency: "yearly" },

    // Legal
    { url: `${BASE}/privacy`, priority: 0.3, changeFrequency: "yearly" },
    { url: `${BASE}/terms`, priority: 0.3, changeFrequency: "yearly" },
  ];

  return entries.map((entry) => ({
    lastModified: DEFAULT_LAST_MODIFIED,
    ...entry,
  }));
}
