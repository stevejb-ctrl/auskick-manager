// PLAYERVIEW-01 / D-05 (plan 12-02, netball mirror) — RED-FIRST.
//
// The long-press per-period breakdown needs per-PLAYER, per-PERIOD,
// per-ZONE played ms for netball too. The whole-game per-third ms
// already lives in `playerThirdMs` (attack / centre / defence), but it
// is NOT split by period. This spec pins a new `playedZoneMsByPeriod`
// accessor on the netball fairness module that buckets the SAME
// credited ms by period AND by config zone id (the three thirds:
// `attack-third` / `centre-third` / `defence-third`).
//
// Locked invariant (mirrors the AFL spec): summing a player's
// per-period buckets over all periods MUST equal their existing
// whole-game `playerThirdMs` output (mapping each third to its config
// zone id). The new map is a finer-grained split of the same credited
// ms, not a second independent accumulator.
//
// RED until plan 12-02 Task 2 adds `playedZoneMsByPeriod` to the
// netball fairness module.

import { describe, expect, it } from "vitest";
import {
  playerThirdMs,
  playedZoneMsByPeriod,
  type ThirdLookup,
} from "@/lib/sports/netball/fairness";
import { primaryThirdFor } from "@/lib/sports/netball";
import { getAgeGroupConfig } from "@/lib/sports/registry";
import type { GameEvent } from "@/lib/types";

// Netball subs only at period breaks, so the per-third config zone id
// for each player is fixed within a quarter and changes via the break
// `period_break_swap` lineup. primaryThirdFor already returns the
// config zone id (`attack-third` / `centre-third` / `defence-third`).
const thirdLookup = primaryThirdFor as ThirdLookup;

// Map a PlayerThirdMs key back to the config zone id the per-period map
// is keyed by — the cross-check axis.
const ZONE_FOR_THIRD = {
  attack: "attack-third",
  centre: "centre-third",
  defence: "defence-third",
} as const;

let evCounter = 0;
function ev(
  type: GameEvent["type"],
  metadata: Record<string, unknown> = {},
  player_id: string | null = null,
): GameEvent {
  evCounter++;
  const t = new Date(2026, 0, 1, 12, 0, evCounter).toISOString();
  return {
    id: `e${evCounter}`,
    game_id: "g1",
    type,
    player_id,
    metadata,
    created_at: t,
    created_by: "u1",
  } as GameEvent;
}

// Two-quarter netball stream (finalised) where players swap thirds at
// the break, so each player's third differs across periods:
//
//   Q1 (periodSeconds): gs=[A] (attack) c=[B] (centre) gk=[C] (defence)
//   break reshuffle:    gs=[B] (attack) c=[A] (centre) gk=[C] (defence)
//   Q2 (periodSeconds): same as the break lineup
//   D sits on the bench the whole game → never credited.
function twoQuarterNetballStream(): GameEvent[] {
  evCounter = 0;
  return [
    ev("lineup_set", {
      lineup: { positions: { gs: ["A"], c: ["B"], gk: ["C"] }, bench: ["D"] },
    }),
    ev("quarter_start", { quarter: 1 }),
    ev("quarter_end", { quarter: 1, elapsed_ms: 600_000 }),
    ev("period_break_swap", {
      lineup: { positions: { gs: ["B"], c: ["A"], gk: ["C"] }, bench: ["D"] },
    }),
    ev("quarter_start", { quarter: 2 }),
    ev("quarter_end", { quarter: 2, elapsed_ms: 600_000 }),
    ev("game_finalised", {}),
  ];
}

