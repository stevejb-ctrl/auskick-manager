// A kid marked out (went home) read as injured on every tile, break and
// summary, and the summary named neither (Stagehand round 7, 28 Oct
// 2026). The replay now says who went home, and the full-time text
// says why a kid is off.

import { describe, expect, it } from "vitest";
import { buildSoccerSummary } from "@/lib/sports/soccer/summary";
import { replaySoccerGame } from "@/lib/sports/soccer/replay";
import { buildBasketballSummary } from "@/lib/sports/basketball/summary";
import { replayBasketballGame } from "@/lib/sports/basketball/replay";
import { replayGame } from "@/lib/fairness";
import type { Player } from "@/lib/types";
import { SEVEN, game as soccerGame } from "@/lib/sports/soccer/__tests__/soccerGame";
import { LINES, game as basketballGame } from "@/lib/sports/basketball/__tests__/basketballGame";

const player = (id: string, full_name: string, jersey_number: number): Player => ({
  id,
  team_id: "t1",
  full_name,
  jersey_number,
  is_active: true,
  created_by: "u1",
  created_at: "2026-10-24T00:00:00Z",
  updated_at: "2026-10-24T00:00:00Z",
});

describe("a kid who went home", () => {
  it("is gone home in the soccer replay and summary, and the hurt kid injured", () => {
    const g = soccerGame();
    g.lineup(SEVEN);
    g.start(1);
    g.add("injury", { injured: true, quarter: 1, elapsed_ms: 5 * 60_000, reason: "out" }, "d1");
    g.add("injury", { injured: true, quarter: 1, elapsed_ms: 6 * 60_000 }, "d2");
    g.end(1, 20);
    const state = replaySoccerGame(g.events);
    expect(state.wentHomeIds).toEqual(["d1"]);
    expect(state.injuredIds.sort()).toEqual(["d1", "d2"]);
    const text = buildSoccerSummary({
      emoji: "⚽",
      teamName: "Owls",
      opponentName: "Bats",
      trackScoring: false,
      state,
      squad: [player("d1", "Noah Taylor", 6), player("d2", "Ava Nguyen", 1)],
      presentIds: [],
    });
    expect(text).toContain("#6 Noah — 5:00 · went home");
    expect(text).toContain("#1 Ava — 6:00 · injured");
  });

  it("is back in play after Back on", () => {
    const g = soccerGame();
    g.lineup(SEVEN);
    g.start(1);
    g.add("injury", { injured: true, quarter: 1, elapsed_ms: 60_000, reason: "out" }, "d1");
    g.add("injury", { injured: false, quarter: 1, elapsed_ms: 120_000 }, "d1");
    expect(replaySoccerGame(g.events).wentHomeIds).toEqual([]);
  });

  it("is gone home in basketball, and a foul-out still says fouled out", () => {
    const g = basketballGame();
    g.lineup({ ...LINES, bench: ["f"] });
    g.start(1);
    const [first, second] = LINES.lines.guard;
    g.add("injury", { injured: true, quarter: 1, elapsed_ms: 60_000, reason: "out" }, first);
    g.add("injury", { injured: true, quarter: 1, elapsed_ms: 90_000, reason: "fouled_out" }, second);
    g.end(1, 20);
    const state = replayBasketballGame(g.events);
    expect(state.wentHomeIds).toEqual([first]);
    const text = buildBasketballSummary({
      teamName: "Owls",
      opponentName: "Bats",
      trackScoring: false,
      state,
      squad: [player(first, "Noah Taylor", 6), player(second, "Jack Anderson", 8)],
      presentIds: [],
    });
    expect(text).toMatch(/#6 Noah — 1:00.* · went home/);
    expect(text).toMatch(/#8 Jack — 1:30.* · fouled out/);
  });

  it("is gone home in the AFL replay", () => {
    const at = (n: number) => new Date(Date.UTC(2026, 9, 17, 9, 0, n)).toISOString();
    const lineup = { back: ["a"], hback: [], mid: ["b"], hfwd: [], fwd: ["c"], bench: ["d"] };
    const state = replayGame([
      { id: "1", game_id: "g", type: "lineup_set", player_id: null, metadata: { lineup }, created_by: "u", created_at: at(1) },
      { id: "2", game_id: "g", type: "quarter_start", player_id: null, metadata: { quarter: 1 }, created_by: "u", created_at: at(2) },
      { id: "3", game_id: "g", type: "injury", player_id: "a", metadata: { injured: true, quarter: 1, elapsed_ms: 1000, reason: "out" }, created_by: "u", created_at: at(3) },
      { id: "4", game_id: "g", type: "injury", player_id: "b", metadata: { injured: true, quarter: 1, elapsed_ms: 2000 }, created_by: "u", created_at: at(4) },
    ] as Parameters<typeof replayGame>[0]);
    expect(state.wentHomeIds).toEqual(["a"]);
    expect(state.injuredIds.sort()).toEqual(["a", "b"]);
  });
});
