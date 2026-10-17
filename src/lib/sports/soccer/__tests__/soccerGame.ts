// A soccer game's events for tests, written in order a second apart,
// and a 7-a-side lineup (2-3-1, two on the bench).

import type { GameEvent } from "@/lib/types";
import type { SoccerLineup } from "@/lib/sports/soccer/lineup";

export const MIN = 60_000;

/** A game's events, written in order a second apart. */
export function game() {
  const events: GameEvent[] = [];
  const add = (type: string, metadata: Record<string, unknown> = {}, player_id: string | null = null) => {
    const n = events.length + 1;
    events.push({
      id: `e${n}`,
      game_id: "g1",
      type: type as GameEvent["type"],
      player_id,
      metadata,
      created_by: "u1",
      created_at: new Date(Date.UTC(2026, 9, 17, 9, 0, n)).toISOString(),
    });
    return events[events.length - 1];
  };
  return {
    events,
    add,
    lineup: (lineup: SoccerLineup) => add("lineup_set", { lineup }),
    start: (quarter: number) => add("quarter_start", { quarter }),
    end: (quarter: number, minutes: number) => add("quarter_end", { quarter, elapsed_ms: minutes * MIN }),
    swap: (off: string, on: string, minutes: number, line?: string) =>
      add("swap", { off_player_id: off, on_player_id: on, elapsed_ms: minutes * MIN, ...(line ? { line } : {}) }),
    move: (a: string, zoneA: string, b: string | null, zoneB: string, minutes: number) =>
      add("field_zone_swap", { player_a_id: a, zone_a: zoneA, ...(b ? { player_b_id: b } : {}), zone_b: zoneB, elapsed_ms: minutes * MIN }),
  };
}

export const SEVEN: SoccerLineup = {
  keeper: "k",
  lines: { def: ["d1", "d2"], mid: ["m1", "m2", "m3"], att: ["a1"], field: [] },
  bench: ["b1", "b2"],
};

