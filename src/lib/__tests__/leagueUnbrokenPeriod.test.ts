import { describe, expect, it } from "vitest";
import {
  unbrokenPeriodCompliance,
  unbrokenPeriodLiveStatus,
} from "@/lib/sports/rugby_league/fairness";
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

function lineupSet(field: string[], bench: string[]): GameEvent {
  return ev("lineup_set", { lineup: { field, bench } });
}
function qStart(q: number): GameEvent {
  return ev("quarter_start", { quarter: q });
}
function qEnd(q: number, elapsedMs: number = 8 * 60 * 1000): GameEvent {
  return ev("quarter_end", { quarter: q, elapsed_ms: elapsedMs });
}
function swap(off: string, on: string, q: number): GameEvent {
  return ev("swap", { off_player_id: off, on_player_id: on, quarter: q });
}

// ─── unbrokenPeriodCompliance (closed game) ──────────────────

describe("unbrokenPeriodCompliance — happy path", () => {
  it("returns empty result for an event-less game", () => {
    reset();
    expect(unbrokenPeriodCompliance([], 1)).toEqual({});
  });

  it("starters who survive the period get credit", () => {
    reset();
    const events = [
      lineupSet(["p1", "p2"], ["p3"]),
      qStart(1),
      qEnd(1),
    ];
    const result = unbrokenPeriodCompliance(events, 1);
    expect(result.p1).toEqual({
      unbrokenPeriods: [1],
      required: 1,
      compliant: true,
    });
    expect(result.p2.unbrokenPeriods).toEqual([1]);
  });

  it("subbed-off players LOSE credit for the period they were subbed out of", () => {
    reset();
    const events = [
      lineupSet(["p1", "p2"], ["p3"]),
      qStart(1),
      swap("p1", "p3", 1),
      qEnd(1),
    ];
    const result = unbrokenPeriodCompliance(events, 1);
    expect(result.p1.unbrokenPeriods).toEqual([]);
    expect(result.p1.compliant).toBe(false);
    expect(result.p2.unbrokenPeriods).toEqual([1]);
  });

  it("swap-on players don't get credit for the period they came on in", () => {
    reset();
    const events = [
      lineupSet(["p1", "p2"], ["p3"]),
      qStart(1),
      swap("p1", "p3", 1), // p3 comes on mid-period
      qEnd(1),
    ];
    const result = unbrokenPeriodCompliance(events, 1);
    expect(result.p3.unbrokenPeriods).toEqual([]);
  });

  it("bench-only players appear with empty unbroken list", () => {
    reset();
    const events = [
      lineupSet(["p1", "p2"], ["p3"]),
      qStart(1),
      qEnd(1),
    ];
    const result = unbrokenPeriodCompliance(events, 1);
    expect(result.p3).toEqual({
      unbrokenPeriods: [],
      required: 1,
      compliant: false,
    });
  });
});

describe("unbrokenPeriodCompliance — multi-period", () => {
  it("U6/U7-style: required = 2; players need 2 unbroken quarters", () => {
    reset();
    const events = [
      lineupSet(["p1", "p2"], ["p3"]),
      qStart(1),
      qEnd(1),
      qStart(2),
      qEnd(2),
    ];
    const result = unbrokenPeriodCompliance(events, 2);
    expect(result.p1.unbrokenPeriods).toEqual([1, 2]);
    expect(result.p1.compliant).toBe(true);
    // p3 is on bench entirely → not compliant
    expect(result.p3.compliant).toBe(false);
  });

  it("a player subbed off in Q1 can still be compliant if they sit Q2 unbroken", () => {
    reset();
    // Coach reshuffles between quarters: p1 on field Q2, p3 swapped off
    const events = [
      lineupSet(["p1", "p2", "p3"], ["p4"]),
      qStart(1),
      swap("p1", "p4", 1), // p1 off mid-Q1
      qEnd(1),
      // Manual re-set at Q2 start: p1 back, p3 stays, p4 off
      lineupSet(["p1", "p2", "p3"], ["p4"]),
      qStart(2),
      qEnd(2),
    ];
    const result = unbrokenPeriodCompliance(events, 1);
    expect(result.p1.unbrokenPeriods).toEqual([2]);
    expect(result.p1.compliant).toBe(true);
  });

  it("injury removes a player from the unbroken set", () => {
    reset();
    const events = [
      lineupSet(["p1", "p2"], []),
      qStart(1),
      ev("injury", {}, "p1"),
      qEnd(1),
    ];
    const result = unbrokenPeriodCompliance(events, 1);
    expect(result.p1.unbrokenPeriods).toEqual([]);
    expect(result.p2.unbrokenPeriods).toEqual([1]);
  });

  it("player_loan removes a player from the unbroken set", () => {
    reset();
    const events = [
      lineupSet(["p1", "p2"], []),
      qStart(1),
      ev("player_loan", {}, "p1"),
      qEnd(1),
    ];
    expect(unbrokenPeriodCompliance(events, 1).p1.unbrokenPeriods).toEqual([]);
  });

  it("late arrivals appear in the result (compliant: false until they start a period)", () => {
    reset();
    const events = [
      lineupSet(["p1", "p2"], []),
      qStart(1),
      qEnd(1),
      ev("player_arrived", {}, "pLate"),
    ];
    const result = unbrokenPeriodCompliance(events, 1);
    expect(result.pLate).toEqual({
      unbrokenPeriods: [],
      required: 1,
      compliant: false,
    });
  });
});

