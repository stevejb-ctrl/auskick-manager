// ─── A kid just taken off isn't suggested straight back on ───
// Round 2 usability, 24 Oct 2026 (P3): futsal, after Mateo → Ollie the
// card at once suggested Kai → Mateo; touch, 6 s after Zara came off,
// "Ava → Zara". A kid who goes off rests for a cool-down (the live games
// pass one sub interval) before a suggestion brings them back on. The
// mixed rule's fixes still may (the rule outweighs rest).

import { describe, expect, it } from "vitest";
import { suggestTouchSubs } from "@/lib/sports/touch/suggest";
import { replayTouchGame } from "@/lib/sports/touch/replay";
import { suggestSoccerWindowBatch } from "@/lib/sports/soccer/suggest";
import { replaySoccerGame } from "@/lib/sports/soccer/replay";
import { game as touchGame } from "@/lib/sports/touch/__tests__/touchGame";
import { MIN, SEVEN, game as soccerGame } from "@/lib/sports/soccer/__tests__/soccerGame";

const REST = 4 * MIN;

describe("touch: the cool-down after a hand sub", () => {
  // Six on (Zara among them), Yas on the bench. 5:00 the coach takes
  // Zara off for Yas.
  const g = touchGame();
  g.lineup({ lines: { middle: [], link: [], wing: [], field: ["zara", "b", "c", "d", "e", "f"] }, bench: ["yas"] });
  g.start(1);
  g.swap("zara", "yas", 5);
  const at = (ms: number) => suggestTouchSubs({ state: replayTouchGame(g.events, { nowMs: ms }), nowMs: ms, strategy: "minutes", restMs: REST } as Parameters<typeof suggestTouchSubs>[0]);

  it("doesn't bring Zara back on 6 seconds later", () => {
    expect(at(5 * MIN + 6_000).map((s) => s.on_player_id)).not.toContain("zara");
  });

  it("brings her back once she's rested", () => {
    expect(at(9 * MIN + 30_000).map((s) => s.on_player_id)).toContain("zara");
  });
});

describe("soccer: the cool-down after a hand sub", () => {
  // MiniRoos rolling subs: 5:00 the coach takes d1 off for b1.
  const g = soccerGame();
  g.lineup(SEVEN);
  g.start(1);
  g.swap("d1", "b1", 5);
  const at = (ms: number) =>
    suggestSoccerWindowBatch({ state: replaySoccerGame(g.events, { nowMs: ms }), nowMs: ms, restMs: REST } as Parameters<typeof suggestSoccerWindowBatch>[0]);

  it("doesn't bring d1 back on 6 seconds later", () => {
    const batch = at(5 * MIN + 6_000);
    expect(batch.map((s) => s.on_player_id)).toContain("b2");
    expect(batch.map((s) => s.on_player_id)).not.toContain("d1");
  });

  it("brings d1 back once rested", () => {
    expect(at(9 * MIN + 30_000).map((s) => s.on_player_id)).toContain("d1");
  });
});
