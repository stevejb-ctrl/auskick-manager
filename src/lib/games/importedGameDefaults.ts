// ─── importedGameDefaults ────────────────────────────────────
// The on-field size and sub interval a PlayHQ-imported game starts
// with. Two paths create games from PlayHQ fixtures and must agree:
//
//   - `(app)/teams/[teamId]/games/playhq-actions.ts` (coach import)
//   - `api/cron/sync-playhq/route.ts` (nightly sync)
//
// Pure: no I/O. Callers pass the team row's age_group.

import { AGE_GROUPS, ageGroupOf } from "@/lib/ageGroups";

export interface ImportedGameDefaults {
  on_field_size: number;
  sub_interval_seconds: number;
}

export function importedGameDefaults(
  ageGroup: string | null | undefined,
): ImportedGameDefaults {
  const cfg = AGE_GROUPS[ageGroupOf(ageGroup)];
  return {
    on_field_size: cfg.defaultOnFieldSize,
    sub_interval_seconds: cfg.subIntervalSeconds,
  };
}
