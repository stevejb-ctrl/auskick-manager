// ─── importedGameDefaults ────────────────────────────────────
// The on-field size and sub interval a PlayHQ-imported game starts
// with. Two paths create games from PlayHQ fixtures and must agree:
//
//   - `(app)/teams/[teamId]/games/playhq-actions.ts` (coach import)
//   - `api/cron/sync-playhq/route.ts` (nightly sync)
//
// Pure: no I/O. Callers pass the team row's sport + age_group.
//
// Netball and rugby league read their own sport's age-group config.
// They used to read the AFL-only AGE_GROUPS table, which gave a
// league U13 team AFL U13's 15-a-side instead of 13.
//
// AFL deliberately stays on the legacy AGE_GROUPS table, same as the
// demo seed (`(marketing)/demo/actions.ts`). The registry's AFL
// sub interval is derived from the quarter length (F4/SUB-02) and
// differs from the hand-set legacy value (e.g. U10: 240s vs 180s),
// so switching AFL here would silently change imported AFL games.

import { AGE_GROUPS, ageGroupOf } from "@/lib/ageGroups";
import { getAgeGroupConfig, getSportConfig } from "@/lib/sports";

export interface ImportedGameDefaults {
  on_field_size: number;
  sub_interval_seconds: number;
}

export function importedGameDefaults(
  sport: string | null | undefined,
  ageGroup: string | null | undefined,
): ImportedGameDefaults {
  if (getSportConfig(sport).id === "afl") {
    const cfg = AGE_GROUPS[ageGroupOf(ageGroup)];
    return {
      on_field_size: cfg.defaultOnFieldSize,
      sub_interval_seconds: cfg.subIntervalSeconds,
    };
  }
  const cfg = getAgeGroupConfig(sport, ageGroup);
  return {
    on_field_size: cfg.defaultOnFieldSize,
    sub_interval_seconds: cfg.subIntervalSeconds,
  };
}
