// ─── Per-brand marketing copy ────────────────────────────────
// The marketing surface (/, /why-siren, /contact, footer) reads from
// this module so the same component tree renders differently on
// sirenfooty.com.au vs sirennetball.com.au. The sport pages' words,
// their tours included, are content/marketing/sports.json
// (src/lib/marketing/sportPages.ts).
//
// Source of truth: `content/marketing/brands/*.json`, edited via
// Decap CMS at /cms (collections `brand-afl`, `brand-league`,
// `brand-netball`). The JSON files are imported at build time —
// TypeScript validates each against `BrandCopy` below via the cast,
// and `tsconfig.json` has `resolveJsonModule: true` so the imports
// are type-safe at the property level.

import type { SportId } from "@/lib/sports/types";

// Build-time JSON imports — see header comment.
import aflJson from "../../../content/marketing/brands/afl.json";
import netballJson from "../../../content/marketing/brands/netball.json";
import leagueJson from "../../../content/marketing/brands/league.json";

/**
 * A heading split into three parts so one word can take an accent
 * colour (TitleAccent: colour only, never italic; the `italic` name is
 * historical). `italic` may be empty for a plain heading.
 */
export interface TitleParts {
  before: string;
  italic: string;
  after: string;
}

export interface BrandCopy {
  /** Header product name ("Siren Footy" / "Siren Netball"). */
  productName: string;
  /** Tagline shown in the footer under the wordmark. */
  tagline: string;
  /** Two-message banner: prefix + alarm-orange link. */
  banner: { prefix: string; linkText: string };
  /** Hero eyebrow above the H1. Default-styled (ink-dim mono uppercase). */
  heroEyebrow: string;
  /** Hero H1 — TitleParts; italic may be empty (the prototype's hero is plain). */
  heroTitle: TitleParts;
  /** Hero subtitle paragraph. */
  heroSubtitle: string;
  /** Mini trust line under the hero CTAs (mono uppercase, ink-mute). */
  heroTrust: string;
  /** Page meta description. */
  metaDescription: string;
  /**
   * Trust band entries between hero and features. Each is a big
   * mono-numeral stat with a small uppercase label underneath, per the
   * design handoff (`MktTrustBand` in `marketing_handoff/prototype/sf/marketing.jsx`).
   */
  trustBand: readonly { stat: string; label: string }[];
  /** Final CTA pieces — title is split for italic accent. */
  finalCtaEyebrow: string;
  finalCtaTitle: TitleParts;
  finalCtaBody: string;
}

// Cast — the JSON imports are structurally validated at every
// property access, but TS infers JSON literals as their narrowest
// type (e.g. trustBand entries as `{stat: string, label: string}`
// rather than the readonly array shape). The cast preserves
// build-time validation without forcing a runtime parse pass.
const AFL_COPY = aflJson as BrandCopy;
const NETBALL_COPY = netballJson as BrandCopy;
const LEAGUE_COPY = leagueJson as BrandCopy;

const COPY: Record<SportId, BrandCopy> = {
  afl: AFL_COPY,
  netball: NETBALL_COPY,
  // Junior rugby league copy lives in
  // content/marketing/brands/league.json. Wired here so any future
  // sirenleague.com.au host (or a runtime brand override) renders
  // the dedicated copy.
  rugby_league: LEAGUE_COPY,
  // Union has no site of its own: it lives under the main Siren brand,
  // so a brand lookup for it reads the main brand's copy.
  rugby_union: AFL_COPY,
  // Football (soccer) too: the main brand's copy.
  soccer: AFL_COPY,
  // Basketball too: the main brand's copy.
  basketball: AFL_COPY,
  // Futsal, hockey, touch and Oztag too (.planning/FOUR-SPORTS-PLAN.md).
  futsal: AFL_COPY,
  hockey: AFL_COPY,
  touch: AFL_COPY,
  oztag: AFL_COPY,
};

export function getBrandCopy(id: SportId): BrandCopy {
  return COPY[id] ?? AFL_COPY;
}
