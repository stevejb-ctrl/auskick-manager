// ─── Sport registry ──────────────────────────────────────────
// Central lookup from a `SportId` to its `SportConfig`. Sports are
// independent (14 Oct 2026): a missing or unknown sport is an error,
// never AFL. Every team row has a sport (teams.sport is NOT NULL and
// checked), so a miss means the code lost it.

import type { AgeGroupConfig, SportConfig, SportId } from "@/lib/sports/types";
import { aflSport } from "@/lib/sports/afl";
import { netballSport } from "@/lib/sports/netball";
import { rugbyLeagueSport } from "@/lib/sports/rugby_league";
import { rugbyUnionSport } from "@/lib/sports/rugby_union";
import { soccerSport } from "@/lib/sports/soccer";
import { basketballSport } from "@/lib/sports/basketball";
import { futsalSport } from "@/lib/sports/futsal";
import { hockeySport } from "@/lib/sports/hockey";
import { touchSport } from "@/lib/sports/touch";
import { oztagSport } from "@/lib/sports/oztag";

const REGISTRY: Record<SportId, SportConfig> = {
  afl: aflSport,
  netball: netballSport,
  rugby_league: rugbyLeagueSport,
  rugby_union: rugbyUnionSport,
  soccer: soccerSport,
  basketball: basketballSport,
  futsal: futsalSport,
  hockey: hockeySport,
  touch: touchSport,
  oztag: oztagSport,
};

export const ALL_SPORTS: SportConfig[] = [
  aflSport,
  netballSport,
  rugbyLeagueSport,
  rugbyUnionSport,
  soccerSport,
  basketballSport,
  futsalSport,
  hockeySport,
  touchSport,
  oztagSport,
];

export const ALL_SPORT_IDS: SportId[] = [
  "afl",
  "netball",
  "rugby_league",
  "rugby_union",
  "soccer",
  "basketball",
  "futsal",
  "hockey",
  "touch",
  "oztag",
];

/**
 * The sports with a site (brand) of their own. Rugby union, Football
 * (soccer), basketball, futsal, hockey, touch and Oztag live under the
 * main Siren brand, so no host or brand id resolves to them.
 */
const SITE_SPORTS: SportConfig[] = ALL_SPORTS.filter((cfg) => cfg.brand.id === cfg.id);

export function isSportId(value: unknown): value is SportId {
  return typeof value === "string" && value in REGISTRY;
}

/**
 * Sports Siren knows but a coach can't start a team in yet: a new
 * sport's configs, tests and migration can land before its live game
 * (.planning/FOUR-SPORTS-PLAN.md, phase 0), and it comes off this list
 * when its setup pill lands. Empty since the four-sports tracks merged.
 */
export const SPORTS_NOT_OPEN: readonly SportId[] = [];

/** Whether a coach can start a team in this sport. */
export function isSportOpen(sport: SportId): boolean {
  return !SPORTS_NOT_OPEN.includes(sport);
}

/**
 * A team's sport, checked. Use this instead of `team.sport ?? "afl"`
 * or an `as Sport` cast: an unknown sport fails here rather than being
 * run under another sport's rules.
 */
export function teamSport(value: unknown): SportId {
  if (isSportId(value)) return value;
  throw new Error(`Unknown sport "${String(value)}"`);
}

/**
 * The end of a per-sport dispatcher, after every sport's branch has
 * returned. Typed `never`, so adding a sport without its own branch
 * fails to compile; at runtime it throws rather than borrowing another
 * sport's rules.
 */
export function noSportBranch(sport: never, where: string): never {
  throw new Error(`${where}: no branch for sport "${String(sport)}"`);
}

/**
 * The sport at the top of an AFL-only branch (a page's "everything
 * else"), once the other sports' branches have returned. It takes only
 * "afl", so a new sport that falls through fails to compile here.
 */
export function aflBranch(sport: "afl"): "afl" {
  if (sport !== "afl") noSportBranch(sport, "AFL branch");
  return sport;
}

/**
 * A per-sport branch for a surface the sport doesn't have yet (Football
 * (soccer)'s live game, stats and How we play come in phases 2 and 3 of
 * .planning/SOCCER-PLAN.md). It throws rather than running the sport
 * under another's rules or screens. Search for it to find what's left
 * to build.
 */
export function sportNotBuilt(sport: SportId, where: string): never {
  throw new Error(`${where}: ${REGISTRY[sport]?.name ?? String(sport)} isn't built yet`);
}

