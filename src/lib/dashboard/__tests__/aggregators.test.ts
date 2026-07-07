import { describe, expect, it } from "vitest";
import { replayGame } from "../eventReplay";
import {
  computeWinningCombinations,
  computePlayerChemistry,
  computePlayerStats,
  computeAttendance,
} from "../aggregators";
import type { Game, GameAvailability, GameEvent, Player } from "@/lib/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

let _seq = 0;

function makeEvent(
  overrides: Partial<GameEvent> & { type: GameEvent["type"] }
): GameEvent {
  // Increment by 1 ms each time so sort by created_at preserves insertion order.
  const t = new Date(1_700_000_000_000 + _seq++).toISOString();
  return {
    id: Math.random().toString(36).slice(2),
    game_id: "g1",
    player_id: null,
    metadata: {},
    created_by: null,
    created_at: t,
    ...overrides,
  };
}

// Returns a minimal set of events for a single quarter with two forward players
// who swap out, and goals scored at specific times.
function buildSingleQtrEvents(): GameEvent[] {
  return [
    // Initial lineup: fwd = [p1, p2], mid = [p3, p4], back = [p5, p6], bench = []
    makeEvent({
      type: "lineup_set",
      metadata: {
        lineup: {
          back: ["p5", "p6"],
          hback: [],
          mid: ["p3", "p4"],
          hfwd: [],
          fwd: ["p1", "p2"],
          bench: ["p7"],
        },
      },
    }),
    makeEvent({ type: "quarter_start", metadata: { quarter: 1 } }),
    // Team goal at 60 000 ms (Q1) — p1+p2 are on together
    makeEvent({
      type: "goal",
      player_id: "p1",
      metadata: { quarter: 1, elapsed_ms: 60_000 },
    }),
    // Swap at 120 000 ms: p2 off, p7 on (fwd)
    makeEvent({
      type: "swap",
      metadata: {
        off_player_id: "p2",
        on_player_id: "p7",
        zone: "fwd",
        quarter: 1,
        elapsed_ms: 120_000,
      },
    }),
    // Opponent goal at 200 000 ms — p1+p7 are on
    makeEvent({
      type: "opponent_goal",
      metadata: { quarter: 1, elapsed_ms: 200_000 },
    }),
    // Quarter end at 720 000 ms
    makeEvent({ type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 720_000 } }),
  ];
}

// ─── Winning combinations ────────────────────────────────────────────────────