// ─── unbrokenPeriodLiveStatus (in-progress game) ─────────────

// ─── §7 injury carve-out (3-min) ─────────────────────────────
// Junior Law §7: a player keeps their unbroken-period stamp if
// their injury absence is ≤ 3 minutes of playing time. Beyond
// that — or if the player never returns before quarter_end —
// they're broken for the period.

describe("unbrokenPeriodCompliance — §7 injury carve-out", () => {
  it("brief injury (< 3 min) preserves unbroken status", () => {
    reset();
    // p1 hurt at 1:00, back on at 2:40 (1:40 absence = within 3 min)
    const events = [
      lineupSet(["p1", "p2"], []),
      qStart(1),
      ev("injury", { quarter: 1, elapsed_ms: 60_000, injured: true }, "p1"),
      ev("injury", { quarter: 1, elapsed_ms: 160_000, injured: false }, "p1"),
      qEnd(1),
    ];
    const result = unbrokenPeriodCompliance(events, 1);
    expect(result.p1.unbrokenPeriods).toEqual([1]);
    expect(result.p1.compliant).toBe(true);
  });

  it("injury absence of exactly 3 min (boundary) preserves unbroken status", () => {
    reset();
    // §7 says "up to three minutes" — 180_000 ms is inclusive.
    const events = [
      lineupSet(["p1", "p2"], []),
      qStart(1),
      ev("injury", { quarter: 1, elapsed_ms: 60_000, injured: true }, "p1"),
      ev("injury", { quarter: 1, elapsed_ms: 240_000, injured: false }, "p1"),
      qEnd(1),
    ];
    const result = unbrokenPeriodCompliance(events, 1);
    expect(result.p1.unbrokenPeriods).toEqual([1]);
  });

  it("injury absence > 3 min breaks the period", () => {
    reset();
    // 3:20 absence (200_000 ms) — past the carve-out.
    const events = [
      lineupSet(["p1", "p2"], []),
      qStart(1),
      ev("injury", { quarter: 1, elapsed_ms: 60_000, injured: true }, "p1"),
      ev("injury", { quarter: 1, elapsed_ms: 260_000, injured: false }, "p1"),
      qEnd(1),
    ];
    const result = unbrokenPeriodCompliance(events, 1);
    expect(result.p1.unbrokenPeriods).toEqual([]);
    expect(result.p1.compliant).toBe(false);
  });

  it("injury never closed before quarter_end breaks the period (regression)", () => {
    reset();
    const events = [
      lineupSet(["p1", "p2"], []),
      qStart(1),
      ev("injury", { quarter: 1, elapsed_ms: 60_000, injured: true }, "p1"),
      qEnd(1),
    ];
    const result = unbrokenPeriodCompliance(events, 1);
    expect(result.p1.unbrokenPeriods).toEqual([]);
  });

  it("two short injuries in same period both within carve-out → unbroken", () => {
    reset();
    const events = [
      lineupSet(["p1", "p2"], []),
      qStart(1),
      ev("injury", { quarter: 1, elapsed_ms: 30_000, injured: true }, "p1"),
      ev("injury", { quarter: 1, elapsed_ms: 90_000, injured: false }, "p1"),
      ev("injury", { quarter: 1, elapsed_ms: 200_000, injured: true }, "p1"),
      ev("injury", { quarter: 1, elapsed_ms: 320_000, injured: false }, "p1"),
      qEnd(1),
    ];
    const result = unbrokenPeriodCompliance(events, 1);
    expect(result.p1.unbrokenPeriods).toEqual([1]);
  });

  it("one short + one long absence in same period → broken (long wins)", () => {
    reset();
    const events = [
      lineupSet(["p1", "p2"], []),
      qStart(1),
      // First: 1 min absence — fine
      ev("injury", { quarter: 1, elapsed_ms: 30_000, injured: true }, "p1"),
      ev("injury", { quarter: 1, elapsed_ms: 90_000, injured: false }, "p1"),
      // Second: 4 min absence — breaks
      ev("injury", { quarter: 1, elapsed_ms: 200_000, injured: true }, "p1"),
      ev("injury", { quarter: 1, elapsed_ms: 440_000, injured: false }, "p1"),
      qEnd(1),
    ];
    const result = unbrokenPeriodCompliance(events, 1);
    expect(result.p1.unbrokenPeriods).toEqual([]);
  });

  it("player_loan stays unconditional (no §7 carve-out for loans)", () => {
    reset();
    // Loan + return shouldn't get the §7 treatment.
    const events = [
      lineupSet(["p1", "p2"], []),
      qStart(1),
      ev("player_loan", { quarter: 1, elapsed_ms: 60_000 }, "p1"),
      qEnd(1),
    ];
    const result = unbrokenPeriodCompliance(events, 1);
    expect(result.p1.unbrokenPeriods).toEqual([]);
  });

  it("swap-off stays unconditional (no §7 carve-out for swaps)", () => {
    reset();
    // Confirms only `injury` events trigger the carve-out.
    const events = [
      lineupSet(["p1", "p2"], ["p3"]),
      qStart(1),
      swap("p1", "p3", 1),
      qEnd(1),
    ];
    const result = unbrokenPeriodCompliance(events, 1);
    expect(result.p1.unbrokenPeriods).toEqual([]);
  });
});

