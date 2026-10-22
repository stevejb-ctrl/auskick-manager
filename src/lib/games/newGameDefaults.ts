// ─── newGameDefaults ─────────────────────────────────────────
// The on-field size and sub interval a new game starts with, from the
// team's own sport + age group and the team's own players-on-the-field
// (teams.on_field_size, NULL = the age group's). Every game-creation
// path uses it so a game's defaults don't depend on how it was made:
//
//   - `(app)/teams/[teamId]/games/actions.ts:createGame` (coach form)
//   - `(app)/teams/[teamId]/games/playhq-actions.ts` (coach import)
//   - `api/cron/sync-playhq/route.ts` (nightly sync)
//
// Pure: no I/O. Callers pass the team row's sport, age_group and
// on_field_size.
//
// The sub interval is the age group's quarter-length-derived value
// (F4/SUB-02). Before 2026-10-13, AFL read a hand-set 3 / 4 min from
// the legacy AGE_GROUPS table, and hand-made games of every sport
// took the DB default of 180s.

import { getAgeGroupConfig, isSportId, isTouch } from "@/lib/sports";
import { basketballAgeGroupForTeam } from "@/lib/sports/basketball";
import { touchAgeGroupForTeam } from "@/lib/sports/touch/family";
import type { AgeGroupConfig } from "@/lib/sports/types";

export interface NewGameDefaults {
  on_field_size: number;
  sub_interval_seconds: number;
}

/**
 * A team's players on the field: its own size (competitions differ by
 * state), kept inside the age group's range, else the age group's.
 */
export function teamOnFieldSize(ageGroup: AgeGroupConfig, teamSize: number | null | undefined): number {
  if (teamSize == null) return ageGroup.defaultOnFieldSize;
  return Math.min(ageGroup.maxOnFieldSize, Math.max(ageGroup.minOnFieldSize, Math.round(teamSize)));
}

/**
 * What teams.on_field_size stores for a size the coach wants: inside the
 * age group's range, and NULL when it's the age group's own (so a later
 * change of age follows the new age's default). Also re-clamps a stored
 * size when the age group changes.
 */
export function storedOnFieldSize(ageGroup: AgeGroupConfig, wanted: number | null | undefined): number | null {
  if (wanted == null) return null;
  const size = teamOnFieldSize(ageGroup, wanted);
  return size === ageGroup.defaultOnFieldSize ? null : size;
}

/** The longest period a team can set, in minutes (union's U17–U18 halves run 35). */
export const PERIOD_MINUTES_MAX = 60;

/**
 * What teams.quarter_length_seconds stores for a period length the coach
 * sets: NULL when it's the age group's own, else the length. Throws for
 * a length outside 1 to PERIOD_MINUTES_MAX whole minutes.
 */
export function storedPeriodSeconds(ageGroup: AgeGroupConfig, seconds: number | null | undefined): number | null {
  if (seconds == null) return null;
  if (!Number.isInteger(seconds) || seconds % 60 !== 0 || seconds < 60 || seconds > PERIOD_MINUTES_MAX * 60) {
    throw new Error(`A period is a whole number of minutes between 1 and ${PERIOD_MINUTES_MAX}.`);
  }
  return seconds === ageGroup.periodSeconds ? null : seconds;
}

export function newGameDefaults(
  sport: string | null | undefined,
  ageGroup: string | null | undefined,
  teamSize?: number | null,
  /** Basketball: the team's halves or quarters; touch and Oztag: halves or one period (teams.period_count). */
  periodCount?: number | null,
): NewGameDefaults {
  // A basketball team's quarters take a quarter's sub interval, and a
  // touch team's one period its own.
  const cfg =
    sport === "basketball"
      ? basketballAgeGroupForTeam(ageGroup, periodCount)
      : isSportId(sport) && isTouch(sport)
        ? touchAgeGroupForTeam(sport, ageGroup, periodCount)
        : getAgeGroupConfig(sport, ageGroup);
  return {
    on_field_size: teamOnFieldSize(cfg, teamSize),
    sub_interval_seconds: cfg.subIntervalSeconds,
  };
}
