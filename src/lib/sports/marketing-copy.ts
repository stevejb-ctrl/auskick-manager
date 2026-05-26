// Bridge between the marketing-homepage sport picker (which has its
// own `MarketingSportId` — afl / league / union / netball) and the
// existing per-brand marketing copy module (which keys off the in-app
// `SportId` — afl / netball / rugby_league).
//
// Steve 2026-05-26: the multi-sport homepage picker swaps the
// TrustBand / ScrollingFeatures / FinalCTA sections per active
// sport. Each consumer reads the matching BrandCopy via this
// mapper — keeps brand-copy.ts as the single source of truth for
// long-form marketing prose, no duplication.

import type { MarketingSportId } from "@/lib/sports/marketing-sports";
import { type BrandCopy, getBrandCopy } from "@/lib/sports/brand-copy";

// Platform-wide social-proof numbers (1,200+ coaches, 38k games, …)
// moved to content/marketing/home.json (CMS-editable via Pages CMS).
// Consumers should read HOME_CONTENT.trustBand from
// @/lib/marketing/homeContent instead.

/**
 * Resolve the BrandCopy entry for an active marketing-picker sport.
 *
 * Mapping:
 *   - afl     → afl
 *   - league  → rugby_league   (id name differs across the two systems)
 *   - netball → netball
 *   - union   → falls back to AFL — no dedicated Union copy yet.
 *               Add a UNION_COPY block to brand-copy.ts when ready
 *               and update this switch.
 */
export function getMarketingCopy(id: MarketingSportId): BrandCopy {
  switch (id) {
    case "afl":
      return getBrandCopy("afl");
    case "league":
      return getBrandCopy("rugby_league");
    case "netball":
      return getBrandCopy("netball");
    case "union":
      // No Rugby Union BrandCopy entry yet — fall back to AFL so
      // the picker doesn't render an empty section. Replace this
      // line with `getBrandCopy("rugby_union")` (and add the SportId
      // + UNION_COPY block) once Steve provides union content.
      return getBrandCopy("afl");
  }
}

