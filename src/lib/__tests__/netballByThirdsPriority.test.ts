// "By thirds": a third a kid hasn't played this game outranks keeping
// last quarter's partners apart (Steve, 23 Oct 2026, after the UX audit).
//
// The audit game (Carlton Comets, 11 & Under, nine kids): at the Q3→Q4
// break Ivy had played GS, GD and GK, never the centre third. The
// suggester gave Grace WD so she wouldn't share defence with Olivia, her
// Q3 attack partner, which left GK for Ivy, so Ivy finished GS→GD→GK→GK
// with a centre bib free. With attack and defence two bibs each, nine
// kids can't all get every third; this is best effort, and a kid with
// fewer thirds so far gets first pick.

import { describe, expect, it } from "vitest";
import {
  gamePositionCounts,
  lastQuarterThirds,
  lastQuarterTeammatesInThird,
  normaliseGenericLineup,
  playerThirdMs,
  replayNetballGame,
  splitQuarterSegments,
  suggestNetballLineup,
  type GenericLineup,
  type QuarterSub,
} from "@/lib/sports/netball/fairness";
import { netballWeights, type NetballPlaybookInput } from "@/lib/sports/netball/engine";
import { primaryThirdFor } from "@/lib/sports/netball";
import type { GameEvent } from "@/lib/types";

type Third = "attack-third" | "centre-third" | "defence-third";
const third = primaryThirdFor as (p: string) => Third | null;
const BIBS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"];
const lineup = (bibs: Record<string, string>, bench: string[]): GenericLineup => ({
  positions: Object.fromEntries(BIBS.map((b) => [b, [bibs[b]]])),
  bench,
});

// The audit game's lineups (game f1bdb6f8, 23 Oct 2026), kids by first name.
const Q1 = lineup({ gs: "ivy", ga: "chloe", wa: "amelia", c: "olivia", wd: "harper", gd: "lily", gk: "sienna" }, ["grace", "emily"]);
const Q1_SUBS: QuarterSub[] = [
  { positionId: "wa", outPlayerId: "amelia", inPlayerId: null, atMs: 36_280 },
  { positionId: "wa", outPlayerId: null, inPlayerId: "grace", atMs: 36_280 },
];
const Q2 = lineup({ gs: "sophie", ga: "emily", wa: "grace", c: "chloe", wd: "sienna", gd: "ivy", gk: "harper" }, ["olivia", "lily", "amelia"]);
const Q3 = lineup({ gs: "olivia", ga: "grace", wa: "chloe", c: "lily", wd: "sienna", gd: "emily", gk: "ivy" }, ["sophie", "harper", "amelia"]);

let t = 0;
const ev = (type: string, metadata: Record<string, unknown> = {}, player_id: string | null = null): GameEvent =>
  ({
    id: `e${t}`,
    game_id: "g",
    type,
    player_id,
    metadata,
    created_by: "u",
    created_at: new Date(Date.UTC(2026, 9, 22, 21, 0, t++)).toISOString(),
  }) as GameEvent;

const events: GameEvent[] = [
  ev("lineup_set", { lineup: Q1 }),
  ev("quarter_start", { quarter: 1 }),
  ev("injury", { injured: true, quarter: 1, elapsed_ms: 36_280 }, "amelia"),
  ev("player_arrived", { quarter: 1, elapsed_ms: 36_280 }, "sophie"),
  ev("quarter_end", { quarter: 1, elapsed_ms: 600_000 }),
  ev("period_break_swap", { lineup: Q2, midQuarterSubs: Q1_SUBS }),
  ev("quarter_start", { quarter: 2 }),
  ev("quarter_end", { quarter: 2, elapsed_ms: 600_000 }),
  ev("period_break_swap", { lineup: Q3, midQuarterSubs: [] }),
  ev("quarter_start", { quarter: 3 }),
  ev("quarter_end", { quarter: 3, elapsed_ms: 600_000 }),
];
const pool = ["ivy", "sienna", "chloe", "grace", "harper", "lily", "olivia", "emily", "sophie"];

