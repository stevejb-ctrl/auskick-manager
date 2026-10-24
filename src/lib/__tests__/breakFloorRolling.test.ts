// ─── The break's 50% floor under rolling subs ────────────────
// Round 2 usability, 24 Oct 2026 (basketball P1, touch and Oztag P2):
// the break's rule check said kids starting the half on the bench
// "can't reach 50% now" and made the coach "Start anyway", though
// rolling subs bring them on in the half. Soccer was fixed in round 1
// (benchReachMs, 06594687); basketball, touch and Oztag never passed
// it. A late arrival was also held to the whole game, not the time
// they could play, as How we played holds them.

import { describe, expect, it } from "vitest";
import { awayMsSoFar, benchReachMs } from "@/lib/live/break/floor";
import { basketballBreakCheck } from "@/lib/sports/basketball/breakCheck";
import { replayBasketballGame } from "@/lib/sports/basketball/replay";
import { touchBreakCheck } from "@/lib/sports/touch/breakCheck";
import { replayTouchGame } from "@/lib/sports/touch/replay";
import { touchAgeGroup } from "@/lib/sports/touch/family";
import { COURT, MIN, game as basketballGame } from "@/lib/sports/basketball/__tests__/basketballGame";
import { FIELD, game as touchGame } from "@/lib/sports/touch/__tests__/touchGame";

const floorOf = (items: { id: string }[]) => items.find((i) => i.id === "min-game-time");

describe("benchReachMs", () => {
  it("the whole period for rolling subs, from the first window, none at the breaks", () => {
    expect(benchReachMs(20 * MIN, 0)).toBe(20 * MIN);
    expect(benchReachMs(20 * MIN, 5 * MIN)).toBe(15 * MIN);
    expect(benchReachMs(20 * MIN, null)).toBe(0);
  });
});

describe("basketball's break check", () => {
  const HALF = 20 * MIN;

  it("a kid starting the 2nd half on the bench can still reach 50% (Repeat at half time)", () => {
    // a–e played all of H1; f–j sat it out and start H2 on the bench.
    const g = basketballGame();
    g.lineup(COURT);
    g.start(1);
    g.end(1, 20);
    const state = replayBasketballGame(g.events);
    const items = basketballBreakCheck({
      lineup: COURT,
      state,
      sidelined: new Set(),
      court: true,
      period: 2,
      periodCount: 2,
      periodMs: HALF,
      names: { f: "Matilda", g: "Chloe" },
    });
    expect(floorOf(items)).toMatchObject({ status: "ok" });
  });

  it("a late arrival is held to the time they could play", () => {
    // Quarters, five kids all game: Chloe (k) got here 5 minutes into Q3
    // and starts Q4 on the bench. She can play 10 of the 15 minutes left
    // to her.
    const Q = 10 * MIN;
    const five = { ...COURT, bench: [] };
    const g = basketballGame();
    g.lineup(five);
    g.start(1);
    g.end(1, 10);
    g.start(2);
    g.end(2, 10);
    g.start(3);
    g.add("player_arrived", { quarter: 3, elapsed_ms: 5 * MIN }, "k");
    g.end(3, 10);
    const state = replayBasketballGame(g.events);
    const awayMs = awayMsSoFar(g.events, () => Q, 3);
    expect(awayMs).toEqual({ k: 25 * MIN });
    const items = basketballBreakCheck({
      lineup: { ...five, bench: ["k"] },
      state,
      sidelined: new Set(),
      court: true,
      period: 4,
      periodCount: 4,
      periodMs: Q,
      names: { k: "Chloe" },
      awayMs,
    } as Parameters<typeof basketballBreakCheck>[0]);
    expect(floorOf(items)).toMatchObject({ status: "ok" });
  });
});

describe("touch's break check", () => {
  const ageGroup = touchAgeGroup("touch", "U11");
  const HALF = 15 * MIN;

  it("kids on 9:08 of 30 who start the 2nd half on the bench can still reach 15:00 (Suggested at half time)", () => {
    // g and h came on at 5:52 of H1 for e and f; at the break they start
    // H2 on the bench.
    const g = touchGame();
    g.lineup(FIELD);
    g.start(1);
    g.add("swap", { off_player_id: "e", on_player_id: "g", elapsed_ms: 5 * MIN + 52_000 });
    g.add("swap", { off_player_id: "f", on_player_id: "h", elapsed_ms: 5 * MIN + 52_000 });
    g.end(1, 15);
    const state = replayTouchGame(g.events);
    expect(state.ms.g?.field).toBe(9 * MIN + 8_000);
    const h2 = {
      lines: { middle: [], link: [], wing: [], field: ["a", "b", "c", "d", "e", "f"] },
      bench: ["g", "h", "i", "j", "k", "l"],
    };
    const items = touchBreakCheck({
      lineup: h2,
      state,
      ageGroup: { ...ageGroup, periodCount: 2 },
      size: 6,
      sidelined: new Set(),
      field: true,
      period: 2,
      periodMs: HALF,
      names: { g: "Noah", h: "Jack" },
    });
    expect(floorOf(items)).toMatchObject({ status: "ok" });
  });
});
