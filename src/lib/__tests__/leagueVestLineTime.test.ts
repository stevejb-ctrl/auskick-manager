// ─── Season balance counts vest time in a line ───────────────
// UX audit, 23 Oct 2026 (league P1): season balance dropped every
// minute played in a vest. A kid in the FR vest for a whole half showed
// Fwds 0 / Backs 0: the rugby line time put vest time in "centre", a
// key no line reads. The First Receiver now counts as a back and the
// Dummy Half as a forward — the vest spots' lines on the field
// (LeagueField: the FR spot is a back's, the DH spot a forward's).
// Stored rollups from before the fix (with a "centre" row) are
// rebuilt from the game's events.

import { describe, expect, it } from "vitest";
import type { GameEvent, GameEventType } from "@/lib/types";
import { gameTimeByUnit, seasonTimeByUnit } from "@/lib/playbook/seasonTime";
import { gameRollupRows, staleRollupGameIds } from "@/lib/playbook/rollup";
import { playerZoneMsOnField } from "@/lib/sports/rugby_league/fairness";

const MIN = 60_000;
let ts = 0;
function ev(type: GameEventType, metadata: Record<string, unknown> = {}, playerId: string | null = null, gameId = "g1"): GameEvent {
  ts++;
  return {
    id: `e${ts}`,
    game_id: gameId,
    type,
    player_id: playerId,
    metadata,
    created_at: new Date(Date.UTC(2026, 9, 1, 9, 0, ts)).toISOString(),
    created_by: null,
  } as GameEvent;
}

// F1 (a forward) wears FR, B1 (a back) wears DH, for the whole 20-minute half.
function game(gameId = "g1"): GameEvent[] {
  return [
    ev("lineup_set", { lineup: { forwards: ["F1", "F2"], backs: ["B1", "B2"], bench: ["S1"] } }, null, gameId),
    ev("vest_assigned", { vest: "fr", period: 1 }, "F1", gameId),
    ev("vest_assigned", { vest: "dh", period: 1 }, "B1", gameId),
    ev("quarter_start", { quarter: 1 }, null, gameId),
    ev("quarter_end", { quarter: 1, elapsed_ms: 20 * MIN }, null, gameId),
  ];
}

describe("rugby line time with vests", () => {
  it("credits the FR vest to the backs and the DH vest to the forwards", () => {
    const lines = gameTimeByUnit("rugby_league", game(), "line");
    expect(lines.F1).toEqual({ backs: 20 * MIN });
    expect(lines.B1).toEqual({ forwards: 20 * MIN });
    expect(lines.F2).toEqual({ forwards: 20 * MIN });
    expect(lines.B2).toEqual({ backs: 20 * MIN });
  });

  it("a vest handed on mid-half splits the time at the hand-off", () => {
    const events = [
      ...game().slice(0, 4),
      // F2 takes the FR vest from F1 at 8:00 (a replacement).
      ev("vest_assigned", { vest: "fr", period: 1, replacement: true, elapsed_ms: 8 * MIN }, "F2"),
      ev("quarter_end", { quarter: 1, elapsed_ms: 20 * MIN }),
    ];
    const lines = gameTimeByUnit("rugby_league", events, "line");
    expect(lines.F1).toEqual({ backs: 8 * MIN, forwards: 12 * MIN });
    expect(lines.F2).toEqual({ forwards: 8 * MIN, backs: 12 * MIN });
  });

  it("season balance sums it game by game; nothing lands in an unread key", () => {
    const season = seasonTimeByUnit("rugby_league", [...game("g1"), ...game("g2")], "line");
    expect(season.F1).toEqual({ backs: 40 * MIN });
    for (const byLine of Object.values(season)) expect(Object.keys(byLine).every((k) => k === "forwards" || k === "backs")).toBe(true);
  });

  it("the tiles' bar still shows vest time as its centre", () => {
    expect(playerZoneMsOnField(game(), Number.MAX_SAFE_INTEGER, 0).F1).toEqual({ forwards: 0, centre: 20 * MIN, backs: 0 });
  });
});

describe("stored rollups from before the fix", () => {
  it("a rugby game with a stored centre row is rebuilt; others are kept", () => {
    const fresh = gameRollupRows("rugby_league", "g1", "t1", game("g1"), 1200);
    expect(fresh.some((r) => r.unit_key === "centre")).toBe(false);
    const old = [
      { game_id: "g2", unit_kind: "line" as const, unit_key: "centre" },
      { game_id: "g2", unit_kind: "line" as const, unit_key: "forwards" },
      { game_id: "g3", unit_kind: "line" as const, unit_key: "backs" },
    ];
    expect(staleRollupGameIds("rugby_league", [...fresh, ...old])).toEqual(["g2"]);
    expect(staleRollupGameIds("rugby_union", old)).toEqual(["g2"]);
    expect(staleRollupGameIds("afl", [{ game_id: "g4", unit_kind: "zone", unit_key: "mid" }])).toEqual([]);
  });
});
