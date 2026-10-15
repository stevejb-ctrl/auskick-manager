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

const REGISTRY: Record<SportId, SportConfig> = {
  afl: aflSport,
  netball: netballSport,
  rugby_league: rugbyLeagueSport,
  rugby_union: rugbyUnionSport,
};

export const ALL_SPORTS: SportConfig[] = [aflSport, netballSport, rugbyLeagueSport, rugbyUnionSport];

export const ALL_SPORT_IDS: SportId[] = ["afl", "netball", "rugby_league", "rugby_union"];

/**
 * The sports with a site (brand) of their own. Rugby union lives under
 * the main Siren brand, so no host or brand id resolves to it.
 */
const SITE_SPORTS: SportConfig[] = ALL_SPORTS.filter((cfg) => cfg.brand.id === cfg.id);

export function isSportId(value: unknown): value is SportId {
  return typeof value === "string" && value in REGISTRY;
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
