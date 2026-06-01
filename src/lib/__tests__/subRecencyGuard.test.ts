// SUB-01 / B4 — cross-sport sub-recency guard (plan 10-02).
//
// The bug: each suggester ranks who-to-pull purely on cumulative game
// time (AFL/netball) or a per-quarter stint that RESETS at the period
// boundary (league). So a player subbed ON late in one period is
// wrongly suggested OFF again early in the NEXT — the suggester has no
// notion of RECENCY (time since the player most recently came on).
//
// The fix derives a per-player `lastSubbedOnMs` (absolute game-elapsed
// ms of their most recent bench->field transition, persisting across
// period boundaries) and uses it as a SOFT guard: a field player who
// came on within the last rotation window is NOT the first pulled while
// a longer-serving teammate is available. The guard is soft — when
// everyone eligible is "recent", a suggestion is still produced.
//
// These tests are RED-FIRST: against the pre-fix suggesters they fail
// (the recent player is pulled / the cross-period stint is lost). The
// implementation in Tasks 2-3 turns them green.

import { describe, expect, it } from "vitest";
import { suggestSwaps } from "@/lib/fairness";
import type { Lineup, Zone } from "@/lib/types";
import { suggestLeagueSubs } from "@/lib/sports/rugby_league/fairness";
import { suggestNetballLineup } from "@/lib/sports/netball/fairness";
import type { GameEvent, GameEventType } from "@/lib/types";

// ─── AFL ───────────────────────────────────────────────────────
// suggestSwaps ranks off-candidates by cumulative game minutes
// (most-played first). A player who came back on 20s ago but happens
// to carry the most total minutes is the FIRST one it pulls — the B4
// churn. With the recency guard, the longer-serving (non-recent) field
// player is preferred even though it has fewer cumulative minutes.

function emptyLineup(): Lineup {
  return { back: [], hback: [], mid: [], hfwd: [], fwd: [], bench: [] };
}

describe("subRecencyGuard — AFL (suggestSwaps)", () => {
  const ELAPSED = 600_000; // 10 min into the quarter (absolute frame)
  const MIN_STINT = 240_000; // one 4-min rotation window

  it("does not pull a just-subbed-on player while a longer-serving one is available", () => {
    const lineup = emptyLineup();
    // Two field players in the mid zone, plus a fresh bench player.
    lineup.mid = ["P_recent", "P_long"];
    lineup.bench = ["B"];

    // P_recent carries the MOST cumulative minutes (so the legacy
    // most-played-first sort pulls it) BUT only came on 20s ago.
    // P_long has fewer cumulative minutes and has been on all game.
    const currentGameMs: Record<string, number> = {
      P_recent: 30 * 60_000, // 30 min total
      P_long: 24 * 60_000, // 24 min total
      B: 0,
    };
    const lastSubbedOnMs: Record<string, number> = {
      P_recent: 580_000, // came on 20s ago → recent
      P_long: 0, // on since the start → not recent
    };

    const swaps = suggestSwaps(
      lineup,
      currentGameMs,
      0, // tieBreak
      [], // injured
      ["mid"] as Zone[], // activeZoneList
      [], // locked
      {}, // currentGameZoneMs
      {}, // zoneLockedPlayers
      lastSubbedOnMs,
      ELAPSED,
      MIN_STINT,
    );

    expect(swaps.length).toBeGreaterThan(0);
    // POST-FIX: the longer-serving non-recent player is pulled, NOT the
    // just-arrived one. (Pre-fix the most-played-first sort pulls P_recent.)
    expect(swaps[0].off_player_id).toBe("P_long");
  });

  it("soft guard: still returns a suggestion when every field player is recent", () => {
    const lineup = emptyLineup();
    lineup.mid = ["P_recent", "P_alsoRecent"];
    lineup.bench = ["B"];

    const currentGameMs: Record<string, number> = {
      P_recent: 30 * 60_000,
      P_alsoRecent: 24 * 60_000,
      B: 0,
    };
    // Both came on within the rotation window → both "recent".
    const lastSubbedOnMs: Record<string, number> = {
      P_recent: 580_000,
      P_alsoRecent: 590_000,
    };

    const swaps = suggestSwaps(
      lineup,
      currentGameMs,
      0,
      [],
      ["mid"] as Zone[],
      [],
      {},
      {},
      lastSubbedOnMs,
      ELAPSED,
      MIN_STINT,
    );

    // No deadlock: a suggestion is still produced.
    expect(swaps.length).toBeGreaterThan(0);
  });
});

