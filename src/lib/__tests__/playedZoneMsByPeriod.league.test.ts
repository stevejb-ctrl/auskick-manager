// PLAYERVIEW-01 / D-05 (plan 12-02, rugby-league mirror) — RED-FIRST.
//
// Rugby league's config has a SINGLE "field" zone (forwards/backs are
// vests/roles, not config zones), so the long-press per-period
// breakdown collapses to per-PLAYER, per-PERIOD on-field ms keyed by
// the single config zone id "field". The whole-game on-field ms
// already lives in `playerMsOnField`; this spec pins a new
// `playedZoneMsByPeriod` accessor that buckets the SAME credited ms by
// period.
//
// Locked invariant (mirrors AFL + netball): summing a player's
// per-period field buckets over all periods MUST equal their existing
// whole-game `playerMsOnField` total. The new map is a finer-grained
// split of the same credited ms.
//
// Period count comes from `ageGroup.periodCount` (no hardcoded 2/4).
//
// RED until plan 12-02 Task 2 adds `playedZoneMsByPeriod` to the
// rugby-league fairness module.

import { describe, expect, it } from "vitest";
import {
  playerMsOnField,
  playedZoneMsByPeriod,
} from "@/lib/sports/rugby_league/fairness";
import { getAgeGroupConfig } from "@/lib/sports/registry";
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

// Build an RL stream across ALL of the age group's periods (derived
// from ageGroup.periodCount — never a literal). A and B start on the
// field; C starts on the bench. Half-way through period 1, A is subbed
// off for C (rolling sub). For every later period A is back on and C is
// benched, so each player's field time differs period to period.
function buildStream(periodCount: number, periodMs: number) {
  _ts = 0;
  const events: GameEvent[] = [
    ev("lineup_set", { lineup: { field: ["A", "B"], bench: ["C"] } }),
  ];
  for (let q = 1; q <= periodCount; q++) {
    events.push(ev("quarter_start", { quarter: q }));
    if (q === 1) {
      // Rolling sub at the half-way mark: A off, C on.
      events.push(
        ev(
          "swap",
          { off_player_id: "A", on_player_id: "C", elapsed_ms: periodMs / 2 },
          "A",
        ),
      );
    }
    events.push(ev("quarter_end", { quarter: q, elapsed_ms: periodMs }));
    if (q === 1) {
      // Reset for the next period: A back on field, C to the bench.
      events.push(ev("lineup_set", { lineup: { field: ["A", "B"], bench: ["C"] } }));
    }
  }
  events.push(ev("game_finalised", {}));
  return events;
}

describe("rugby-league playedZoneMsByPeriod (PLAYERVIEW-01 / D-05)", () => {
  const ageGroup = getAgeGroupConfig("rugby_league", "U10");
  const periodCount = ageGroup.periodCount;
  const periodMs = ageGroup.periodSeconds * 1000;

  it("credits on-field ms to the correct period under the single 'field' zone", () => {
    const stream = buildStream(periodCount, periodMs);
    const byPeriod = playedZoneMsByPeriod(stream);
    expect(byPeriod).toBeDefined();

    // A: half of period 1 (subbed off at the mid-mark), full field for
    // every later period.
    expect(byPeriod["A"][1]["field"]).toBe(periodMs / 2);
    expect(byPeriod["A"][periodCount]["field"]).toBe(periodMs);

    // B: full field every period.
    expect(byPeriod["B"][1]["field"]).toBe(periodMs);
    expect(byPeriod["B"][periodCount]["field"]).toBe(periodMs);

    // C: only the second half of period 1 (came on at the mid-mark),
    // benched for every later period → no later bucket.
    expect(byPeriod["C"][1]["field"]).toBe(periodMs / 2);
    expect(byPeriod["C"][periodCount]).toBeUndefined();
  });

  it("does not credit any period beyond ageGroup.periodCount", () => {
    const byPeriod = playedZoneMsByPeriod(buildStream(periodCount, periodMs));
    for (const periods of Object.values(byPeriod)) {
      for (const p of Object.keys(periods).map(Number)) {
        expect(p).toBeGreaterThanOrEqual(1);
        expect(p).toBeLessThanOrEqual(periodCount);
      }
    }
  });

  it("per-period field buckets sum to the whole-game playerMsOnField", () => {
    const stream = buildStream(periodCount, periodMs);
    const byPeriod = playedZoneMsByPeriod(stream);
    // Game is finalised, so the active quarter has closed — no live
    // overlay is added regardless of the currentQuarter we pass.
    const whole = playerMsOnField(stream, periodCount, periodMs);

    for (const [pid, total] of Object.entries(whole)) {
      const summed = Object.values(byPeriod[pid] ?? {}).reduce(
        (acc, periodZm) => acc + (periodZm["field"] ?? 0),
        0,
      );
      expect(summed).toBe(total);
    }
  });
});