describe("computeWinningCombinations", () => {
  it("groups periods by zone+player combination", () => {
    const events = buildSingleQtrEvents();
    const snap = replayGame("g1", events);
    const combos = computeWinningCombinations([snap]);

    // fwd zone should produce 2 combos: [p1,p2] and [p1,p7]
    const fwdCombos = combos.filter((c) => c.zone === "fwd");
    expect(fwdCombos.length).toBe(2);

    const p1p2 = fwdCombos.find(
      (c) => c.playerIds.includes("p1") && c.playerIds.includes("p2")
    );
    const p1p7 = fwdCombos.find(
      (c) => c.playerIds.includes("p1") && c.playerIds.includes("p7")
    );

    expect(p1p2).toBeDefined();
    expect(p1p7).toBeDefined();
  });

  it("attributes team goal to the right period", () => {
    const events = buildSingleQtrEvents();
    const snap = replayGame("g1", events);
    const combos = computeWinningCombinations([snap]);

    // Goal at 60 000 ms falls in period [0, 120 000) → p1+p2 forward combo
    const p1p2 = combos.find(
      (c) =>
        c.zone === "fwd" &&
        c.playerIds.includes("p1") &&
        c.playerIds.includes("p2")
    );
    expect(p1p2?.goalsFor).toBe(1);
    expect(p1p2?.goalsAgainst).toBe(0);
  });

  it("attributes opponent goal to the right period", () => {
    const events = buildSingleQtrEvents();
    const snap = replayGame("g1", events);
    const combos = computeWinningCombinations([snap]);

    // Opponent goal at 200 000 ms falls in period [120 000, 720 000) → p1+p7 fwd combo
    const p1p7 = combos.find(
      (c) =>
        c.zone === "fwd" &&
        c.playerIds.includes("p1") &&
        c.playerIds.includes("p7")
    );
    expect(p1p7?.goalsFor).toBe(0);
    expect(p1p7?.goalsAgainst).toBe(1);
  });

  it("flags low-confidence combos under 20 min", () => {
    const events = buildSingleQtrEvents();
    const snap = replayGame("g1", events);
    const combos = computeWinningCombinations([snap]);

    // p1+p2 period is 120 000 ms = 2 min → low confidence
    const p1p2 = combos.find(
      (c) =>
        c.zone === "fwd" &&
        c.playerIds.includes("p1") &&
        c.playerIds.includes("p2")
    );
    expect(p1p2?.isLowConfidence).toBe(true);

    // p1+p7 period is 600 000 ms = 10 min → still low confidence (< 20 min)
    const p1p7 = combos.find(
      (c) =>
        c.zone === "fwd" &&
        c.playerIds.includes("p1") &&
        c.playerIds.includes("p7")
    );
    expect(p1p7?.isLowConfidence).toBe(true);
  });

  it("ranks by net differential descending", () => {
    const events = buildSingleQtrEvents();
    const snap = replayGame("g1", events);
    const combos = computeWinningCombinations([snap]);

    // p1p2 has +1 net, p1p7 has -1 net → p1p2 should rank higher
    const fwdCombos = combos.filter((c) => c.zone === "fwd");
    expect(fwdCombos[0].netDiff).toBeGreaterThanOrEqual(fwdCombos[fwdCombos.length - 1].netDiff);
  });

  it("accumulates across multiple games", () => {
    const events = buildSingleQtrEvents();
    const snap1 = replayGame("g1", events);
    const snap2 = replayGame("g2", events.map((e) => ({ ...e, game_id: "g2" })));

    const combos = computeWinningCombinations([snap1, snap2]);
    const p1p2 = combos.find(
      (c) =>
        c.zone === "fwd" &&
        c.playerIds.includes("p1") &&
        c.playerIds.includes("p2")
    );

    // Should have doubled
    expect(p1p2?.durationMs).toBe(120_000 * 2);
    expect(p1p2?.goalsFor).toBe(2);
  });
});

// ─── Player chemistry ────────────────────────────────────────────────────────

describe("computePlayerChemistry", () => {
  it("returns at most 10 pairs", () => {
    const events = buildSingleQtrEvents();
    const snap = replayGame("g1", events);
    const pairs = computePlayerChemistry([snap]);
    expect(pairs.length).toBeLessThanOrEqual(10);
  });

  it("computes net diff correctly", () => {
    const events = buildSingleQtrEvents();
    const snap = replayGame("g1", events);
    const pairs = computePlayerChemistry([snap]);

    // p1 is on field the whole quarter and teams up with p3, p4, p5, p6 throughout
    // The team scored 1 goal total and conceded 1 goal total
    // Every pair that spans both periods gets both events
    // Pair (p1, p5): p5 never swaps so is on entire quarter
    // Period 1 [0–120k]: p1, p2, p3, p4, p5, p6 all on → team goal → pairs get +1
    // Period 2 [120k–720k]: p1, p7, p3, p4, p5, p6 on → opp goal → pairs get −1
    // Pair (p1, p5): both periods, so goalsFor=1, goalsAgainst=1, net=0
    const p1p5 = pairs.find(
      (p) =>
        (p.playerAId === "p1" && p.playerBId === "p5") ||
        (p.playerAId === "p5" && p.playerBId === "p1")
    );
    expect(p1p5).toBeDefined();
    expect(p1p5!.goalsFor).toBe(1);
    expect(p1p5!.goalsAgainst).toBe(1);
    expect(p1p5!.netDiff).toBe(0);
  });

  it("does not include bench players in pairs", () => {
    // p7 starts on bench; should only appear in pairs from period 2 onwards
    const events = buildSingleQtrEvents();
    const snap = replayGame("g1", events);
    const pairs = computePlayerChemistry([snap]);

    // p2 and p7 should NOT share a period (p2 off when p7 comes on)
    const p2p7 = pairs.find(
      (p) =>
        (p.playerAId === "p2" && p.playerBId === "p7") ||
        (p.playerAId === "p7" && p.playerBId === "p2")
    );
    expect(p2p7).toBeUndefined();
  });

  it("sorts by netDiff descending", () => {
    const events = buildSingleQtrEvents();
    const snap = replayGame("g1", events);
    const pairs = computePlayerChemistry([snap]);

    for (let i = 0; i < pairs.length - 1; i++) {
      expect(pairs[i].netDiff).toBeGreaterThanOrEqual(pairs[i + 1].netDiff);
    }
  });

  it("accumulates duration across games", () => {
    const events = buildSingleQtrEvents();
    const snap1 = replayGame("g1", events);
    const snap2 = replayGame("g2", events.map((e) => ({ ...e, game_id: "g2" })));
    const pairs = computePlayerChemistry([snap1, snap2]);

    // p1 and p2 are together in period 1 (0–120k ms) of each game → 240 000 ms total.
    // This pair has net=+2 so is definitely in top 10.
    const p1p2 = pairs.find(
      (p) =>
        (p.playerAId === "p1" && p.playerBId === "p2") ||
        (p.playerAId === "p2" && p.playerBId === "p1")
    );
    expect(p1p2?.durationMs).toBe(120_000 * 2);
    expect(p1p2?.goalsFor).toBe(2);
    expect(p1p2?.goalsAgainst).toBe(0);
  });
});

