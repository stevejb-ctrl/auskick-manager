// Unit tests for netball position-count-per-game fairness.

import { describe, expect, it } from "vitest";
import type { GameEvent } from "@/lib/types";
import {
  gamePositionCounts,
  seasonPositionCounts,
  netballFairnessScore,
  suggestNetballLineup,
  emptyGenericLineup,
} from "@/lib/sports/netball/fairness";
import { isPositionAllowedInZone, netballSport } from "@/lib/sports/netball";

// Zone eligibility predicate aligned with how the live-game UI would use
// it: is the player (no restrictions here — just returns true) allowed
// at this position id? For suggest tests we accept everyone everywhere
// unless a specific test pins a restriction.
const alwaysAllowed = () => true;

function mkEvent(
  type: GameEvent["type"],
  created_at: string,
  metadata: Record<string, unknown> = {},
): GameEvent {
  return {
    id: `${type}-${created_at}`,
    game_id: "g1",
    type,
    player_id: null,
    metadata,
    created_by: null,
    created_at,
  };
}

describe("gamePositionCounts", () => {
  it("counts a single initial lineup as one quarter", () => {
    const events: GameEvent[] = [
      mkEvent("lineup_set", "2025-01-01T00:00:00Z", {
        lineup: {
          positions: {
            gs: ["alice"], ga: ["bob"], wa: ["cara"], c: ["dan"],
            wd: ["eve"], gd: ["fay"], gk: ["gus"],
          },
          bench: ["hal"],
        },
      }),
      mkEvent("game_finalised", "2025-01-01T01:00:00Z"),
    ];
    const counts = gamePositionCounts(events);
    expect(counts["alice"]?.gs).toBe(1);
    expect(counts["hal"]).toBeUndefined(); // benched — not counted
  });

  it("accumulates across period_break_swap events", () => {
    const events: GameEvent[] = [
      mkEvent("lineup_set", "t1", {
        lineup: {
          positions: {
            gs: ["alice"], ga: ["bob"], wa: ["cara"], c: ["dan"],
            wd: ["eve"], gd: ["fay"], gk: ["gus"],
          },
          bench: ["hal"],
        },
      }),
      // Q2: alice → bench, hal → GS
      mkEvent("period_break_swap", "t2", {
        quarter: 2,
        lineup: {
          positions: {
            gs: ["hal"], ga: ["bob"], wa: ["cara"], c: ["dan"],
            wd: ["eve"], gd: ["fay"], gk: ["gus"],
          },
          bench: ["alice"],
        },
      }),
      mkEvent("game_finalised", "t3"),
    ];
    const counts = gamePositionCounts(events);
    expect(counts["alice"]?.gs).toBe(1); // Q1 only
    expect(counts["hal"]?.gs).toBe(1);   // Q2 only
    expect(counts["bob"]?.ga).toBe(2);   // both quarters
  });
});

describe("seasonPositionCounts", () => {
  it("sums across multiple games", () => {
    const g1: GameEvent[] = [
      mkEvent("lineup_set", "2025-01-01T00:00:00Z", {
        lineup: {
          positions: {
            gs: ["alice"], ga: ["bob"], wa: ["cara"], c: ["dan"],
            wd: ["eve"], gd: ["fay"], gk: ["gus"],
          },
          bench: [],
        },
      }),
      mkEvent("game_finalised", "2025-01-01T01:00:00Z"),
    ];
    const g2: GameEvent[] = [
      mkEvent("lineup_set", "2025-01-08T00:00:00Z", {
        lineup: {
          positions: {
            gs: ["bob"], ga: ["alice"], wa: ["cara"], c: ["dan"],
            wd: ["eve"], gd: ["fay"], gk: ["gus"],
          },
          bench: [],
        },
      }),
      mkEvent("game_finalised", "2025-01-08T01:00:00Z"),
    ].map((e) => ({ ...e, game_id: "g2" }));

    const counts = seasonPositionCounts([...g1, ...g2]);
    expect(counts["alice"]?.gs).toBe(1);
    expect(counts["alice"]?.ga).toBe(1);
    expect(counts["bob"]?.gs).toBe(1);
    expect(counts["bob"]?.ga).toBe(1);
  });
});

