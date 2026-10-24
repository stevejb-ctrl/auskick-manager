// Netball's % time is over the time each kid could play (UX round 2,
// 24 Oct 2026): Zoe, hurt at 6:29 and out for the game, read 16%, and
// Sophie, who got there for Q2 and played 20 of her 30 minutes, read
// 50%. AFL's stats and How we played both leave out the time a kid
// couldn't play (late, hurt, lent).

import { describe, expect, it } from "vitest";
import { computeNetballPlayerStats, replayNetballGameForStats } from "@/lib/dashboard/netballAggregators";
import type { GameEvent, Player } from "@/lib/types";

const POS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"];
const ids = ["zoe", "p1", "p2", "p3", "p4", "p5", "p6"];
const lineup = (over: Record<string, string> = {}, bench: string[]) => ({
  positions: Object.fromEntries(POS.map((p, i) => [p, [over[p] ?? ids[i]]])),
  bench,
});

let n = 0;
function ev(type: string, metadata: Record<string, unknown> = {}, playerId: string | null = null): GameEvent {
  n++;
  return {
    id: `e${n}`,
    game_id: "g1",
    type,
    player_id: playerId,
    metadata,
    created_by: "u",
    created_at: new Date(Date.UTC(2026, 9, 24, 9, 0, n)).toISOString(),
  } as GameEvent;
}

const Q = 600_000;
const HURT_AT = 389_000; // 6:29

const events = [
  ev("lineup_set", { lineup: lineup({}, ["p7", "p8"]) }),
  ev("quarter_start", { quarter: 1 }),
  ev("injury", { injured: true, quarter: 1, elapsed_ms: HURT_AT }, "zoe"),
  ev("player_arrived", { quarter: 2, elapsed_ms: 0 }, "sophie"),
  // Q2: p7 replaced Zoe at GS for the rest of Q1; Sophie starts Q2 at GS.
  ev("period_break_swap", {
    lineup: lineup({ gs: "sophie" }, ["p7", "p8", "zoe"]),
    midQuarterSubs: [
      { positionId: "gs", outPlayerId: "zoe", inPlayerId: null, atMs: HURT_AT },
      { positionId: "gs", outPlayerId: null, inPlayerId: "p7", atMs: HURT_AT },
    ],
  }),
  ev("quarter_start", { quarter: 2 }),
  ev("period_break_swap", { lineup: lineup({ gs: "sophie" }, ["p7", "p8", "zoe"]), midQuarterSubs: [] }),
  ev("quarter_start", { quarter: 3 }),
  ev("period_break_swap", { lineup: lineup({ gs: "p7" }, ["sophie", "p8", "zoe"]), midQuarterSubs: [] }),
  ev("quarter_start", { quarter: 4 }),
  ev("game_finalised", { midQuarterSubs: [] }),
];

describe("netball stats: % of the time they could play", () => {
  const players = [...ids, "sophie", "p7", "p8"].map((id) => ({ id, full_name: id }) as Player);
  const stats = computeNetballPlayerStats(players, [replayNetballGameForStats("g1", events, Q / 1000)]);
  const row = (id: string) => stats.find((s) => s.playerId === id)!;

  it("leaves out the rest of the game after an injury", () => {
    expect(row("zoe").totalMs).toBe(HURT_AT);
    expect(row("zoe").teamGameTimePct).toBe(100);
  });

  it("leaves out the time before a late arrival", () => {
    expect(row("sophie").totalMs).toBe(2 * Q);
    expect(row("sophie").teamGameTimePct).toBe(67);
  });

  it("still holds a kid who was there all game to the whole game", () => {
    expect(row("p1").teamGameTimePct).toBe(100);
    expect(row("p8").teamGameTimePct).toBe(0);
  });
});
