// ─── Per-brand marketing copy ────────────────────────────────
// The marketing surface (/, /why-siren, /contact, footer) reads from
// this module so the same component tree renders differently on
// sirenfooty.com.au vs sirennetball.com.au, and so the multi-sport
// homepage's sport picker can swap deep content per sport.
//
// Source of truth: `content/marketing/brands/*.json`, edited via
// Decap CMS at /cms (collections `brand-afl`, `brand-league`,
// `brand-netball`). The JSON files are imported at build time —
// TypeScript validates each against `BrandCopy` below via the cast,
// and `tsconfig.json` has `resolveJsonModule: true` so the imports
// are type-safe at the property level.
//
// Each FeatureCopy entry matches the FEATURES shape consumed by
// ScrollingFeatures.

import type { SportId } from "@/lib/sports/types";

// Build-time JSON imports — see header comment.
import aflJson from "../../../content/marketing/brands/afl.json";
import netballJson from "../../../content/marketing/brands/netball.json";
import leagueJson from "../../../content/marketing/brands/league.json";
import unionJson from "../../../content/marketing/brands/union.json";
import soccerJson from "../../../content/marketing/brands/soccer.json";
import basketballJson from "../../../content/marketing/brands/basketball.json";

/**
 * A heading split into three parts so a single word can render in
 * Instrument Serif italic — the defining type move of the marketing
 * site. `italic` may be empty, in which case the heading renders as
 * a single sans-serif line.
 */
export interface TitleParts {
  before: string;
  italic: string;
  after: string;
}

export interface FeatureCopy {
  id: string;
  eyebrow: string;
  title: TitleParts;
  body: string;
  bullets: string[];
  image: string;
  imageAlt: string;
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
  /**
   * Editorial centrepiece above the feature blocks. Single big
   * headline; `italic` pulls the payoff word into the brand accent
   * colour (no longer rendered italic — see TitleAccent).
   */
  centerpiece: TitleParts;
  /** Ordered feature blocks for ScrollingFeatures. */
  features: FeatureCopy[];
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
  // so a brand lookup for it reads the main brand's copy. Its sport
  // page reads its own tour (sportTourCopy, below).
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

/**
 * The feature tour a sport page scrolls through: its long-form copy in
 * content/marketing/brands/. Union, soccer and basketball have no site
 * of their own, so only their sport pages read theirs. Futsal, hockey,
 * touch and Oztag have none yet (null): their pages show the
 * homepage's six shared features instead.
 */
const TOUR_COPY: Record<SportId, BrandCopy | null> = {
  afl: AFL_COPY,
  netball: NETBALL_COPY,
  rugby_league: LEAGUE_COPY,
  rugby_union: unionJson as BrandCopy,
  soccer: soccerJson as BrandCopy,
  basketball: basketballJson as BrandCopy,
  futsal: null,
  hockey: null,
  touch: null,
  oztag: null,
};

export function sportTourCopy(id: SportId): BrandCopy | null {
  return TOUR_COPY[id];
}