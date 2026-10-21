import { APP_STORE_URL } from "@/lib/app-links";
import type { SportId } from "@/lib/sports/types";

// ─── Siren facts: what the public site says about Siren ──────
// The facts a search snippet or an AI answer would repeat — the
// sports, the platforms, the price, who makes Siren and the privacy
// stance — in one place, so no two pages give two answers. The home
// page, /why-siren, the help overview and FAQ, privacy, terms, the
// JSON-LD (src/lib/structured-data.ts) and /llms.txt all read it.
// src/lib/__tests__/sirenFacts.test.ts checks the sports against the
// sport registry, and the marketing JSON's sport lists and price
// lines against this file.
//
// Data and pure helpers only: the homepage picker and the demo cards
// are client components and import it, so it mustn't pull in the
// sport engines (hence no runtime import of the registry).

export interface SportFact {
  id: SportId;
  /** The sport as public prose names it: "AFL", "rugby league". */
  name: string;
  /** In beta: open to every coach, labelled "Beta" wherever it's listed. */
  beta: boolean;
}

// Keyed by SportId, so a new sport won't compile until it has a public
// name and a beta call. In the registry's order (ALL_SPORT_IDS).
const SPORT_FACTS: Record<SportId, Omit<SportFact, "id">> = {
  afl: { name: "AFL", beta: false },
  netball: { name: "netball", beta: false },
  rugby_league: { name: "rugby league", beta: false },
  rugby_union: { name: "rugby union", beta: false },
  // Open to every coach in beta (soccer since 17 Oct 2026, then basketball).
  soccer: { name: "football (soccer)", beta: true },
  basketball: { name: "basketball", beta: true },
};

/** Every sport Siren runs, launched ones first as in the registry. */
export const SIREN_SPORTS: readonly SportFact[] = (Object.keys(SPORT_FACTS) as SportId[]).map(
  (id) => ({ id, ...SPORT_FACTS[id] }),
);

export function isBetaSport(id: SportId): boolean {
  return SPORT_FACTS[id].beta;
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** "six", for "One app, six sports". */
export const SPORT_COUNT_WORD = NUMBER_WORDS[SIREN_SPORTS.length];

/** "a, b and c". */
function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The sports in a sentence, beta ones last and marked:
 * "AFL, netball, rugby league and rugby union, plus football (soccer)
 * and basketball in beta".
 */
export function sportsSentence(): string {
  const launched = SIREN_SPORTS.filter((s) => !s.beta).map((s) => s.name);
  const beta = SIREN_SPORTS.filter((s) => s.beta).map((s) => s.name);
  return beta.length ? `${joinAnd(launched)}, plus ${joinAnd(beta)} in beta` : joinAnd(launched);
}

/** The price, and the last day it's true (plan decision 7 settles 2027). */
export const PRICE = {
  /** The line pages quote. The marketing JSON's banners must agree. */
  line: "Free for the 2026 season",
  /** The season it covers; the test checks the marketing JSON names it. */
  season: 2026,
  amountAud: 0,
  /** Schema.org priceValidUntil. */
  validUntil: "2026-12-31",
} as const;

/** Where Siren runs. Android uses the web app until a Play listing ships. */
export const PLATFORMS = {
  ios: { name: "iPhone and iPad app", url: APP_STORE_URL },
  web: { name: "web app" },
  /** For prose: "Siren is …". */
  sentence:
    "an iPhone and iPad app on the App Store, and a web app that runs in any modern phone or computer browser, Android included",
  /** Schema.org operatingSystem. */
  operatingSystem: "iOS, Web",
} as const;

/** Who makes Siren. The help pages' byline and the JSON-LD founder read it. */
export const MAKER = {
  name: "Steve Bull",
  role: "parent-coach",
  country: "Australia",
  countryCode: "AU",
} as const;

/** First day on the App Store. */
export const APP_STORE_SINCE = "2026-05-19";

/** The privacy stance in a sentence (the privacy policy, sections 3 and 6). */
export const PRIVACY_LINE =
  "Team and player data is stored in Australia (Sydney), and player names are never shown publicly, sold or sent to analytics.";

/** What Siren is, in one sentence. */
export function sirenOneLiner(): string {
  return `Siren is a game-day app for junior sport coaches in ${MAKER.country}: fair rotations, subs and live scores for ${sportsSentence()}.`;
}

/** What it does, for SoftwareApplication.featureList and /llms.txt. */
export const FEATURES: readonly string[] = [
  "Fair rotation suggestions that balance each player's time across positions, zones or thirds, not just minutes",
  "Junior rules for each sport and age group: zones, positions, game-time minimums and interchange",
  "A live game clock with sub alerts and break-time lineups",
  "Live scores, with a share link a parent can score from without an account",
  "Late arrivals, injuries and lending a player to the opposition",
  "Season balance stats for every player",
  "PlayHQ fixture import",
];
