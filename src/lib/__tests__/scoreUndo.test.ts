// Which score an undo removes (Stagehand round 2: the netball break's
// score review still counted an undone goal). One rule everywhere: an
// undo that names its target removes that score; one that doesn't
// removes the latest score still standing.

import { describe, expect, it } from "vitest";
import { pairScoreUndos } from "@/lib/live/scoreUndo";
import { replayNetballGame } from "@/lib/sports/netball/fairness";
import type { GameEvent, GameEventType } from "@/lib/types";

let n = 0;
function ev(type: GameEventType, metadata: Record<string, unknown> = {}, player_id: string | null = null, id?: string): GameEvent {
  n++;
  return {
    id: id ?? `e${n}`,
    game_id: "g",
    type,
    player_id,
    metadata,
    created_by: null,
    created_at: new Date(2026, 0, 1, 9, 0, n).toISOString(),
  };
}
const SCORES = new Set(["goal", "opponent_goal"]);

describe("pairScoreUndos", () => {
  it("an undo without a target takes back the latest standing score", () => {
    const events = [ev("goal", {}, "a", "g1"), ev("goal", {}, "b", "g2"), ev("opponent_goal", {}, null, "o1"), ev("score_undo", {}, null, "u1")];
    expect(pairScoreUndos(events, SCORES)).toEqual(new Map([["u1", "o1"]]));
  });

  it("an undo that names its target takes back that one, and the next bare undo the latest left", () => {
    const events = [
      ev("goal", {}, "a", "g1"),
      ev("goal", {}, "b", "g2"),
      ev("opponent_goal", {}, null, "o1"),
      ev("score_undo", { target_event_id: "g1" }, null, "u1"),
      ev("score_undo", {}, null, "u2"),
    ];
    expect(pairScoreUndos(events, SCORES)).toEqual(new Map([["u1", "g1"], ["u2", "o1"]]));
  });
});

describe("replayNetballGame honours targeted undos", () => {
  it("Fix scores deleting an earlier goal removes that goal, not the latest score", () => {
    const events = [
      ev("goal", {}, "a", "g1"),
      ev("goal", {}, "b", "g2"),
      ev("opponent_goal", {}, null, "o1"),
      ev("score_undo", { target_event_id: "g1", original_type: "goal" }),
    ];
    const s = replayNetballGame(events);
    expect(s.teamScore.goals).toBe(1);
    expect(s.opponentScore.goals).toBe(1);
    expect(s.playerGoals.a ?? 0).toBe(0);
    expect(s.playerGoals.b).toBe(1);
  });

  it("a bare undo still takes back the latest score", () => {
    const s = replayNetballGame([ev("goal", {}, "a"), ev("opponent_goal"), ev("score_undo", { sport: "netball" })]);
    expect(s.teamScore.goals).toBe(1);
    expect(s.opponentScore.goals).toBe(0);
  });
});
