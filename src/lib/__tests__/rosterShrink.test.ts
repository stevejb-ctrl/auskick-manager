// End-to-end coverage for the `roster_shrink` event flow.
//
// Three layers tested:
//
//   1. `applyRosterShrink` store action — the in-memory mutation
//      driven imperatively after the server action lands. Must
//      mirror the replay path so the field UI matches the
//      eventual-consistent server state.
//
//   2. `gameZoneMinutes` replay — per-player zone-minutes
//      aggregation. A removed player's open stint should close at
//      the event's elapsed_ms (not the next quarter_end), so their
//      played-minutes total reflects time on field BEFORE the
//      shrink, with no extra minutes attributed to a zone they're
//      no longer in.
//
//   3. `replayGame` full-state replay — the lineup mutation
//      (zone array shrinks, bench grows) PLUS the per-zone
//      stint-close accounting (basePlayedZoneMs). This is the
//      path used when the live store cold-mounts and re-hydrates
//      from event history.
//
// Fixture shape: a 5-5-5 zones3 (U13+) lineup with a couple of
// players already mid-stint; shrink to 4-5-4 by removing the
// first fwd and the first back player ~30s into Q1.

import { describe, expect, it, beforeEach } from "vitest";
import { gameZoneMinutes, replayGame } from "@/lib/fairness";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import type { GameEvent, Lineup } from "@/lib/types";

// ─── shared fixture helpers ─────────────────────────────────

const Q1_START_MS = 0;
const SHRINK_AT_MS = 30_000; // 30s into Q1

function freshLineup(): Lineup {
  return {
    back: ["bA", "bB", "bC", "bD", "bE"],
    hback: [],
    mid: ["mA", "mB", "mC", "mD", "mE"],
    hfwd: [],
    fwd: ["fA", "fB", "fC", "fD", "fE"],
    bench: ["x1", "x2"],
  };
}

let evCounter = 0;
function ev(
  type: GameEvent["type"],
  metadata: Record<string, unknown> = {},
  playerId: string | null = null,
): GameEvent {
  evCounter++;
  // Spread events 1ms apart so localCompare-based sort is stable.
  const t = new Date(2026, 0, 1, 12, 0, 0, evCounter).toISOString();
  return {
    id: `e${evCounter}`,
    game_id: "g1",
    type,
    player_id: playerId,
    metadata,
    created_at: t,
    created_by: "u1",
  } as GameEvent;
}

function buildShrinkEventStream(removePlayerIds: string[]): GameEvent[] {
  evCounter = 0;
  return [
    ev("lineup_set", { lineup: freshLineup() }),
    ev("quarter_start", { quarter: 1, elapsed_ms: Q1_START_MS }),
    ev("roster_shrink", {
      remove_player_ids: removePlayerIds,
      new_size: 15 - removePlayerIds.length,
      quarter: 1,
      elapsed_ms: SHRINK_AT_MS,
    }),
    ev("quarter_end", { quarter: 1, elapsed_ms: 12 * 60 * 1000 }),
  ];
}

// ─── 1. Store action — applyRosterShrink ────────────────────

