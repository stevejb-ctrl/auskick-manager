// League's "Sub due — rotate a player off" banner fired when §6 (or the
// game-time floor) kept every kid on: taking one off breaks the law for
// that kid, and the §6 card lower down said the opposite (round-2
// usability test, 24 Oct 2026). The banner now needs a legal swap.

import { describe, expect, it } from "vitest";
import { leagueSwapPossible } from "@/lib/sports/rugby_league/legalSwap";
import type { LeagueSubLaws } from "@/lib/sports/rugby_league/fairness";
import type { GameEvent, LeagueLineup } from "@/lib/types";

const MIN = 60_000;
let seq = 0;
function ev(type: string, metadata: Record<string, unknown>): GameEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    game_id: "g1",
    type: type as GameEvent["type"],
    player_id: null,
    metadata,
    created_by: null,
    created_at: new Date(Date.parse("2026-10-24T09:00:00.000Z") + seq * 1000).toISOString(),
  };
}

const lineup: LeagueLineup = { forwards: ["a", "b"], backs: ["c", "d"], bench: ["x"] };
const secondHalf = [
  ev("lineup_set", { lineup }),
  ev("quarter_start", { quarter: 1 }),
  ev("quarter_end", { quarter: 1, elapsed_ms: 10 * MIN }),
  ev("quarter_start", { quarter: 2 }),
];
const laws = (over: Partial<LeagueSubLaws> = {}): LeagueSubLaws => ({
  periodCount: 2,
  periodMs: 10 * MIN,
  requiredUnbroken: 0,
  minGameTimePct: 0,
  ...over,
});

describe("leagueSwapPossible", () => {
  it("is false when every kid on the field has to stay on to the hooter", () => {
    // Second half, 4:00 in, and the floor is the whole game: nobody can
    // come off without missing it.
    expect(leagueSwapPossible({ events: secondHalf, period: 2, lineup, elapsedMs: 4 * MIN, laws: laws({ minGameTimePct: 100 }) })).toBe(false);
  });

  it("is true when a kid on the field can come off for one on the bench", () => {
    expect(leagueSwapPossible({ events: secondHalf, period: 2, lineup, elapsedMs: 4 * MIN, laws: laws() })).toBe(true);
  });

  it("is false with no one able to come on, or with subs at the breaks only", () => {
    expect(
      leagueSwapPossible({ events: secondHalf, period: 2, lineup: { ...lineup, bench: [] }, elapsedMs: 4 * MIN, laws: laws() }),
    ).toBe(false);
    expect(
      leagueSwapPossible({
        events: secondHalf,
        period: 2,
        lineup,
        elapsedMs: 4 * MIN,
        laws: laws(),
        playbook: { rules: [{ kind: "subs-at-breaks" }] } as never,
      }),
    ).toBe(false);
  });

  it("leaves the kids it's told to keep on (the vest wearers)", () => {
    expect(
      leagueSwapPossible({ events: secondHalf, period: 2, lineup, elapsedMs: 4 * MIN, laws: laws(), keepOn: ["a", "b", "c", "d"] }),
    ).toBe(false);
  });
});
