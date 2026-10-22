// ─── The soccer family: each sport's own rules ───────────────
// Football (soccer), futsal and hockey run on one engine
// (.planning/FOUR-SPORTS-PLAN.md), as league and union share rugby's.
// Everything a screen or suggester needs to know about the sport it's
// running comes through here, from that sport's own config: its age
// groups and its settings (soccer/types.ts SoccerFamilyRules). Nothing
// reads another sport's: a futsal U10 is futsal's U10, never soccer's.

import { getSportConfig, isSoccer, type SoccerSport } from "@/lib/sports/registry";
import type { SportId } from "@/lib/sports/types";
import { deriveSubIntervalSeconds } from "@/lib/sports/subInterval";
import { SOCCER_RULES } from "@/lib/sports/soccer";
import { FUTSAL_RULES } from "@/lib/sports/futsal";
import { HOCKEY_RULES } from "@/lib/sports/hockey";
import type { SoccerAgeGroupConfig, SoccerFamilyRules } from "@/lib/sports/soccer/types";

const RULES: Record<SoccerSport, SoccerFamilyRules> = {
  soccer: SOCCER_RULES,
  futsal: FUTSAL_RULES,
  hockey: HOCKEY_RULES,
};

/** A soccer-family sport's settings: line words, surface, keeper swaps, rule source. */
export function soccerFamilyRules(sport: SoccerSport): SoccerFamilyRules {
  return RULES[sport];
}

/**
 * A soccer-family sport, checked: a sport outside the family is an
 * error, never soccer.
 */
export function soccerFamilySport(sport: SportId): SoccerSport {
  if (!isSoccer(sport)) throw new Error(`${getSportConfig(sport).name} isn't on the soccer family's engine`);
  return sport;
}

/**
 * A soccer-family age group, from the sport's own ages. The id must be
 * one of that sport's (an unknown one is an error, not another age's or
 * another sport's rules).
 */
export function soccerFamilyAgeGroup(sport: SportId, id: string | null | undefined): SoccerAgeGroupConfig {
  const cfg = getSportConfig(soccerFamilySport(sport));
  const hit = cfg.ageGroups.find((a) => a.id === id);
  if (!hit) throw new Error(`Unknown ${cfg.name} age group "${String(id)}"`);
  return hit as SoccerAgeGroupConfig;
}

/**
 * The age group a team plays: its sport's own, in the team's halves or
 * quarters (teams.period_count) where the sport lets a team choose
 * (hockey: VIC's U13 and up play 2 × 30, not 4 × 15). The game's length
 * stays the age group's: two halves of a 4 × 15 game run 30 minutes
 * each. Null, or the age group's own count, is the age group as it is.
 */
export function soccerFamilyAgeGroupForTeam(
  sport: SportId,
  id: string | null | undefined,
  periodCount: number | null | undefined,
): SoccerAgeGroupConfig {
  const ag = soccerFamilyAgeGroup(sport, id);
  if (!soccerFamilyRules(soccerFamilySport(sport)).halvesOrQuarters) return ag;
  if ((periodCount !== 2 && periodCount !== 4) || periodCount === ag.periodCount) return ag;
  const periodSeconds = (ag.periodSeconds * ag.periodCount) / periodCount;
  const quarters = periodCount === 4;
  return {
    ...ag,
    periodCount,
    periodSeconds,
    subIntervalSeconds: deriveSubIntervalSeconds(periodSeconds, ag.subIntervalFloorSeconds),
    periodLabel: quarters ? "quarter" : "half",
    periodLabelPlural: quarters ? "quarters" : "halves",
  };
}