describe("applyRosterShrink (store)", () => {
  beforeEach(() => {
    // Reset the live store: 5-5-5 lineup, 30s into Q1, with
    // stintStart open for every on-field player at Q1 start.
    const lineup = freshLineup();
    const stintStartMs: Record<string, number> = {};
    const stintZone: Record<string, "back" | "mid" | "fwd"> = {};
    for (const z of ["back", "mid", "fwd"] as const) {
      for (const pid of lineup[z]) {
        stintStartMs[pid] = 0;
        stintZone[pid] = z;
      }
    }
    useLiveGame.setState({
      lineup,
      currentQuarter: 1,
      clockStartedAt: null,
      accumulatedMs: SHRINK_AT_MS,
      basePlayedZoneMs: {},
      stintStartMs,
      stintZone,
      injuredIds: [],
      loanedIds: [],
      swapCount: 0,
      selected: null,
    });
  });

  it("removes each player from their zone and pushes them onto bench", () => {
    useLiveGame.getState().applyRosterShrink(["fA", "bA"]);
    const s = useLiveGame.getState();

    expect(s.lineup.fwd).not.toContain("fA");
    expect(s.lineup.back).not.toContain("bA");
    expect(s.lineup.bench).toContain("fA");
    expect(s.lineup.bench).toContain("bA");
    // Other players in those zones stay put.
    expect(s.lineup.fwd).toEqual(["fB", "fC", "fD", "fE"]);
    expect(s.lineup.back).toEqual(["bB", "bC", "bD", "bE"]);
  });

  it("accumulates each removed player's open stint into basePlayedZoneMs", () => {
    useLiveGame.getState().applyRosterShrink(["fA", "bA"]);
    const s = useLiveGame.getState();

    // 30s on field for each in their respective zones.
    expect(s.basePlayedZoneMs.fA?.fwd).toBe(SHRINK_AT_MS);
    expect(s.basePlayedZoneMs.bA?.back).toBe(SHRINK_AT_MS);
  });

  it("clears stintStartMs and stintZone for removed players", () => {
    useLiveGame.getState().applyRosterShrink(["fA", "bA"]);
    const s = useLiveGame.getState();

    expect(s.stintStartMs.fA).toBeUndefined();
    expect(s.stintZone.fA).toBeUndefined();
    expect(s.stintStartMs.bA).toBeUndefined();
    expect(s.stintZone.bA).toBeUndefined();
    // Other on-field players keep their stint markers.
    expect(s.stintStartMs.mA).toBe(0);
    expect(s.stintZone.mA).toBe("mid");
  });

  it("is a no-op for ids already on bench (no double-bench, no error)", () => {
    useLiveGame.getState().applyRosterShrink(["x1"]);
    const s = useLiveGame.getState();

    // x1 was already on bench — should still appear exactly once.
    const benchOccurrences = s.lineup.bench.filter((id) => id === "x1").length;
    expect(benchOccurrences).toBe(1);
    // No stale played-minutes attribution.
    expect(s.basePlayedZoneMs.x1).toBeUndefined();
  });

  it("handles multiple removals across the same zone", () => {
    useLiveGame.getState().applyRosterShrink(["fA", "fB", "fC"]);
    const s = useLiveGame.getState();

    expect(s.lineup.fwd).toEqual(["fD", "fE"]);
    expect(s.lineup.bench).toEqual(
      expect.arrayContaining(["fA", "fB", "fC"]),
    );
  });
});

// ─── 2. Replay aggregation — gameZoneMinutes ────────────────

describe("gameZoneMinutes — roster_shrink", () => {
  it("attributes pre-shrink minutes to the player's zone and stops there", () => {
    const events = buildShrinkEventStream(["fA"]);
    const minutes = gameZoneMinutes(events);

    // fA played from 0ms → 30000ms in fwd = 0.5 minutes.
    expect(minutes.fA?.fwd).toBeCloseTo(0.5, 5);
    // No minutes attributed to other zones.
    expect(minutes.fA?.mid ?? 0).toBe(0);
    expect(minutes.fA?.back ?? 0).toBe(0);
  });

  it("the rest of the squad keeps accumulating to quarter_end", () => {
    const events = buildShrinkEventStream(["fA"]);
    const minutes = gameZoneMinutes(events);

    // mA was on field the whole quarter (0 → 12 min) in mid.
    expect(minutes.mA?.mid).toBeCloseTo(12, 5);
    // fB stayed in fwd the whole quarter — same.
    expect(minutes.fB?.fwd).toBeCloseTo(12, 5);
  });

  it("ignores ids in remove_player_ids that aren't on the field", () => {
    // x1 is on the bench, not the field. Including them in
    // remove_player_ids should silently no-op rather than corrupt
    // the lineup or throw.
    const events = buildShrinkEventStream(["x1", "fA"]);
    const minutes = gameZoneMinutes(events);

    // fA still gets the 30s pre-shrink stint.
    expect(minutes.fA?.fwd).toBeCloseTo(0.5, 5);
    // x1 was on bench so no zone minutes attributed.
    expect(minutes.x1?.fwd ?? 0).toBe(0);
    expect(minutes.x1?.mid ?? 0).toBe(0);
    expect(minutes.x1?.back ?? 0).toBe(0);
  });
});

// ─── 3. replayGame full-state ───────────────────────────────

