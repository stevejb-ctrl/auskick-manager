// ─── Touch family — each sport's age groups ──────────────────
// Touch football and Oztag share the engine; each states its own rules
// in its own config (../touch/index.ts, ../oztag/index.ts). These look
// a team's age group up in its own sport's table, never the other's: a
// touch U10 and an Oztag U10 play different sizes.

import { deriveSubIntervalSeconds } from "@/lib/sports/subInterval";
import type { TouchSport } from "@/lib/sports/registry";
import { TOUCH_AGE_GROUPS } from "@/lib/sports/touch";
import { OZTAG_AGE_GROUPS } from "@/lib/sports/oztag";
import type { TouchAgeGroupConfig } from "@/lib/sports/touch/types";

const TABLES: Record<TouchSport, TouchAgeGroupConfig[]> = {
  touch: TOUCH_AGE_GROUPS,
  oztag: OZTAG_AGE_GROUPS,
};

/** The sport's age groups. */
export function touchFamilyAgeGroups(sport: TouchSport): TouchAgeGroupConfig[] {
  return TABLES[sport];
}

/**
 * A touch-family age group, from its own sport's table. An unknown id
 * is an error, not another age's (or sport's) rules.
 */
export function touchAgeGroup(sport: TouchSport, id: string | null | undefined): TouchAgeGroupConfig {
  const hit = TABLES[sport].find((a) => a.id === id);
  if (!hit) throw new Error(`Unknown ${sport} age group "${String(id)}"`);
  return hit;
}

/** The period counts a team can play: halves (the default) or one continuous period. */
export type TouchPeriodCount = 1 | 2;

/**
 * The age group as a team plays it: halves, or one continuous period
 * of both halves' length (teams.period_count 1, as Newcastle's junior
 * touch plays 25 minutes straight). The team's own period length
 * (teams.quarter_length_seconds) still wins, through
 * getEffectiveQuarterSeconds.
 */
export function touchAgeGroupForTeam(
  sport: TouchSport,
  ageGroupId: string | null | undefined,
  periodCount: number | null | undefined,
): TouchAgeGroupConfig {
  const ag = touchAgeGroup(sport, ageGroupId);
  if (periodCount !== 1) return ag;
  const periodSeconds = ag.periodSeconds * ag.periodCount;
  return {
    ...ag,
    periodCount: 1,
    periodSeconds,
    subIntervalSeconds: deriveSubIntervalSeconds(periodSeconds, ag.subIntervalFloorSeconds),
    periodLabel: "period",
    periodLabelPlural: "periods",
  };
}