/** The Q4 suggestion, built as NetballQuarterBreak builds it. */
function suggestQ4(playbook?: NetballPlaybookInput): GenericLineup {
  const stats = playerThirdMs(events, null, 600, third, {
    segments: splitQuarterSegments(normaliseGenericLineup(Q3), 600_000, []),
  });
  const totalMs: Record<string, number> = {};
  stats.forEach((s, pid) => (totalMs[pid] = s.attack + s.centre + s.defence));
  return suggestNetballLineup({
    playerIds: pool,
    positions: BIBS,
    season: {},
    thisGame: gamePositionCounts(events),
    isAllowed: () => true,
    seed: 4,
    thirdOf: third,
    lastQuarterThird: lastQuarterThirds(events, third),
    previousTeammates: lastQuarterTeammatesInThird(events, third),
    thisGameTotalMs: totalMs,
    lastSubbedOnMs: replayNetballGame(events).lastSubbedOnMs,
    playbook: playbook ? { ...playbook, previousLineup: Q3 } : undefined,
  });
}

const thirdOfKid = (l: GenericLineup, kid: string): Third | null => {
  for (const [bib, ids] of Object.entries(l.positions)) if (ids.includes(kid)) return third(bib);
  return null;
};

const BY_THIRDS: NetballPlaybookInput = {
  strategy: "by-thirds",
  seasonWeight: 0,
  unit: "third",
  periodMs: 600_000,
  roleUnit: "line",
  roles: {},
};

describe("By thirds: a new third outranks splitting partners", () => {
  for (const [name, playbook] of [
    ["with no How we play", undefined],
    ["with How we play: By thirds", BY_THIRDS],
  ] as const) {
    it(`${name}: Ivy (GS, GD, GK) gets a centre bib in Q4, and Grace her first defence quarter`, () => {
      const q4 = suggestQ4(playbook);
      expect(thirdOfKid(q4, "ivy")).toBe("centre-third");
      expect(thirdOfKid(q4, "grace")).toBe("defence-third");
    });

    it(`${name}: nobody on court in Q4 is given a third they've played when a free bib is one they haven't`, () => {
      // Best effort: any kid repeating a third is one whose missing thirds
      // were all taken by kids who also hadn't played them.
      const q4 = suggestQ4(playbook);
      const played = gamePositionCounts(events);
      const thirdsOf = (kid: string) => new Set(Object.keys(played[kid] ?? {}).map((b) => third(b)));
      const placed = new Map<Third, string[]>();
      for (const [bib, ids] of Object.entries(q4.positions)) for (const id of ids) placed.set(third(bib)!, [...(placed.get(third(bib)!) ?? []), id]);
      for (const [bib, ids] of Object.entries(q4.positions)) {
        const kid = ids[0];
        if (!thirdsOf(kid).has(third(bib))) continue;
        const missing = (["attack-third", "centre-third", "defence-third"] as Third[]).filter((x) => !thirdsOf(kid).has(x));
        for (const m of missing) {
          // Every bib in the third they're missing went to a kid who needed it too.
          for (const other of placed.get(m) ?? []) expect(thirdsOf(other).has(m), `${kid} at ${bib}; ${other} in ${m}`).toBe(false);
        }
      }
    });
  }

  it("the weights: a new third beats the partner penalty, even with two partners in it", () => {
    const w = netballWeights("by-thirds");
    expect(w.unplayedThird + 2 * w.teammate).toBeGreaterThan(w.sameThirdAsLast);
    expect(w.unplayedThird + 2 * w.teammate + w.sameThirdAsLast).toBeGreaterThan(0);
  });

  it("among kids with the same time, the one with the fewest thirds so far plays", () => {
    // Three kids, all 20 minutes, two bibs left: Bea has only played
    // attack; Ana and Cal two thirds each. Whatever the shuffle, Bea plays.
    const thisGame = { ana: { gs: 1, c: 1 }, bea: { gs: 1, ga: 1 }, cal: { gk: 1, wd: 1 } };
    for (let seed = 0; seed < 20; seed++) {
      const l = suggestNetballLineup({
        playerIds: ["ana", "bea", "cal"],
        positions: ["wa", "gd"],
        season: {},
        thisGame,
        isAllowed: () => true,
        seed,
        thirdOf: third,
        lastQuarterThird: {},
        previousTeammates: {},
        thisGameTotalMs: { ana: 1_200_000, bea: 1_200_000, cal: 1_200_000 },
      });
      expect(l.bench, `seed ${seed}`).not.toContain("bea");
    }
  });
});
