import { describe, expect, it } from "vitest";
import { playerZoneMsOnField } from "@/lib/sports/rugby_league/fairness";
import type { GameEvent, GameEventType } from "@/lib/types";

let _ts = 0;
function ev(
  type: GameEventType,
  metadata: Record<string, unknown> = {},
  playerId: string | null = null,
): GameEvent {
  _ts++;
  return {
    id: `e${_ts}`,
    game_id: "g1",
    type,
    player_id: playerId,
    metadata,
    created_by: null,
    created_at: new Date(2026, 0, 1, 9, 0, _ts).toISOString(),
  };
}
function reset() {
  _ts = 0;
}

function lineupSet(forwards: string[], backs: string[], bench: string[]): GameEvent {
  return ev("lineup_set", { lineup: { forwards, backs, bench } });
}
function qStart(quarter: number): GameEvent {
  return ev("quarter_start", { quarter });
}
function qEnd(quarter: number, elapsed_ms: number): GameEvent {
  return ev("quarter_end", { quarter, elapsed_ms });
}
function swap(
  off: string,
  on: string,
  quarter: number,
  elapsed_ms: number,
): GameEvent {
  return ev("swap", {
    off_player_id: off,
    on_player_id: on,
    quarter,
    elapsed_ms,
  });
}
function vestAssigned(
  playerId: string,
  vest: "fr" | "dh",
  period: number,
  replacement = false,
  elapsed_ms?: number,
): GameEvent {
  const meta: Record<string, unknown> = { vest, period, replacement };
  if (elapsed_ms !== undefined) meta.elapsed_ms = elapsed_ms;
  return ev("vest_assigned", meta, playerId);
}

const MIN = 60 * 1000;

describe("playerZoneMsOnField", () => {
  it("returns empty for an event-less game", () => {
    reset();
    expect(playerZoneMsOnField([], 0, 0)).toEqual({});
  });

  it("attributes a full unbroken quarter to forwards / backs by zone", () => {
    reset();
    const events: GameEvent[] = [
      lineupSet(["p1"], ["p2"], []),
      qStart(1),
      qEnd(1, 8 * MIN),
    ];
    const out = playerZoneMsOnField(events, 0, 0);
    expect(out.p1).toEqual({ forwards: 8 * MIN, centre: 0, backs: 0 });
    expect(out.p2).toEqual({ forwards: 0, centre: 0, backs: 8 * MIN });
  });

  it("vest-wearer's whole period is credited to centre", () => {
    reset();
    const events: GameEvent[] = [
      lineupSet(["p1"], ["p2"], []),
      // Vest plan written before kickoff (mirrors the real flow).
      vestAssigned("p2", "fr", 1),
      qStart(1),
      qEnd(1, 8 * MIN),
    ];
    const out = playerZoneMsOnField(events, 0, 0);
    expect(out.p2).toEqual({ forwards: 0, centre: 8 * MIN, backs: 0 });
    // p1 still all forwards.
    expect(out.p1).toEqual({ forwards: 8 * MIN, centre: 0, backs: 0 });
  });

  it("non-vested swap-in joins the off-player's vacated zone", () => {
    reset();
    const events: GameEvent[] = [
      lineupSet(["p1"], ["p2"], ["p3"]),
      qStart(1),
      // 4 minutes in p1 (forward) → p3 (off bench)
      swap("p1", "p3", 1, 4 * MIN),
      qEnd(1, 8 * MIN),
    ];
    const out = playerZoneMsOnField(events, 0, 0);
    expect(out.p1).toEqual({ forwards: 4 * MIN, centre: 0, backs: 0 });
    expect(out.p3).toEqual({ forwards: 4 * MIN, centre: 0, backs: 0 });
    expect(out.p2).toEqual({ forwards: 0, centre: 0, backs: 8 * MIN });
  });

  it("live ongoing stints extend to currentElapsedMs when activeQuarter matches", () => {
    reset();
    const events: GameEvent[] = [
      lineupSet(["p1"], ["p2"], []),
      qStart(1),
    ];
    // No quarter_end yet; we're live mid-Q1 at 5 minutes elapsed.
    const out = playerZoneMsOnField(events, 1, 5 * MIN);
    expect(out.p1).toEqual({ forwards: 5 * MIN, centre: 0, backs: 0 });
    expect(out.p2).toEqual({ forwards: 0, centre: 0, backs: 5 * MIN });
  });

  it("vests do not carry across periods — Q2 with no plan is plain forwards/backs", () => {
    reset();
    const events: GameEvent[] = [
      lineupSet(["p1"], ["p2"], []),
      vestAssigned("p1", "fr", 1),
      // No vest plan for Q2.
      qStart(1),
      qEnd(1, 8 * MIN),
      qStart(2),
      qEnd(2, 8 * MIN),
    ];
    const out = playerZoneMsOnField(events, 0, 0);
    // p1 spent Q1 in centre (vest), Q2 in forwards.
    expect(out.p1).toEqual({ forwards: 8 * MIN, centre: 8 * MIN, backs: 0 });
  });

  it("league_position_change splits a stint between zones", () => {
    reset();
    const events: GameEvent[] = [
      lineupSet(["p1"], [], ["p2"]),
      qStart(1),
      ev("league_position_change", {
        quarter: 1,
        elapsed_ms: 3 * MIN,
        to_zone: "back",
      }, "p1"),
      qEnd(1, 8 * MIN),
    ];
    const out = playerZoneMsOnField(events, 0, 0);
    expect(out.p1).toEqual({ forwards: 3 * MIN, centre: 0, backs: 5 * MIN });
  });

  it("mid-period replacement vest hands off centre time", () => {
    reset();
    const events: GameEvent[] = [
      lineupSet(["p1", "p2"], [], []),
      vestAssigned("p1", "fr", 1), // planned wearer
      qStart(1),
      // 4 minutes in, p1 is injured-replaced by p2 for FR.
      vestAssigned("p2", "fr", 1, true, 4 * MIN),
      qEnd(1, 8 * MIN),
    ];
    const out = playerZoneMsOnField(events, 0, 0);
    // p1: 4 min in centre, then 4 min in forwards (no vest).
    expect(out.p1).toEqual({ forwards: 4 * MIN, centre: 4 * MIN, backs: 0 });
    // p2: 4 min in forwards, then 4 min in centre (took the vest).
    expect(out.p2).toEqual({ forwards: 4 * MIN, centre: 4 * MIN, backs: 0 });
  });
});
