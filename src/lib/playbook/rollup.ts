// player_game_time (UX plan §7.5 v2, chunk 4.5): a per-game rollup of
// each player's time per unit, so season balance and stats are a sum of
// ~1,500 rows a season instead of a walk over every event. Written at
// finalise, deleted on restart, and backfilled on read for any final
// game that has none. One base unit is stored per sport — AFL zones,
// netball bibs, rugby and soccer lines — and coarser units fold from it.

import type { GameEvent, Sport } from "@/lib/types";
import type { BalanceUnit } from "@/lib/playbook/types";
import { primaryThirdFor } from "@/lib/sports/netball";
import { gameTimeByUnit, type UnitTime } from "@/lib/playbook/seasonTime";

export interface PlayerGameTimeRow {
  game_id: string;
  team_id: string;
  player_id: string;
  unit_kind: BalanceUnit;
  unit_key: string;
  ms: number;
  periods: number;
  played_at: string;
}

/** The unit stored for each sport. */
export const BASE_UNIT: Record<Sport, BalanceUnit> = {
  afl: "zone",
  netball: "bib",
  rugby_league: "line",
  rugby_union: "line",
  // Lines and goal (gk).
  soccer: "line",
  // Guards and forwards (or the court, under Equal minutes).
  basketball: "line",
};

/**
 * Units stored per sport: the base unit, plus rugby named positions
 * (UX plan 5.7), which can't fold from lines. A game with no recorded
 * slots simply writes no position rows.
 */
const STORED_UNITS: Record<Sport, BalanceUnit[]> = {
  afl: ["zone"],
  netball: ["bib"],
  rugby_league: ["line", "position"],
  rugby_union: ["line", "position"],
  // Named positions come with soccer's How we play (phase 3).
  soccer: ["line"],
  // Lines, and the five positions (1 to 5) the position strategies play.
  basketball: ["line", "position"],
};

export function gameRollupRows(
  sport: Sport,
  gameId: string,
  teamId: string,
  events: GameEvent[],
  periodSeconds: number,
): PlayerGameTimeRow[] {
  if (events.length === 0) return [];
  const playedAt = events.reduce((m, e) => (e.created_at < m ? e.created_at : m), events[0].created_at);
  const rows: PlayerGameTimeRow[] = [];
  for (const unit of STORED_UNITS[sport]) {
    const time = gameTimeByUnit(sport, events, unit, periodSeconds);
    for (const [pid, byKey] of Object.entries(time)) {
      for (const [key, ms] of Object.entries(byKey)) {
        if (!(ms > 0)) continue;
        rows.push({
          game_id: gameId,
          team_id: teamId,
          player_id: pid,
          unit_kind: unit,
          unit_key: key,
          ms: Math.round(ms),
          periods: Math.round((ms / (periodSeconds * 1000)) * 100) / 100,
          played_at: playedAt,
        });
      }
    }
  }
  return rows;
}

const AFL_LINE: Record<string, string> = { back: "back", hback: "back", mid: "mid", hfwd: "fwd", fwd: "fwd" };

/** Season time per player per unit from rollup rows, folding coarser units. */
export function seasonFromRollup(
  rows: Pick<PlayerGameTimeRow, "player_id" | "unit_kind" | "unit_key" | "ms" | "played_at">[],
  unit: BalanceUnit,
  since?: string | null,
): UnitTime {
  const out: UnitTime = {};
  for (const r of rows) {
    if (since && r.played_at < since) continue;
    let key: string | null = r.unit_key;
    if (r.unit_kind === "zone" && unit === "line") key = AFL_LINE[r.unit_key] ?? null;
    else if (r.unit_kind === "bib" && unit === "third") key = primaryThirdFor(r.unit_key);
    else if (r.unit_kind !== unit) continue;
    if (!key) continue;
    out[r.player_id] ??= {};
    out[r.player_id][key] = (out[r.player_id][key] ?? 0) + r.ms;
  }
  return out;
}
