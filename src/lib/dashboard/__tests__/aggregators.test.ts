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

describe("computeAttendance — null jersey", () => {
  it("propagates null jerseyNumber when player has no jersey set", () => {
    const player = makePlayer("p1", null);
    const game = makeGame("g1");
    const availability: GameAvailability[] = [
      { id: "a1", game_id: "g1", player_id: "p1", status: "available", updated_by: null, updated_at: new Date().toISOString() },
    ];
    const rows = computeAttendance([player], [game], availability);
    const row = rows.find((r) => r.playerId === "p1");
    expect(row?.jerseyNumber).toBeNull();
  });
});
