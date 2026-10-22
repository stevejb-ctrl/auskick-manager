// A touch or Oztag game's events for tests, written in order a second
// apart, and the lineups the strategies play.

import type { GameEvent, MixedGroup } from "@/lib/types";
import type { TouchLineup } from "@/lib/sports/touch/lineup";

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
      created_at: new Date(Date.UTC(2026, 9, 22, 9, 0, n)).toISOString(),
    });
    return events[events.length - 1];
  };
  return {
    events,
    add,
    lineup: (lineup: TouchLineup) => add("lineup_set", { lineup }),
    start: (quarter: number) => add("quarter_start", { quarter }),
    end: (quarter: number, minutes: number) => add("quarter_end", { quarter, elapsed_ms: minutes * MIN }),
    swap: (off: string | null, on: string, minutes: number, line?: string) =>
      add("swap", { off_player_id: off, on_player_id: on, elapsed_ms: minutes * MIN, ...(line ? { line } : {}) }),
    move: (a: string, b: string | null, zoneB: string, minutes: number) =>
      add("field_zone_swap", { player_a_id: a, ...(b ? { player_b_id: b } : {}), zone_b: zoneB, elapsed_ms: minutes * MIN }),
    score: (type: string, minutes: number, player: string | null = null) => add(type, { elapsed_ms: minutes * MIN }, player),
    injure: (player: string, minutes: number, injured = true) => add("injury", { injured, elapsed_ms: minutes * MIN }, player),
    shrink: (size: number, minutes: number) => add("roster_shrink", { on_field_size: size, elapsed_ms: minutes * MIN }),
  };
}

/** Minutes only: six on, no lanes, six on the bench. */
export const FIELD: TouchLineup = {
  lines: { middle: [], link: [], wing: [], field: ["a", "b", "c", "d", "e", "f"] },
  bench: ["g", "h", "i", "j", "k", "l"],
};

/** Lanes, 2-2-2. */
export const LANES: TouchLineup = {
  lines: { middle: ["a", "b"], link: ["c", "d"], wing: ["e", "f"], field: [] },
  bench: ["g", "h", "i", "j", "k", "l"],
};

export const SQUAD = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"];

/** A mixed squad: eight boys and four girls (the plan's example). */
export const MIXED_GROUPS: Record<string, MixedGroup> = {
  a: "girl",
  b: "girl",
  c: "girl",
  d: "boy",
  e: "boy",
  f: "boy",
  g: "girl",
  h: "boy",
  i: "boy",
  j: "boy",
  k: "boy",
  l: "boy",
};

export const groupOf = (id: string): MixedGroup | null => MIXED_GROUPS[id] ?? null;