// ─── Event replay — zone minute tracking ────────────────────────────────────

describe("replayGame — zone minutes", () => {
  it("accumulates zone ms for a player who never swaps", () => {
    const events = buildSingleQtrEvents();
    const snap = replayGame("g1", events);

    // p5 is in 'back' zone for the full 720 000 ms quarter
    expect(snap.playerZoneMs["p5"]?.back).toBe(720_000);
  });

  it("splits zone ms correctly for a player who is subbed out", () => {
    const events = buildSingleQtrEvents();
    const snap = replayGame("g1", events);

    // p2 is subbed out at 120 000 ms → 120 000 ms in fwd
    expect(snap.playerZoneMs["p2"]?.fwd).toBe(120_000);
  });

  it("starts zone ms from swap time for incoming player", () => {
    const events = buildSingleQtrEvents();
    const snap = replayGame("g1", events);

    // p7 comes on at 120 000 ms, quarter ends at 720 000 ms → 600 000 ms in fwd
    expect(snap.playerZoneMs["p7"]?.fwd).toBe(600_000);
  });

  it("records sub counts", () => {
    const events = buildSingleQtrEvents();
    const snap = replayGame("g1", events);

    expect(snap.subsOut["p2"]).toBe(1);
    expect(snap.subsIn["p7"]).toBe(1);
  });

  it("records player goals", () => {
    const events = buildSingleQtrEvents();
    const snap = replayGame("g1", events);

    expect(snap.playerGoals["p1"]).toBe(1);
    expect(snap.teamScoreByQtr[1]?.goals).toBe(1);
    expect(snap.oppScoreByQtr[1]?.goals).toBe(1);
  });
});

// ─── score_undo replay ───────────────────────────────────────────────────────