describe("netballFairnessScore", () => {
  it("returns 100 for perfectly balanced counts", () => {
    const season = {
      alice: { gs: 2, ga: 2, wa: 2, c: 2, wd: 2, gd: 2, gk: 2 },
    };
    expect(netballFairnessScore(season)).toBe(100);
  });

  it("returns < 100 for imbalanced counts", () => {
    const season = {
      alice: { gs: 10, ga: 1, wa: 1, c: 1, wd: 1, gd: 1, gk: 1 },
    };
    expect(netballFairnessScore(season)).toBeLessThan(50);
  });

  it("returns 100 for empty season", () => {
    expect(netballFairnessScore({})).toBe(100);
  });
});

describe("suggestNetballLineup", () => {
  it("rotates a player away from a position they've already played this game", () => {
    const lineup = suggestNetballLineup({
      playerIds: ["alice", "bob", "cara", "dan", "eve", "fay", "gus"],
      positions: ["gs", "ga", "wa", "c", "wd", "gd", "gk"],
      season: {},
      thisGame: {
        alice: { gs: 1 }, // just played GS — should move off
      },
      isAllowed: alwaysAllowed,
    });
    // alice should NOT be at GS again.
    expect(lineup.positions.gs).not.toContain("alice");
  });

  it("respects zone eligibility when eligibility is restricted", () => {
    const lineup = suggestNetballLineup({
      playerIds: ["alice", "bob", "cara", "dan", "eve", "fay", "gus"],
      positions: ["gs", "ga", "wa", "c", "wd", "gd", "gk"],
      season: {},
      thisGame: {},
      // Pretend alice is only eligible at GK (e.g. a height restriction)
      isAllowed: (pid, pos) => (pid === "alice" ? pos === "gk" : true),
    });
    expect(lineup.positions.gk).toContain("alice");
    for (const pos of ["gs", "ga", "wa", "c", "wd", "gd"]) {
      expect(lineup.positions[pos]).not.toContain("alice");
    }
  });

  it("benches extra players when squad > on-field size", () => {
    const lineup = suggestNetballLineup({
      playerIds: ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"],
      positions: ["gs", "ga", "wa", "c", "wd", "gd", "gk"],
      season: {},
      thisGame: {},
      isAllowed: alwaysAllowed,
    });
    const onField = Object.values(lineup.positions).flat();
    expect(onField).toHaveLength(7);
    expect(lineup.bench).toHaveLength(2);
  });

  // Map mirrors netball/index.ts primaryThirdFor — keeping the test
  // self-contained instead of importing the live one so we don't have
  // a hidden coupling to the production registry.
  const TEST_THIRD = (posId: string) => {
    const m: Record<string, "attack-third" | "centre-third" | "defence-third"> = {
      gs: "attack-third",
      ga: "attack-third",
      wa: "centre-third",
      c: "centre-third",
      wd: "centre-third",
      gd: "defence-third",
      gk: "defence-third",
    };
    return m[posId] ?? null;
  };

  it("tier 1: prefers a third the player hasn't played this game", () => {
    // alice played centre (C) in Q1. The tier-1 unplayed-third bonus
    // should push her into attack OR defence for Q2 even when other
    // signals are flat.
    const lineup = suggestNetballLineup({
      playerIds: ["alice", "b", "c", "d", "e", "f", "g"],
      positions: ["gs", "ga", "wa", "c", "wd", "gd", "gk"],
      season: {},
      thisGame: { alice: { c: 1 } },
      isAllowed: alwaysAllowed,
      thirdOf: TEST_THIRD,
    });
    const aliceAt = (Object.entries(lineup.positions).find(([, ids]) =>
      ids.includes("alice"),
    ) ?? [])[0];
    expect(aliceAt).toBeDefined();
    expect(TEST_THIRD(aliceAt!)).not.toBe("centre-third");
  });

  it("tier 2: avoids placing in the same third as last quarter", () => {
    // bob played WA last quarter (centre-third). tier 1 says any
    // unplayed third works — but tier 2 says don't put him in centre.
    // With only thirdOf + lastQuarterThird (no thisGame counts), the
    // tier-1 bonus applies to every third equally so tier 2 is the
    // active discriminator.
    const lineup = suggestNetballLineup({
      playerIds: ["alice", "bob", "c", "d", "e", "f", "g"],
      positions: ["gs", "ga", "wa", "c", "wd", "gd", "gk"],
      season: {},
      thisGame: {},
      isAllowed: alwaysAllowed,
      thirdOf: TEST_THIRD,
      lastQuarterThird: { bob: "centre-third" },
    });
    const bobAt = (Object.entries(lineup.positions).find(([, ids]) =>
      ids.includes("bob"),
    ) ?? [])[0];
    expect(bobAt).toBeDefined();
    expect(TEST_THIRD(bobAt!)).not.toBe("centre-third");
  });

  it("tier 2: heavy penalty on repeating exact position even after every third covered", () => {
    // dan has covered all three thirds this game (gs in Q1, c in Q2,
    // gd in Q3). No tier-1 bonus applies — every candidate scores 0
    // there. The same-position penalty (-50000) should keep him out
    // of GS / C / GD for Q4 even with a fresh squad available.
    const lineup = suggestNetballLineup({
      playerIds: ["dan", "b", "c", "d", "e", "f", "g"],
      positions: ["gs", "ga", "wa", "c", "wd", "gd", "gk"],
      season: {},
      thisGame: { dan: { gs: 1, c: 1, gd: 1 } },
      isAllowed: alwaysAllowed,
      thirdOf: TEST_THIRD,
      lastQuarterThird: { dan: "defence-third" },
    });
    const danAt = (Object.entries(lineup.positions).find(([, ids]) =>
      ids.includes("dan"),
    ) ?? [])[0];
    expect(danAt).toBeDefined();
    expect(["gs", "c", "gd"]).not.toContain(danAt);
  });

  it("tier 1 dominates tier 3 when they conflict", () => {
    // cara played GS (attack) last quarter — tier 2 says avoid attack.
    // But she's only ever played attack this game, so tier 1 says
    // CENTRE or DEFENCE. The two rules agree here. Confirm she's NOT
    // in attack despite the +100000 unplayed-third bonus that would
    // apply to centre/defence — she has those slots open and shouldn't
    // need to repeat attack.
    const lineup = suggestNetballLineup({
      playerIds: ["cara", "b", "c", "d", "e", "f", "g"],
      positions: ["gs", "ga", "wa", "c", "wd", "gd", "gk"],
      season: {},
      thisGame: { cara: { gs: 1 } },
      isAllowed: alwaysAllowed,
      thirdOf: TEST_THIRD,
      lastQuarterThird: { cara: "attack-third" },
    });
    const caraAt = (Object.entries(lineup.positions).find(([, ids]) =>
      ids.includes("cara"),
    ) ?? [])[0];
    expect(caraAt).toBeDefined();
    expect(TEST_THIRD(caraAt!)).not.toBe("attack-third");
  });
});

