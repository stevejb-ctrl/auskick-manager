// ─── Sub suggestions fill empty spots first ──────────────────
// Round 3 edge cases, 24 Oct 2026:
//
//   - Basketball P1: 2 on court, 3 empty spots, Archie on the bench. The
//     card said "Ruby → Archie"; following it took Ruby off a short side
//     and cost her 3:36. A late arrival got the same.
//   - Hockey P1: the keeper was hurt with nobody to replace them. The goal
//     stayed empty with two kids on the bench, and the card offered only
//     outfield swaps.
//   - Oztag had the same in round 2.
//
// Each sport's suggester now fills empty spots first (nobody off): the
// goal before the field, a keen keeper first. Swaps come after.

import { describe, expect, it } from "vitest";
import { replayBasketballGame } from "@/lib/sports/basketball/replay";
import { suggestBasketballSubs } from "@/lib/sports/basketball/suggest";
import { replaySoccerGame } from "@/lib/sports/soccer/replay";
import { suggestSoccerWindowBatch } from "@/lib/sports/soccer/suggest";
import { replayTouchGame } from "@/lib/sports/touch/replay";
import { suggestTouchSubs } from "@/lib/sports/touch/suggest";
import { rugbyFills } from "@/lib/sports/rugby/fills";
import { MIN, game as basketballGame } from "@/lib/sports/basketball/__tests__/basketballGame";
import { SEVEN, game as soccerGame } from "@/lib/sports/soccer/__tests__/soccerGame";
import { game as touchGame } from "@/lib/sports/touch/__tests__/touchGame";

describe("basketball", () => {
  it("brings the bench kid on into an empty spot, and takes nobody off", () => {
    // Five on; three hurt in turn with nobody to replace them; Archie
    // (a late arrival) on the bench.
    const g = basketballGame();
    g.lineup({ lines: { guard: [], forward: [], court: ["ruby", "b", "c", "d", "e"] }, bench: [] });
    g.start(1);
    for (const pid of ["c", "d", "e"]) g.add("injury", { injured: true, elapsed_ms: 2 * MIN }, pid);
    g.add("player_arrived", { elapsed_ms: 3 * MIN }, "archie");
    const nowMs = 8 * MIN;
    const subs = suggestBasketballSubs({
      state: replayBasketballGame(g.events, { nowMs }),
      nowMs,
      strategy: "minutes",
      foulOutAt: 0,
      spots: { guard: 0, forward: 0, court: 5 },
    } as Parameters<typeof suggestBasketballSubs>[0]);
    expect(subs).toEqual([{ off_player_id: null, on_player_id: "archie", line: "court" }]);
  });
});

describe("soccer family (hockey)", () => {
  // Hockey's 7: keeper k, then 2-3-1; b2 a keen keeper on the bench.
  const keen = { keenKeepers: ["b2"] };

  it("an empty goal is filled first, by a keen keeper", () => {
    const g = soccerGame();
    g.lineup(SEVEN);
    g.start(1);
    g.add("injury", { injured: true, elapsed_ms: 2 * 60_000 }, "k");
    const nowMs = 3 * 60_000;
    const subs = suggestSoccerWindowBatch({
      state: replaySoccerGame(g.events, { nowMs }),
      nowMs,
      prefs: keen,
      spots: { keeper: true, lines: { def: 2, mid: 3, att: 1, field: 0 } },
    } as Parameters<typeof suggestSoccerWindowBatch>[0]);
    expect(subs[0]).toEqual({ off_player_id: null, on_player_id: "b2", line: "gk" });
    // One kid in goal; the rest of the batch is ordinary swaps.
    expect(subs.filter((s) => s.line === "gk")).toHaveLength(1);
  });

  it("never puts a kid marked not in goal there", () => {
    const g = soccerGame();
    g.lineup({ ...SEVEN, bench: ["b1"] });
    g.start(1);
    g.add("injury", { injured: true, elapsed_ms: 2 * 60_000 }, "k");
    const nowMs = 3 * 60_000;
    const subs = suggestSoccerWindowBatch({
      state: replaySoccerGame(g.events, { nowMs }),
      nowMs,
      prefs: { notInGoal: ["b1"] },
      spots: { keeper: true, lines: { def: 2, mid: 3, att: 1, field: 0 } },
    } as Parameters<typeof suggestSoccerWindowBatch>[0]);
    expect(subs.filter((s) => s.line === "gk")).toEqual([]);
  });

  it("an empty outfield spot is filled before any swap", () => {
    const g = soccerGame();
    g.lineup(SEVEN);
    g.start(1);
    g.add("injury", { injured: true, elapsed_ms: 2 * 60_000 }, "d1");
    const nowMs = 6 * 60_000;
    const subs = suggestSoccerWindowBatch({
      state: replaySoccerGame(g.events, { nowMs }),
      nowMs,
      spots: { keeper: true, lines: { def: 2, mid: 3, att: 1, field: 0 } },
    } as Parameters<typeof suggestSoccerWindowBatch>[0]);
    expect(subs[0]).toEqual({ off_player_id: null, on_player_id: "b1", line: "def" });
  });
});

describe("rugby", () => {
  it("a late arrival goes on into the short side's empty spot, forwards first", () => {
    // U10 league, 11 a side (5 forwards): 10 on, one forward short.
    const fills = rugbyFills({
      lineup: { forwards: ["a", "b", "c", "d"], backs: ["e", "f", "g", "h", "i", "j"] },
      bench: ["late"],
      onFieldSize: 11,
      forwards: 5,
      msByPlayer: {},
    });
    expect(fills).toEqual([{ playerId: "late", zone: "forward" }]);
  });

  it("a full side has nothing to fill", () => {
    expect(
      rugbyFills({ lineup: { forwards: ["a"], backs: ["b"] }, bench: ["c"], onFieldSize: 2, forwards: 1, msByPlayer: {} }),
    ).toEqual([]);
  });
});

describe("touch", () => {
  it("fills an empty place before evening time", () => {
    // Six on; f hurt with nobody on for them; g and h on the bench.
    const g = touchGame();
    g.lineup({ lines: { middle: [], link: [], wing: [], field: ["a", "b", "c", "d", "e", "f"] }, bench: ["g", "h"] });
    g.start(1);
    g.injure("f", 2);
    const nowMs = 6 * MIN;
    const subs = suggestTouchSubs({
      state: replayTouchGame(g.events, { nowMs }),
      nowMs,
      strategy: "minutes",
      spots: { middle: 0, link: 0, wing: 0, field: 6 },
    } as Parameters<typeof suggestTouchSubs>[0]);
    expect(subs[0]).toEqual({ off_player_id: null, on_player_id: "g", line: "field" });
  });
});