describe("score_undo replay", () => {
  it("undoes a team goal — decrements playerGoals and teamScoreByQtr", () => {
    const events = [
      ...buildSingleQtrEvents(),
      makeEvent({
        type: "score_undo",
        player_id: "p1",
        metadata: { original_type: "goal", quarter: 1 },
      }),
    ];
    const snap = replayGame("g1", events);
    expect(snap.playerGoals["p1"]).toBe(0);
    expect(snap.teamScoreByQtr[1]?.goals).toBe(0);
  });

  it("undoes an opponent goal — decrements oppScoreByQtr", () => {
    const events = [
      ...buildSingleQtrEvents(),
      makeEvent({
        type: "score_undo",
        player_id: null,
        metadata: { original_type: "opponent_goal", quarter: 1 },
      }),
    ];
    const snap = replayGame("g1", events);
    expect(snap.oppScoreByQtr[1]?.goals).toBe(0);
  });

  it("does not go below zero", () => {
    const events = [
      ...buildSingleQtrEvents(),
      makeEvent({
        type: "score_undo",
        player_id: "p1",
        metadata: { original_type: "goal", quarter: 1 },
      }),
      // A second undo of the same type — should not go negative
      makeEvent({
        type: "score_undo",
        player_id: "p1",
        metadata: { original_type: "goal", quarter: 1 },
      }),
    ];
    const snap = replayGame("g1", events);
    expect(snap.playerGoals["p1"]).toBe(0);
    expect(snap.teamScoreByQtr[1]?.goals).toBe(0);
  });
});

// ─── Null jersey number ──────────────────────────────────────────────────────

