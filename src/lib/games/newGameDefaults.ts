// ─── newGameDefaults ─────────────────────────────────────────
// The on-field size and sub interval a new game starts with, from the
// team's own sport + age group. Every game-creation path uses it so a
// game's defaults don't depend on how it was made:
//
//   - `(app)/teams/[teamId]/games/actions.ts:createGame` (coach form)
//   - `(app)/teams/[teamId]/games/playhq-actions.ts` (coach import)
//   - `api/cron/sync-playhq/route.ts` (nightly sync)
//
// Pure: no I/O. Callers pass the team row's sport + age_group.
//
// The sub interval is the age group's quarter-length-derived value
// (F4/SUB-02). Before 2026-10-13, AFL read a hand-set 3 / 4 min from
// the legacy AGE_GROUPS table, and hand-made games of every sport
// took the DB default of 180s.

import { getAgeGroupConfig } from "@/lib/sports";

export interface NewGameDefaults {
  on_field_size: number;
  sub_interval_seconds: number;
}

export function newGameDefaults(
  sport: string | null | undefined,
  ageGroup: string | null | undefined,
): NewGameDefaults {
  const cfg = getAgeGroupConfig(sport, ageGroup);
  return {
    on_field_size: cfg.defaultOnFieldSize,
    sub_interval_seconds: cfg.subIntervalSeconds,
  };
}