describe("replayGame — roster_shrink", () => {
  it("mutates the lineup: removed players move from their zone to bench", () => {
    const events = buildShrinkEventStream(["fA", "bA"]);
    const state = replayGame(events);

    expect(state.lineup.fwd).not.toContain("fA");
    expect(state.lineup.back).not.toContain("bA");
    expect(state.lineup.bench).toContain("fA");
    expect(state.lineup.bench).toContain("bA");
  });

  it("closes open stints at the shrink's elapsed_ms (basePlayedZoneMs reflects it)", () => {
    const events = buildShrinkEventStream(["fA"]);
    const state = replayGame(events);

    // fA's pre-shrink stint should land in basePlayedZoneMs at
    // 30000ms in fwd. The replay's basePlayedZoneMs holds raw ms.
    expect(state.basePlayedZoneMs.fA?.fwd).toBe(SHRINK_AT_MS);
  });

  it("preserves stint state for non-shrunk on-field players", () => {
    const events = buildShrinkEventStream(["fA"]);
    const state = replayGame(events);

    // Other players still have open stints — basePlayedZoneMs
    // entries only get committed at quarter_end (which IS in this
    // event stream), so they should reflect the full quarter
    // (12 min = 720000ms) in their respective zones.
    expect(state.basePlayedZoneMs.mA?.mid).toBe(12 * 60 * 1000);
    expect(state.basePlayedZoneMs.fB?.fwd).toBe(12 * 60 * 1000);
    expect(state.basePlayedZoneMs.bB?.back).toBe(12 * 60 * 1000);
  });

  it("handles a shrink that removes multiple players from one zone in a single event", () => {
    const events = buildShrinkEventStream(["fA", "fB", "fC"]);
    const state = replayGame(events);

    expect(state.lineup.fwd).toEqual(["fD", "fE"]);
    expect(state.lineup.bench).toEqual(
      expect.arrayContaining(["fA", "fB", "fC"]),
    );
    // Each player gets their pre-shrink minutes attributed.
    expect(state.basePlayedZoneMs.fA?.fwd).toBe(SHRINK_AT_MS);
    expect(state.basePlayedZoneMs.fB?.fwd).toBe(SHRINK_AT_MS);
    expect(state.basePlayedZoneMs.fC?.fwd).toBe(SHRINK_AT_MS);
  });

  it("integrates with a downstream swap event: the bench grows by one and is available for swap-in", () => {
    // Real-world scenario: coach shrinks the roster at 30s,
    // then later in the same quarter does a regular swap.
    // The shrunk player should now be on bench AND swappable.
    evCounter = 0;
    const events: GameEvent[] = [
      ev("lineup_set", { lineup: freshLineup() }),
      ev("quarter_start", { quarter: 1, elapsed_ms: 0 }),
      ev("roster_shrink", {
        remove_player_ids: ["fA"],
        new_size: 14,
        quarter: 1,
        elapsed_ms: SHRINK_AT_MS,
      }),
      // 60s later, coach swaps mB out for fA (the shrunk player
      // coming back on as a bench → mid sub).
      ev(
        "swap",
        {
          off_player_id: "mB",
          on_player_id: "fA",
          zone: "mid",
          quarter: 1,
          elapsed_ms: SHRINK_AT_MS + 60_000,
        },
        "fA",
      ),
      ev("quarter_end", { quarter: 1, elapsed_ms: 12 * 60 * 1000 }),
    ];
    const state = replayGame(events);

    // fA is back on mid, mB is on the bench.
    expect(state.lineup.mid).toContain("fA");
    expect(state.lineup.bench).toContain("mB");
    expect(state.lineup.fwd).not.toContain("fA");
    // fA's stint history: 30s in fwd before the shrink, plus the
    // rest of the quarter in mid after the swap-on.
    expect(state.basePlayedZoneMs.fA?.fwd).toBe(SHRINK_AT_MS);
    // After-swap mid stint = 12min total - 90s pre-swap-on bench time
    // = 720000 - 90000 = 630000ms.
    expect(state.basePlayedZoneMs.fA?.mid).toBe(
      12 * 60 * 1000 - (SHRINK_AT_MS + 60_000),
    );
  });
});
