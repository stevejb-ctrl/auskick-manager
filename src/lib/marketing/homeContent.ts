// Typed loader for the CMS-editable homepage content.
//
// Source of truth: `content/marketing/home.json`. Edited via Pages
// CMS at https://app.pagescms.org/ (config: .pages.yml at repo
// root). Every save commits the JSON file directly to main, Vercel
// auto-deploys, content goes live in ~2 min.
//
// What lives here vs. brand-copy.ts:
//   - HERE (CMS-editable): shared/cross-sport homepage content —
//     the hero headline + subtitle + trust line, the trust-band
//     stats, and per-sport hero eyebrows. These are the strings
//     most likely to need quick edits without a developer
//     (campaigns, seasonal copy, stat updates).
//   - brand-copy.ts: deep per-sport prose (the scrolling features
//     section, centerpiece headline, final-CTA block). Promoting
//     those to the CMS is a follow-up — the schema is more
//     elaborate (titles split into 3 parts each, bullet lists,
//     image refs) and the editing cadence is lower.
//
// JSON import is build-time — TypeScript validates the shape via
// the `HomeContent` interface below, and `tsconfig.json` has
// `resolveJsonModule: true` so the import is type-safe.

import type { MarketingSportId } from "@/lib/sports/marketing-sports";
import rawContent from "../../../content/marketing/home.json";

export interface HomeContent {
  hero: {
    /** Big sport-agnostic h1 at the top of the homepage. */
    headline: string;
    /** Sentence under the headline. */
    subtitle: string;
    /** Tiny uppercase trust line under the CTAs. */
    trustLine: string;
  };
  /** Hero eyebrow per sport — swaps as the carousel rotates. */
  sportEyebrows: Record<MarketingSportId, string>;
  /** Four-entry stats strip rendered between hero and feature scroll. */
  trustBand: ReadonlyArray<{ stat: string; label: string }>;
}

// Cast — the JSON is validated structurally by the import statement
// (TypeScript type-checks each property access against HomeContent),
// but the `Record<MarketingSportId, string>` part needs the cast
// because JSON keys infer as `string`, not the union literal.
export const HOME_CONTENT = rawContent as HomeContent;

/** Convenience getter for sport eyebrows that defaults to AFL if a
 *  sport-id ever falls outside the editable set (e.g. a future sport
 *  added to MarketingSportConfig before the CMS content catches up). */
export function getHeroEyebrow(sportId: MarketingSportId): string {
  return HOME_CONTENT.sportEyebrows[sportId] ?? HOME_CONTENT.sportEyebrows.afl;
}
