// Goals and points nobody was named for (UX round 2, 24 Oct 2026):
// futsal's 2–4 said "Goals: Harper (#7)" and "Who found the net: 1
// scorer", and basketball's 6 said "Points: Matilda 3, Kai 2". Touch and
// Oztag already close the list with "+1 try (no scorer)"; the soccer
// family and basketball now do too, and the game page's scorers card
// gets a "No scorer" row, so each adds up to the score.

import { describe, expect, it } from "vitest";
import { buildSoccerSummary } from "@/lib/sports/soccer/summary";
import { replaySoccerGame } from "@/lib/sports/soccer/replay";
import { buildBasketballSummary } from "@/lib/sports/basketball/summary";
import { replayBasketballGame } from "@/lib/sports/basketball/replay";
import { unnamedScoreFromEvents } from "@/lib/results";
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

/** Harper scores, then a goal nobody was named for, then one of theirs. */
function futsalGame() {
  const g = soccerGame();
  g.lineup(SEVEN);
  g.start(1);
  g.add("goal", { quarter: 1, elapsed_ms: 60_000 }, "a1");
  g.add("goal", { quarter: 1, elapsed_ms: 120_000 });
  g.add("opponent_goal", { quarter: 1, elapsed_ms: 180_000 });
  g.end(1, 20);
  return g;
}

/** Matilda 3, Kai 2, and a free throw nobody was named for. */
function basketballSix() {
  const g = basketballGame();
  g.lineup({ ...LINES, bench: ["f"] });
  g.start(1);
  g.basket("three_pointer", 1, "a");
  g.basket("two_pointer", 2, "b");
  g.basket("free_throw", 3);
  g.end(1, 20);
  return g;
}

describe("the soccer family's share text", () => {
  it("closes the scorers with the goals nobody was named for", () => {
    const text = buildSoccerSummary({
      emoji: "⚽",
      teamName: "Us",
      opponentName: "Them",
      trackScoring: true,
      state: replaySoccerGame(futsalGame().events),
      squad: [player("a1", "Harper Ng", 7)],
      presentIds: [],
    });
    expect(text).toContain("Us 2 def Them 1");
    expect(text).toContain("⚽ Goals: Harper (#7), +1 goal (no scorer)");
  });
});

describe("basketball's share text", () => {
  it("closes the scorers with the points nobody was named for", () => {
    const text = buildBasketballSummary({
      teamName: "Us",
      opponentName: "Them",
      trackScoring: true,
      state: replayBasketballGame(basketballSix().events),
      squad: [player("a", "Matilda Ray", 4), player("b", "Kai Moss", 9)],
      presentIds: [],
    });
    expect(text).toContain("Us 6 def Them 0");
    expect(text).toContain("🏀 Points: Matilda (#4) 3, Kai (#9) 2, +1 pt (no scorer)");
  });
});

describe("the scorers card's No scorer row", () => {
  it("counts a futsal goal nobody was named for", () => {
    expect(unnamedScoreFromEvents("futsal", futsalGame().events)).toEqual({ detail: "1 goal", points: 1 });
  });

  it("counts basketball points nobody was named for", () => {
    expect(unnamedScoreFromEvents("basketball", basketballSix().events)).toEqual({ detail: "1 pt", points: 1 });
  });

  it("is nothing when every score has a name", () => {
    const g = soccerGame();
    g.lineup(SEVEN);
    g.start(1);
    g.add("goal", { quarter: 1, elapsed_ms: 60_000 }, "a1");
    g.end(1, 20);
    expect(unnamedScoreFromEvents("hockey", g.events)).toBeNull();
  });
});