// ─── Rugby League ──────────────────────────────────────────────
// suggestLeagueSubs reconstructs per-player stints from events but
// RESETS startedAt to 0 at every quarter_start, so a player subbed on
// late in Q3 looks identical to one on field since Q1 once Q4 begins.
// The recent player then gets pulled early in Q4. The fix tracks the
// stint across the period boundary so the longest continuous-stint
// player is pulled first.

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

describe("subRecencyGuard — Rugby League (suggestLeagueSubs)", () => {
  it("does not pull a player subbed on late in Q3 early in Q4 while a since-Q1 player is on", () => {
    _ts = 0;
    const QUARTER_MS = 480_000;
    const events: GameEvent[] = [
      // P_long + P_filler + b1 + b2 start; P_recent benched.
      ev("lineup_set", {
        lineup: {
          forwards: ["P_long", "P_filler"],
          backs: ["b1", "b2"],
          bench: ["P_recent"],
        },
      }),
      ev("quarter_start", { quarter: 1 }),
      ev("quarter_end", { quarter: 1, elapsed_ms: QUARTER_MS }),
      ev("quarter_start", { quarter: 2 }),
      ev("quarter_end", { quarter: 2, elapsed_ms: QUARTER_MS }),
      ev("quarter_start", { quarter: 3 }),
      // P_recent comes ON late in Q3 (P_filler off).
      ev("swap", {
        quarter: 3,
        elapsed_ms: 400_000,
        off_player_id: "P_filler",
        on_player_id: "P_recent",
        zone: "forward",
      }),
      ev("quarter_end", { quarter: 3, elapsed_ms: QUARTER_MS }),
      ev("quarter_start", { quarter: 4 }),
    ];

    // Q4 lineup: P_recent + P_long forwards, b1/b2 backs, P_filler benched.
    const currentLineup = {
      forwards: ["P_recent", "P_long"],
      backs: ["b1", "b2"],
      bench: ["P_filler"],
    };

    const swaps = suggestLeagueSubs(
      events,
      4, // currentQuarter
      currentLineup,
      [], // excludeOffPlayers
      60_000, // 1 min into Q4 (per-quarter elapsed)
    );

    expect(swaps.length).toBeGreaterThan(0);
    // POST-FIX: P_long (on since Q1) is pulled, not P_recent (on since
    // late Q3). Pre-fix the Q4 stint reset makes them look equal and the
    // forward-order picks P_recent.
    expect(swaps[0].off.playerId).toBe("P_long");
    expect(swaps[0].off.playerId).not.toBe("P_recent");
  });
});

// ─── Netball ───────────────────────────────────────────────────
// Netball subs only at the break, and the who-plays sort is least-
// minutes-first (so the most-played benches). Recency is the TIEBREAK:
// when two players are TIED on game time, the one who only just came on
// at the previous break should stay on; the longer-serving teammate
// benches. Pre-fix the tie falls to the seeded shuffle (here it benches
// the recent player); the guard flips it.

const NB_POSITIONS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"];

describe("subRecencyGuard — Netball (suggestNetballLineup)", () => {
  it("breaks a game-time tie by benching the longer-serving player, not the just-arrived one", () => {
    // 8 players, 7 court slots → exactly one benches. P_recent and
    // P_other are TIED on the most game-time; the other six have less
    // so they all play, leaving exactly one of the tied pair to bench.
    const playerIds = [
      "P_recent",
      "P_other",
      "n3",
      "n4",
      "n5",
      "n6",
      "n7",
      "n8",
    ];
    const thisGameTotalMs: Record<string, number> = {
      P_recent: 1_200_000,
      P_other: 1_200_000,
      n3: 600_000,
      n4: 600_000,
      n5: 600_000,
      n6: 600_000,
      n7: 600_000,
      n8: 600_000,
    };

    const lineup = suggestNetballLineup({
      playerIds,
      positions: NB_POSITIONS,
      season: {},
      thisGame: {},
      isAllowed: () => true,
      seed: 0,
      thisGameTotalMs,
      // P_recent came on at the previous break → recent at this break.
      lastSubbedOnMs: { P_recent: 1_200_000, P_other: 0 },
      elapsedMs: 1_800_000,
      minStintMs: 600_000,
    });

    // POST-FIX: P_recent (just came on) must NOT be the benched player;
    // the longer-serving P_other benches instead.
    expect(lineup.bench).not.toContain("P_recent");
    expect(lineup.bench).toContain("P_other");
  });
});