describe("unbrokenPeriodLiveStatus — §7 carve-out", () => {
  it("in-flight injury within carve-out keeps player provisionally on track", () => {
    reset();
    // Injury at 1:00; clock now reads 2:30 (1:30 absence — still within 3 min)
    const events = [
      lineupSet(["p1"], []),
      qStart(1),
      ev("injury", { quarter: 1, elapsed_ms: 60_000, injured: true }, "p1"),
    ];
    const result = unbrokenPeriodLiveStatus(events, 1, 150_000);
    expect(result.p1.inProgressPeriods).toEqual([1]);
    expect(result.p1.provisionallyCompliant).toBe(true);
  });

  it("in-flight injury PAST carve-out flips to broken before close", () => {
    reset();
    // Injury at 1:00; clock now reads 5:00 (4 min absence — over the carve-out)
    const events = [
      lineupSet(["p1"], []),
      qStart(1),
      ev("injury", { quarter: 1, elapsed_ms: 60_000, injured: true }, "p1"),
    ];
    const result = unbrokenPeriodLiveStatus(events, 1, 300_000);
    expect(result.p1.inProgressPeriods).toEqual([]);
    expect(result.p1.provisionallyCompliant).toBe(false);
  });

  it("closed injury within carve-out preserves in-progress credit", () => {
    reset();
    const events = [
      lineupSet(["p1"], []),
      qStart(1),
      ev("injury", { quarter: 1, elapsed_ms: 60_000, injured: true }, "p1"),
      ev("injury", { quarter: 1, elapsed_ms: 180_000, injured: false }, "p1"),
    ];
    const result = unbrokenPeriodLiveStatus(events, 1, 240_000);
    expect(result.p1.inProgressPeriods).toEqual([1]);
    expect(result.p1.provisionallyCompliant).toBe(true);
  });

  it("closed injury past carve-out is already broken in live view", () => {
    reset();
    const events = [
      lineupSet(["p1"], []),
      qStart(1),
      ev("injury", { quarter: 1, elapsed_ms: 60_000, injured: true }, "p1"),
      ev("injury", { quarter: 1, elapsed_ms: 260_000, injured: false }, "p1"),
    ];
    const result = unbrokenPeriodLiveStatus(events, 1, 300_000);
    expect(result.p1.inProgressPeriods).toEqual([]);
  });
});

describe("unbrokenPeriodLiveStatus — provisional credit", () => {
  it("a player currently on field for the in-progress period earns provisional credit", () => {
    reset();
    const events = [
      lineupSet(["p1", "p2"], []),
      qStart(1),
      // No qEnd yet — period is in progress
    ];
    const result = unbrokenPeriodLiveStatus(events, 1);
    expect(result.p1.unbrokenPeriods).toEqual([]); // none closed
    expect(result.p1.inProgressPeriods).toEqual([1]);
    expect(result.p1.compliant).toBe(false); // not yet locked in
    expect(result.p1.provisionallyCompliant).toBe(true); // on track
  });

  it("a subbed-off player loses BOTH closed and in-progress credit for that period", () => {
    reset();
    const events = [
      lineupSet(["p1", "p2"], ["p3"]),
      qStart(1),
      swap("p1", "p3", 1),
      // p1 is off, no qEnd yet
    ];
    const result = unbrokenPeriodLiveStatus(events, 1);
    expect(result.p1.inProgressPeriods).toEqual([]);
    expect(result.p1.provisionallyCompliant).toBe(false);
  });

  it("closed periods count toward provisional + final compliance separately", () => {
    reset();
    const events = [
      lineupSet(["p1"], []),
      qStart(1),
      qEnd(1),
      qStart(2),
      // p1 on field for both Q1 (closed) and Q2 (in-progress)
    ];
    const result = unbrokenPeriodLiveStatus(events, 2);
    expect(result.p1.unbrokenPeriods).toEqual([1]);
    expect(result.p1.inProgressPeriods).toEqual([2]);
    expect(result.p1.compliant).toBe(false); // only 1 closed; needs 2
    expect(result.p1.provisionallyCompliant).toBe(true); // 1 + 1 in-progress = 2
  });
});