function makePlayer(id: string, jerseyNumber: number | null): Player {
  return {
    id,
    team_id: "t1",
    full_name: `Player ${id}`,
    jersey_number: jerseyNumber,
    is_active: true,
    created_by: "u1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function makeGame(id: string): Game {
  return {
    id,
    team_id: "t1",
    opponent: "Opponent",
    scheduled_at: "2025-01-01T09:00:00Z",
    location: null,
    round_number: 1,
    notes: null,
    status: "completed",
    sub_interval_seconds: 300,
    subs_per_quarter: 3,
    share_token: id,
    on_field_size: 12,
    quarter_length_seconds: null,
    clock_multiplier: 1,
    external_source: null,
    external_id: null,
    created_by: "u1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe("computePlayerStats — null jersey", () => {
  it("propagates null jerseyNumber when player has no jersey set", () => {
    const player = makePlayer("p1", null);
    const events = buildSingleQtrEvents();
    const snap = replayGame("g1", events);
    const stats = computePlayerStats([player], [snap], [makeGame("g1")]);
    const p1stat = stats.find((s) => s.playerId === "p1");
    expect(p1stat?.jerseyNumber).toBeNull();
  });

  it("preserves the jersey number when set", () => {
    const player = makePlayer("p1", 7);
    const events = buildSingleQtrEvents();
    const snap = replayGame("g1", events);
    const stats = computePlayerStats([player], [snap], [makeGame("g1")]);
    const p1stat = stats.find((s) => s.playerId === "p1");
    expect(p1stat?.jerseyNumber).toBe(7);
  });
});

describe("computePlayerStats — % of available time (Steve 2026-07-07)", () => {
  // buildSingleQtrEvents is one 12-min (720_000 ms) quarter:
  //   p1 — fwd the whole quarter                → 720_000 ms on field
  //   p2 — fwd, subbed off at 120_000           → 120_000 ms
  //   p7 — starts on the bench, on at 120_000   → 600_000 ms
  // All three are PRESENT (in the lineup_set), so their available time is
  // the full 720_000 game length. The metric must be on-field / available,
  // NOT the old share-of-whole-team-time (which put p1 at ~17%).
  const players = [
    makePlayer("p1", 1),
    makePlayer("p2", 2),
    makePlayer("p7", 7),
  ];
  const snap = replayGame("g1", buildSingleQtrEvents());
  const stats = computePlayerStats(players, [snap], [makeGame("g1")]);
  const pctOf = (id: string) =>
    stats.find((s) => s.playerId === id)?.teamGameTimePct;

  it("gives a never-benched, ever-present player 100%", () => {
    expect(pctOf("p1")).toBe(100);
  });

  it("scales with bench time — a half-benched player is well under 100%", () => {
    expect(pctOf("p2")).toBe(17); // 120_000 / 720_000
    expect(pctOf("p7")).toBe(83); // 600_000 / 720_000
  });

  it("captures the full game length as the denominator", () => {
    expect(snap.gameLengthMs).toBe(720_000);
  });
});

describe("computeAttendance — null jersey", () => {
  it("propagates null jerseyNumber when player has no jersey set", () => {
    const player = makePlayer("p1", null);
    const game = makeGame("g1");
    const availability: GameAvailability[] = [
      { id: "a1", game_id: "g1", player_id: "p1", status: "available", updated_by: null, updated_at: new Date().toISOString() },
    ];
    const snap = replayGame("g1", buildSingleQtrEvents());
    const rows = computeAttendance([player], [game], availability, [snap]);
    const row = rows.find((r) => r.playerId === "p1");
    expect(row?.jerseyNumber).toBeNull();
  });
});

describe("computeAttendance — attendance = games actually played (Steve 2026-07-07)", () => {
  // Attendance must reflect who actually took part, NOT the coach's
  // availability toggle. p1/p2/p3/p5/p6/p7 appear in the single-quarter
  // fixture's lineup; a marked-available-but-absent player is 0%.
  const game = makeGame("g1");
  const snap = replayGame("g1", buildSingleQtrEvents());
  const players = [makePlayer("p1", 1), makePlayer("ghost", 99)];
  // "ghost" is marked available but never appears in a lineup.
  const availability: GameAvailability[] = [
    { id: "a1", game_id: "g1", player_id: "ghost", status: "available", updated_by: null, updated_at: new Date().toISOString() },
  ];
  const rows = computeAttendance(players, [game], availability, [snap]);
  const rowOf = (id: string) => rows.find((r) => r.playerId === id);

  it("counts a player who appeared in the lineup as attended (100% of 1 game)", () => {
    expect(rowOf("p1")?.gamesPlayed).toBe(1);
    expect(rowOf("p1")?.attendancePct).toBe(100);
  });

  it("gives a marked-available-but-absent player 0% attendance", () => {
    expect(rowOf("ghost")?.gamesAvailable).toBe(1); // toggle says available
    expect(rowOf("ghost")?.gamesPlayed).toBe(0); // but never played
    expect(rowOf("ghost")?.attendancePct).toBe(0);
  });
});

describe("replayGame — clamps a runaway clock (Steve 2026-07-07)", () => {
  // A quarter left running past the hooter lands a quarter_end with
  // elapsed_ms far beyond the scheduled length. Without a bound, a
  // whole-game player banks the overrun; with maxQuarterMs it can't.
  function runawayQuarterEvents(): GameEvent[] {
    _seq = 0;
    return [
      makeEvent({
        type: "lineup_set",
        metadata: {
          lineup: { back: ["p5", "p6"], hback: [], mid: ["p3", "p4"], hfwd: [], fwd: ["p1", "p2"], bench: [] },
        },
      }),
      makeEvent({ type: "quarter_start", metadata: { quarter: 1 } }),
      // Clock ran to 40 min before anyone ended the quarter.
      makeEvent({ type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 40 * 60_000 } }),
    ];
  }

  it("banks the full 40 min without a bound", () => {
    const snap = replayGame("g1", runawayQuarterEvents());
    expect(snap.gameLengthMs).toBe(40 * 60_000);
    expect(snap.playerZoneMs["p1"].fwd).toBe(40 * 60_000);
  });

  it("clamps to the 12-min quarter length when maxQuarterMs is set", () => {
    const snap = replayGame("g1", runawayQuarterEvents(), 12 * 60_000);
    expect(snap.gameLengthMs).toBe(12 * 60_000);
    expect(snap.playerZoneMs["p1"].fwd).toBe(12 * 60_000);
  });
});