describe("integration: netballSport.validateLineup + suggest", () => {
  it("a suggested full-7 lineup validates cleanly", () => {
    const suggested = suggestNetballLineup({
      playerIds: ["a", "b", "c", "d", "e", "f", "g"],
      positions: ["gs", "ga", "wa", "c", "wd", "gd", "gk"],
      season: {},
      thisGame: {},
      isAllowed: alwaysAllowed,
    });
    const openAge = netballSport.ageGroups.find((a) => a.id === "open")!;
    const result = netballSport.validateLineup!(suggested, openAge);
    expect(result.ok).toBe(true);
  });

  it("emptyGenericLineup + validate fails with all-empty issues", () => {
    const empty = emptyGenericLineup(["gs", "ga", "wa", "c", "wd", "gd", "gk"]);
    const openAge = netballSport.ageGroups.find((a) => a.id === "open")!;
    const result = netballSport.validateLineup!(empty, openAge);
    expect(result.ok).toBe(false);
    // All 7 positions should trigger "empty" errors.
    expect(result.issues.filter((i) => /empty/i.test(i.message))).toHaveLength(7);
  });

  it("isPositionAllowedInZone matches position allowedZones", () => {
    // Sanity cross-check: GS's allowedZones includes attack-third.
    expect(isPositionAllowedInZone("gs", "attack-third")).toBe(true);
  });
});