describe("netball playedZoneMsByPeriod (PLAYERVIEW-01 / D-05)", () => {
  const periodSeconds = getAgeGroupConfig("netball", "go").periodSeconds;
  const periodMs = periodSeconds * 1000;

  it("credits each player's third time to the correct period + config zone id", () => {
    const byPeriod = playedZoneMsByPeriod(
      twoQuarterNetballStream(),
      periodSeconds,
      thirdLookup,
    );
    expect(byPeriod).toBeDefined();

    // A: attack-third in Q1, centre-third in Q2.
    expect(byPeriod["A"][1]["attack-third"]).toBe(periodMs);
    expect(byPeriod["A"][2]["centre-third"]).toBe(periodMs);

    // B: centre-third in Q1, attack-third in Q2.
    expect(byPeriod["B"][1]["centre-third"]).toBe(periodMs);
    expect(byPeriod["B"][2]["attack-third"]).toBe(periodMs);

    // C: defence-third both quarters.
    expect(byPeriod["C"][1]["defence-third"]).toBe(periodMs);
    expect(byPeriod["C"][2]["defence-third"]).toBe(periodMs);

    // D never took the court → no buckets at all.
    expect(byPeriod["D"]).toBeUndefined();
  });

  it("per-period buckets sum to the whole-game playerThirdMs per zone", () => {
    const stream = twoQuarterNetballStream();
    const byPeriod = playedZoneMsByPeriod(stream, periodSeconds, thirdLookup);
    const whole = playerThirdMs(stream, null, periodSeconds, thirdLookup);

    for (const [pid, thirds] of Array.from(whole.entries())) {
      for (const [thirdKey, zoneId] of Object.entries(ZONE_FOR_THIRD)) {
        const total = thirds[thirdKey as keyof typeof thirds];
        const summed = Object.values(byPeriod[pid] ?? {}).reduce(
          (acc, periodZm) => acc + (periodZm[zoneId] ?? 0),
          0,
        );
        expect(summed).toBe(total);
      }
    }
  });

  it("does not invent periods a player never appeared in", () => {
    const byPeriod = playedZoneMsByPeriod(
      twoQuarterNetballStream(),
      periodSeconds,
      thirdLookup,
    );
    // A and B both played both quarters; C too. None should carry a
    // phantom 3rd period.
    expect(Object.keys(byPeriod["A"]).map(Number).sort()).toEqual([1, 2]);
    expect(Object.keys(byPeriod["C"]).map(Number).sort()).toEqual([1, 2]);
  });

  it("splits a mid-quarter sub across the right period segments", () => {
    // Short-squad move: D comes on for B at centre half-way through Q1
    // via a midQuarterSubs entry on the break event that closes Q1.
    evCounter = 0;
    const stream: GameEvent[] = [
      ev("lineup_set", {
        lineup: { positions: { gs: ["A"], c: ["B"], gk: ["C"] }, bench: ["D"] },
      }),
      ev("quarter_start", { quarter: 1 }),
      ev("quarter_end", { quarter: 1, elapsed_ms: 600_000 }),
      ev("period_break_swap", {
        lineup: { positions: { gs: ["A"], c: ["D"], gk: ["C"] }, bench: ["B"] },
        midQuarterSubs: [
          {
            positionId: "c",
            outPlayerId: "B",
            inPlayerId: "D",
            atMs: 300_000,
          },
        ],
      }),
      ev("quarter_start", { quarter: 2 }),
      ev("quarter_end", { quarter: 2, elapsed_ms: 600_000 }),
      ev("game_finalised", {}),
    ];

    const byPeriod = playedZoneMsByPeriod(stream, periodSeconds, thirdLookup);
    const whole = playerThirdMs(stream, null, periodSeconds, thirdLookup);

    // B played centre 0..300_000 of Q1 then sat → only a Q1 centre bucket.
    expect(byPeriod["B"][1]["centre-third"]).toBe(300_000);
    expect(byPeriod["B"][2]).toBeUndefined();
    // D came on at centre at 300_000 of Q1, stayed centre in Q2.
    expect(byPeriod["D"][1]["centre-third"]).toBe(300_000);
    expect(byPeriod["D"][2]["centre-third"]).toBe(600_000);

    // Cross-check still holds with the mid-quarter split.
    for (const [pid, thirds] of Array.from(whole.entries())) {
      for (const [thirdKey, zoneId] of Object.entries(ZONE_FOR_THIRD)) {
        const total = thirds[thirdKey as keyof typeof thirds];
        const summed = Object.values(byPeriod[pid] ?? {}).reduce(
          (acc, periodZm) => acc + (periodZm[zoneId] ?? 0),
          0,
        );
        expect(summed).toBe(total);
      }
    }
  });
});
