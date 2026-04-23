// ─── Sport registry ──────────────────────────────────────────
// Central lookup from a `SportId` to its `SportConfig`. Callers use
// `getSportConfig(team.sport)` — if `team.sport` is missing (legacy
// rows) it defaults to AFL.

import type { AgeGroupConfig, SportConfig, SportId } from "@/lib/sports/types";
import { aflSport } from "@/lib/sports/afl";
import { netballSport } from "@/lib/sports/netball";

const REGISTRY: Record<SportId, SportConfig> = {
  afl: aflSport,
  netball: netballSport,
};

export const ALL_SPORTS: SportConfig[] = [aflSport, netballSport];

export const ALL_SPORT_IDS: SportId[] = ["afl", "netball"];

export function getSportConfig(sport: SportId | string | null | undefined): SportConfig {
  if (sport && sport in REGISTRY) return REGISTRY[sport as SportId];
  return aflSport;
}

export function isSportId(value: unknown): value is SportId {
  return typeof value === "string" && value in REGISTRY;
}

/**
 * Resolve an age group config for a team. Given a sport + age-group id,
 * returns the matching AgeGroupConfig. Falls back to the sport's first
 * age group on a miss (safe default).
 */
export function getAgeGroupConfig(
  sport: SportId | string | null | undefined,
  ageGroupId: string | null | undefined,
): AgeGroupConfig {
  const cfg = getSportConfig(sport);
  if (ageGroupId) {
    const hit = cfg.ageGroups.find((a) => a.id === ageGroupId);
    if (hit) return hit;
  }
  return cfg.ageGroups[0];
}

/** Look up the brand config for a given domain (used by middleware). */
export function getBrandForHost(host: string | null | undefined): SportConfig {
  if (!host) return aflSport;
  const bare = host.replace(/:\d+$/, "").toLowerCase();
  for (const cfg of ALL_SPORTS) {
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
  for (const cfg of ALL_SPORTS) {
    if (cfg.brand.id === normalized) return cfg;
  }
  return aflSport;
}