export function getSportConfig(sport: SportId | string | null | undefined): SportConfig {
  return REGISTRY[teamSport(sport)];
}

/**
 * The sports that run on the rugby engine. Typed so `isRugby` narrows; a test checks it matches the
 * configs' `family`.
 */
export const RUGBY_SPORT_IDS = ["rugby_league", "rugby_union"] as const satisfies readonly SportId[];
export type RugbySport = (typeof RUGBY_SPORT_IDS)[number];

/**
 * The one way to ask "is this rugby?": the sport's own config says so.
 * Use it wherever league and union share the code (live game, replay,
 * stats); each still reads its own rules from its config.
 */
export function isRugby(sport: SportId): sport is RugbySport {
  return getSportConfig(sport).family === "rugby";
}

/**
 * The sports that run on the soccer engine: Football (soccer), futsal
 * and hockey, each with its own rules (.planning/FOUR-SPORTS-PLAN.md).
 * Typed so `isSoccer` narrows; a test checks it matches the configs'
 * `family`.
 */
export const SOCCER_SPORT_IDS = ["soccer", "futsal", "hockey"] as const satisfies readonly SportId[];
export type SoccerSport = (typeof SOCCER_SPORT_IDS)[number];

/**
 * The one way to ask "is this soccer?", beside isRugby: the sport's own
 * config says so. Each soccer sport still reads its own rules.
 */
export function isSoccer(sport: SportId): sport is SoccerSport {
  return getSportConfig(sport).family === "soccer";
}

/**
 * The sports that run on the basketball engine (only basketball today).
 * Typed so `isBasketball` narrows; a test checks it matches the
 * configs' `family`.
 */
export const BASKETBALL_SPORT_IDS = ["basketball"] as const satisfies readonly SportId[];
export type BasketballSport = (typeof BASKETBALL_SPORT_IDS)[number];

/**
 * The one way to ask "is this basketball?", beside isRugby and
 * isSoccer: the sport's own config says so.
 */
export function isBasketball(sport: SportId): sport is BasketballSport {
  return getSportConfig(sport).family === "basketball";
}

/**
 * The sports that run on the touch engine: touch football and Oztag,
 * each with its own rules (.planning/FOUR-SPORTS-PLAN.md). Typed so
 * `isTouch` narrows; a test checks it matches the configs' `family`.
 */
export const TOUCH_SPORT_IDS = ["touch", "oztag"] as const satisfies readonly SportId[];
export type TouchSport = (typeof TOUCH_SPORT_IDS)[number];

/**
 * The one way to ask "is this touch or Oztag?", beside isRugby, isSoccer
 * and isBasketball: the sport's own config says so.
 */
export function isTouch(sport: SportId): sport is TouchSport {
  return getSportConfig(sport).family === "touch";
}

/**
 * Resolve an age group config for a team. Given a sport + age-group id,
 * returns the matching AgeGroupConfig, including retired ids existing
 * teams still store. The sport must be known (it throws otherwise); an
 * unknown age group falls back to that same sport's first age group.
 */
export function getAgeGroupConfig(
  sport: SportId | string | null | undefined,
  ageGroupId: string | null | undefined,
): AgeGroupConfig {
  const cfg = getSportConfig(sport);
  if (ageGroupId) {
    const hit =
      cfg.ageGroups.find((a) => a.id === ageGroupId) ??
      cfg.legacyAgeGroups?.find((a) => a.id === ageGroupId);
    if (hit) return hit;
  }
  return cfg.ageGroups[0];
}

/** Look up the brand config for a given domain (used by middleware). */
export function getBrandForHost(host: string | null | undefined): SportConfig {
  if (!host) return aflSport;
  const bare = host.replace(/:\d+$/, "").toLowerCase();
  for (const cfg of SITE_SPORTS) {
    if (bare === cfg.brand.host || bare.endsWith("." + cfg.brand.host)) {
      return cfg;
    }
  }
  return aflSport;
}

/** Look up a sport config by its brand id (used by middleware override). */
export function getSportByBrand(brandId: string | null | undefined): SportConfig {
  if (!brandId) return aflSport;
  const normalized = brandId.toLowerCase();
  for (const cfg of SITE_SPORTS) {
    if (cfg.brand.id === normalized) return cfg;
  }
  return aflSport;
}
