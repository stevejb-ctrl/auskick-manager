// PLAYERVIEW-01 / D-05 (plan 12-01) — RED-FIRST.
//
// The long-press per-period breakdown needs per-PLAYER, per-PERIOD,
// per-ZONE played ms. `replayGame` already tracks the cumulative
// `basePlayedZoneMs[pid][zone]` (summed across the whole game) via the
// single `addPlayed` funnel, and the ENDING zone per period via
// `pastQuarterZones` — but it does NOT keep the per-period zone-ms
// split. This spec pins a new `playedZoneMsByPeriod[pid][period][zone]`
// field that the addPlayed funnel credits at `state.currentQuarter`.
//
// Locked invariant: summing a player's per-period buckets over all
// periods MUST equal their existing `basePlayedZoneMs[pid][zone]` —
// the new map is a finer-grained split of the same credited ms, not a
// second independent accumulator.
//
// RED until Task 2 adds `playedZoneMsByPeriod` to GameState + addPlayed.

import { describe, expect, it } from "vitest";
import { replayGame } from "@/lib/fairness";
import type { GameEvent } from "@/lib/types";

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

// Two-quarter AFL stream with a mid-Q1 swap and a Q-break reshuffle so
// each player's zone differs across periods:
//
//   Q1 (0..600_000ms):
//     A back the whole quarter            → P1 back 600_000
//     B mid 0..300_000, then subbed off   → P1 mid 300_000
//     C fwd the whole quarter             → P1 fwd 600_000
//     D subbed on @300_000 into mid       → P1 mid 300_000
//   Q-break reshuffle: back=[B] mid=[A] fwd=[C] bench=[D]
//   Q2 (0..600_000ms):
//     B back the whole quarter            → P2 back 600_000
//     A mid the whole quarter             → P2 mid 600_000
//     C fwd the whole quarter             → P2 fwd 600_000
//     D benched                           → (no P2 entry)
function twoQuarterStream(): GameEvent[] {
  evCounter = 0;
  return [
    ev("lineup_set", {
      lineup: { back: ["A"], mid: ["B"], fwd: ["C"], bench: ["D"] },
    }),
    ev("quarter_start", { quarter: 1 }),
    ev(
      "swap",
      { off_player_id: "B", on_player_id: "D", zone: "mid", elapsed_ms: 300_000 },
      "D",
    ),
    ev("quarter_end", { elapsed_ms: 600_000 }),
    ev("lineup_set", {
      lineup: { back: ["B"], mid: ["A"], fwd: ["C"], bench: ["D"] },
    }),
    ev("quarter_start", { quarter: 2 }),
    ev("quarter_end", { elapsed_ms: 600_000 }),
  ];
}

describe("replayGame — playedZoneMsByPeriod (PLAYERVIEW-01 / D-05)", () => {
  it("credits each player's played ms to the correct period + zone bucket", () => {
    const state = replayGame(twoQuarterStream());
    const byPeriod = state.playedZoneMsByPeriod;
    expect(byPeriod).toBeDefined();

    // A: back in Q1, mid in Q2.
    expect(byPeriod["A"][1].back).toBe(600_000);
    expect(byPeriod["A"][2].mid).toBe(600_000);
    // A never played fwd / hback / hfwd in either period.
    expect(byPeriod["A"][1].mid).toBe(0);
    expect(byPeriod["A"][2].back).toBe(0);

    // B: mid in Q1 (subbed off at 300_000), back in Q2.
    expect(byPeriod["B"][1].mid).toBe(300_000);
    expect(byPeriod["B"][2].back).toBe(600_000);

    // C: fwd both quarters.
    expect(byPeriod["C"][1].fwd).toBe(600_000);
    expect(byPeriod["C"][2].fwd).toBe(600_000);

    // D: subbed on into mid at 300_000 of Q1, benched in Q2.
    expect(byPeriod["D"][1].mid).toBe(300_000);
    expect(byPeriod["D"][2]).toBeUndefined();
  });

  it("per-period buckets sum to the existing basePlayedZoneMs per zone", () => {
    const state = replayGame(twoQuarterStream());
    const byPeriod = state.playedZoneMsByPeriod;
    expect(byPeriod).toBeDefined();

    for (const [pid, totals] of Object.entries(state.basePlayedZoneMs)) {
      for (const [zone, total] of Object.entries(totals)) {
        const summed = Object.values(byPeriod[pid] ?? {}).reduce(
          (acc, periodZm) => acc + (periodZm[zone as keyof typeof periodZm] ?? 0),
          0,
        );
        expect(summed).toBe(total);
      }
    }
  });

  it("does not invent periods a player never appeared in", () => {
    const state = replayGame(twoQuarterStream());
    // D only ever played in period 1.
    expect(Object.keys(state.playedZoneMsByPeriod["D"]).map(Number)).toEqual([1]);
  });
});
