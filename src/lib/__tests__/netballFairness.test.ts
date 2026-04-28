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
  it("regression: a player benched twice gets court time over players already on for both quarters", () => {
    // Reproduces Steve's Q3 break — Nicola P and Hattie D benched
    // through Q1 and Q2 were getting suggested for the Q3 bench too,
    // which would mean two full quarters off court. The sort key
    // must put least-played-THIS-GAME first so the sit-out players
    // fill the court ahead of anyone who's already played both
    // prior quarters.
    //
    // Setup: 9-player squad, 7 court slots. After Q1 + Q2:
    //   - p1..p7 each played 2 quarters (one position per quarter)
    //   - p8, p9 sat on the bench both quarters (0 plays)
    // Q3 suggestion must put p8 and p9 on court — they're the bench
    // for Q3 should be drawn from p1..p7.
    // p8 and p9 also happen to have high season totals — testing
    // that this-game count dominates season count (new sort key).
    // Without this-game taking priority, the season-only sort would
    // put p8 and p9 LAST and bench them again.
    const lineup = suggestNetballLineup({
      playerIds: ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"],
      positions: ["gs", "ga", "wa", "c", "wd", "gd", "gk"],
      season: {
        p8: { gk: 8 }, // veteran — most played across the season
        p9: { gd: 8 },
      },
      thisGame: {
        p1: { gs: 1, ga: 1 },
        p2: { ga: 1, gs: 1 },
        p3: { wa: 1, c: 1 },
        p4: { c: 1, wa: 1 },
        p5: { wd: 1, c: 1 },
        p6: { gd: 1, gk: 1 },
        p7: { gk: 1, gd: 1 },
      },
      isAllowed: alwaysAllowed,
      seed: 3,
    });
    const onCourt = new Set<string>(Object.values(lineup.positions).flat());
    // The two bench-Q1+Q2 players must be on court for Q3 — even
    // though the season-rarity tiebreak would otherwise keep them
    // benched.
    expect(onCourt.has("p8")).toBe(true);
    expect(onCourt.has("p9")).toBe(true);
  });

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

  it("regression: Steve's 8-player squad — Q1 attack pair stays apart in Q2", () => {
    // Reproduces game 529e6ba6 from the bug report. Q1 lineup:
    //   ATTACK  = hattie, sammy
    //   CENTRE  = rosie, jess, lucy
    //   DEFENCE = jonie, lori
    //   BENCH   = renae
    // After Q2 suggestion, no two players who shared a Q1 third
    // should both end up in the SAME Q2 third.
    const previousTeammates: Record<string, Set<string>> = {
      hattie: new Set(["sammy"]),
      sammy: new Set(["hattie"]),
      rosie: new Set(["jess", "lucy"]),
      jess: new Set(["rosie", "lucy"]),
      lucy: new Set(["rosie", "jess"]),
      jonie: new Set(["lori"]),
      lori: new Set(["jonie"]),
    };
    const lastQuarterThird: Record<string, "attack-third" | "centre-third" | "defence-third"> = {
      hattie: "attack-third",
      sammy: "attack-third",
      rosie: "centre-third",
      jess: "centre-third",
      lucy: "centre-third",
      jonie: "defence-third",
      lori: "defence-third",
    };
    const lineup = suggestNetballLineup({
      playerIds: ["hattie", "sammy", "rosie", "jess", "lucy", "jonie", "lori", "renae"],
      positions: ["gs", "ga", "wa", "c", "wd", "gd", "gk"],
      season: {},
      thisGame: {
        hattie: { gs: 1 },
        sammy: { ga: 1 },
        rosie: { wa: 1 },
        jess: { c: 1 },
        lucy: { wd: 1 },
        jonie: { gd: 1 },
        lori: { gk: 1 },
      },
      isAllowed: alwaysAllowed,
      thirdOf: TEST_THIRD,
      lastQuarterThird,
      previousTeammates,
      seed: 2,
    });

    const thirdOf = (pid: string): string | null => {
      for (const [posId, ids] of Object.entries(lineup.positions)) {
        if (ids.includes(pid)) return TEST_THIRD(posId);
      }
      return null; // bench
    };

    // Hattie + Sammy were attack teammates in Q1 — must split.
    expect(thirdOf("hattie")).not.toBe(thirdOf("sammy"));

    // Centre trio (rosie, jess, lucy): no two of them should land in
    // the same third for Q2.
    const centreTrio = ["rosie", "jess", "lucy"] as const;
    const centreThirds = centreTrio.map(thirdOf).filter(Boolean);
    expect(new Set(centreThirds).size).toBe(centreThirds.length);

    // Defence pair (jonie, lori) — must split too.
    expect(thirdOf("jonie")).not.toBe(thirdOf("lori"));
  });

  it("regression: tier 4 wins over tier 1's unplayed-third bonus", () => {
    // Reproduces Steve's game 41e8b552 Q2 suggestion. Q1:
    //   ATTACK  = jady, patra
    //   CENTRE  = lucy, jimmy, nicole
    //   DEFENCE = sam (hattie injured)
    //   BENCH   = stacey, yumi
    // Earlier the candidate-order shuffle put `sam, stacey, lucy,
    // yumi, nicole, ...` and Sam grabbed GS first. By the time
    // Nicole's turn came, her only fresh thirds were taken by
    // attack, leaving "centre (stale)" or "defence (with Lucy)".
    // tier 1's +100000 unplayed-third bonus + tier 4's measly
    // -5000 mate penalty meant defence still scored ~+95000 — vs
    // -10000 for stale centre — and Nicole landed in defence with
    // Lucy. Bumping tier 4 to -150000 flips the comparison so
    // staleCentre wins and the trio actually splits.
    const previousTeammates: Record<string, Set<string>> = {
      jady: new Set(["patra"]),
      patra: new Set(["jady"]),
      lucy: new Set(["jimmy", "nicole"]),
      jimmy: new Set(["lucy", "nicole"]),
      nicole: new Set(["lucy", "jimmy"]),
      sam: new Set(),
    };
    const lastQuarterThird = {
      jady: "attack-third",
      patra: "attack-third",
      lucy: "centre-third",
      jimmy: "centre-third",
      nicole: "centre-third",
      sam: "defence-third",
    } as const;
    const lineup = suggestNetballLineup({
      // candidate order matches the live page's Postgres ordering +
      // candidatePool concat from NetballQuarterBreak.
      playerIds: ["jady", "sam", "patra", "stacey", "lucy", "nicole", "jimmy", "yumi"],
      positions: ["gs", "ga", "wa", "c", "wd", "gd", "gk"],
      season: {},
      thisGame: {
        jady: { gs: 1 }, patra: { ga: 1 }, lucy: { wa: 1 },
        jimmy: { c: 1 }, nicole: { wd: 1 }, sam: { gk: 1 },
      },
      isAllowed: alwaysAllowed,
      thirdOf: TEST_THIRD,
      lastQuarterThird,
      previousTeammates,
      seed: 2,
    });

    const thirdOf = (pid: string): string | null => {
      for (const [posId, ids] of Object.entries(lineup.positions)) {
        if (ids.includes(pid)) return TEST_THIRD(posId);
      }
      return null;
    };
    // The Q1 centre trio must split — no two of them in the same Q2 third.
    const trio = ["lucy", "jimmy", "nicole"] as const;
    const trioThirds = trio.map(thirdOf).filter(Boolean);
    expect(new Set(trioThirds).size).toBe(trioThirds.length);
    // And specifically: Lucy + Nicole shouldn't both end up in defence.
    expect(thirdOf("lucy") === "defence-third" && thirdOf("nicole") === "defence-third").toBe(false);
  });

  it("tier 4: splits last-quarter teammates apart when other rules are flat", () => {
    // ed and frank were both in the centre third in Q1. With nothing
    // else differentiating placements (no thisGame counts so tier 1
    // bonuses apply equally; no lastQuarterThird so tier 3 quiet),
    // the suggester should NOT put both back into the centre third
    // for Q2 — tier 4 deducts 200 per repeated teammate.
    //
    // Squad of 7 = exactly enough to fill the lineup with no bench;
    // total played sort is stable; the seeded shuffle is deterministic.
    // We assert that the centre third doesn't contain BOTH ed and
    // frank — at least one of them should have moved to a different
    // third.
    const lineup = suggestNetballLineup({
      playerIds: ["a", "b", "c", "d", "ed", "frank", "g"],
      positions: ["gs", "ga", "wa", "c", "wd", "gd", "gk"],
      season: {},
      thisGame: {},
      isAllowed: alwaysAllowed,
      thirdOf: TEST_THIRD,
      previousTeammates: {
        ed: new Set(["frank"]),
        frank: new Set(["ed"]),
      },
    });
    const centreSet = new Set([
      ...lineup.positions.wa,
      ...lineup.positions.c,
      ...lineup.positions.wd,
    ]);
    const bothInCentre = centreSet.has("ed") && centreSet.has("frank");
    expect(bothInCentre).toBe(false);
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