describe("late arrival — counted + fairly credited (Steve 2026-07-07)", () => {
  // 2-quarter game. p1..p6 start; "latey" turns up at the Q2 break
  // (player_arrived) and is subbed on for p2 for the whole of Q2.
  function lateArrivalEvents(): GameEvent[] {
    _seq = 0;
    return [
      makeEvent({
        type: "lineup_set",
        metadata: {
          lineup: { back: ["p5", "p6"], hback: [], mid: ["p3", "p4"], hfwd: [], fwd: ["p1", "p2"], bench: [] },
        },
      }),
      makeEvent({ type: "quarter_start", metadata: { quarter: 1 } }),
      makeEvent({ type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 720_000 } }),
      // Late arrival shows up for the second half.
      makeEvent({ type: "player_arrived", player_id: "latey", metadata: { quarter: 2, elapsed_ms: 0 } }),
      makeEvent({ type: "quarter_start", metadata: { quarter: 2 } }),
      makeEvent({ type: "swap", metadata: { off_player_id: "p2", on_player_id: "latey", zone: "fwd", quarter: 2, elapsed_ms: 0 } }),
      makeEvent({ type: "quarter_end", metadata: { quarter: 2, elapsed_ms: 720_000 } }),
    ];
  }

  const snap = replayGame("g1", lateArrivalEvents());

  it("charges the late arrival available time only from when they arrived", () => {
    // Full game is 24 min; latey was only there for the 12-min second half.
    expect(snap.gameLengthMs).toBe(1_440_000);
    expect(snap.playerAvailableMs["latey"]).toBe(720_000);
    expect(snap.playerAvailableMs["p1"]).toBe(1_440_000);
  });

  it("counts the late arrival as attended (played), not as an absentee", () => {
    const att = computeAttendance(
      [makePlayer("latey", 50)],
      [makeGame("g1")],
      [],
      [snap],
    );
    const row = att.find((r) => r.playerId === "latey");
    expect(row?.gamesPlayed).toBe(1);
    expect(row?.attendancePct).toBe(100);
  });

  it("gives the late arrival 100% of available time (not penalised for the half they missed)", () => {
    const stats = computePlayerStats(
      [makePlayer("latey", 50), makePlayer("p2", 2)],
      [snap],
      [makeGame("g1")],
    );
    const pct = (id: string) =>
      stats.find((s) => s.playerId === id)?.teamGameTimePct;
    // latey played all 12 min of their available (second-half) time → 100%.
    // With the old whole-game denominator they'd read 50%.
    expect(pct("latey")).toBe(100);
    // p2 played only the first half of a two-half game → 50%.
    expect(pct("p2")).toBe(50);
  });
});

describe("early departure / injury — unavailable time not counted (Steve 2026-07-07)", () => {
  // 2-quarter game. p1 plays the first half, then is marked injured at the
  // start of Q2 (hurt / went home) and never returns.
  function earlyDepartureEvents(): GameEvent[] {
    _seq = 0;
    return [
      makeEvent({
        type: "lineup_set",
        metadata: {
          lineup: { back: ["p5", "p6"], hback: [], mid: ["p3", "p4"], hfwd: [], fwd: ["p1", "p2"], bench: [] },
        },
      }),
      makeEvent({ type: "quarter_start", metadata: { quarter: 1 } }),
      makeEvent({ type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 720_000 } }),
      makeEvent({ type: "quarter_start", metadata: { quarter: 2 } }),
      // Hurt / gone home at the top of the second half — never un-marked.
      makeEvent({ type: "injury", player_id: "p1", metadata: { injured: true, quarter: 2, elapsed_ms: 0 } }),
      makeEvent({ type: "quarter_end", metadata: { quarter: 2, elapsed_ms: 720_000 } }),
    ];
  }

  const snap = replayGame("g1", earlyDepartureEvents());

  it("credits available time only up to when the player left", () => {
    expect(snap.gameLengthMs).toBe(1_440_000);
    // p1 was available for the first half only (the second-half injury
    // gap is subtracted); p2 stayed available the whole game.
    expect(snap.playerAvailableMs["p1"]).toBe(720_000);
    expect(snap.playerAvailableMs["p2"]).toBe(1_440_000);
  });

  it("gives the early-leaver 100% of available time, not a penalised fraction", () => {
    const stats = computePlayerStats(
      [makePlayer("p1", 1), makePlayer("p2", 2)],
      [snap],
      [makeGame("g1")],
    );
    const pct = (id: string) =>
      stats.find((s) => s.playerId === id)?.teamGameTimePct;
    // p1 played the whole first half then left → 100% of available.
    // Old whole-game denominator would have read 50%.
    expect(pct("p1")).toBe(100);
    // p2 stayed on the whole game → 100% (available all game, played it all).
    expect(pct("p2")).toBe(100);
  });
});
