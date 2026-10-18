// A basketball game's events for tests, written in order a second apart,
// and the lineups each strategy plays (ten in the squad, five on court).

import type { GameEvent } from "@/lib/types";
import type { BasketballLineup } from "@/lib/sports/basketball/lineup";

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
      created_at: new Date(Date.UTC(2026, 9, 18, 9, 0, n)).toISOString(),
    });
    return events[events.length - 1];
  };
  return {
    events,
    add,
    lineup: (lineup: BasketballLineup) => add("lineup_set", { lineup }),
    start: (quarter: number) => add("quarter_start", { quarter }),
    end: (quarter: number, minutes: number) => add("quarter_end", { quarter, elapsed_ms: minutes * MIN }),
    swap: (off: string, on: string, minutes: number, line?: string) =>
      add("swap", { off_player_id: off, on_player_id: on, elapsed_ms: minutes * MIN, ...(line ? { line } : {}) }),
    move: (a: string, b: string | null, zoneB: string, minutes: number) =>
      add("field_zone_swap", { player_a_id: a, ...(b ? { player_b_id: b } : {}), zone_b: zoneB, elapsed_ms: minutes * MIN }),
    basket: (type: string, minutes: number, player: string | null = null) => add(type, { elapsed_ms: minutes * MIN }, player),
    foul: (player: string, minutes: number, extra: Record<string, unknown> = {}) =>
      add("foul", { kind: "personal", elapsed_ms: minutes * MIN, ...extra }, player),
    foulOut: (player: string, minutes: number) =>
      add("injury", { injured: true, reason: "fouled_out", elapsed_ms: minutes * MIN }, player),
    sitOut: (player: string, minutes: number, forMinutes = 5) =>
      add("sit_out", { duration_ms: forMinutes * MIN, elapsed_ms: minutes * MIN }, player),
  };
}

/** Equal minutes: five on court, no positions, five on the bench. */
export const COURT: BasketballLineup = {
  lines: { guard: [], forward: [], court: ["a", "b", "c", "d", "e"] },
  bench: ["f", "g", "h", "i", "j"],
};

/** Guards and forwards, 2–3. */
export const LINES: BasketballLineup = {
  lines: { guard: ["a", "b"], forward: ["c", "d", "e"], court: [] },
  bench: ["f", "g", "h", "i", "j"],
};

/** The five positions. */
export const POSITIONS: BasketballLineup = {
  lines: { guard: ["a", "b"], forward: ["c", "d", "e"], court: [] },
  bench: ["f", "g", "h", "i", "j"],
  slots: { a: "pg", b: "sg", c: "sf", d: "pf", e: "c" },
};

export const SQUAD = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
