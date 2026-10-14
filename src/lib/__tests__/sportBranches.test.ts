// Every per-sport dispatcher has a branch for each sport and fails on
// anything else (cross-sport audit, 14 Oct 2026). They used to end in
// "everything else is AFL" (scores, the game plan, the season grid) or
// "everything else is league" (season time), so a sport without its own
// branch — rugby union is next — would have run under another sport's
// rules without a word.

import { describe, expect, it } from "vitest";
import { aflBranch, noSportBranch } from "@/lib/sports";
import { scoreFromEvents } from "@/lib/results";
import { projectGamePlan } from "@/lib/game-plan/project";
import { gridUnits } from "@/lib/playbook/seasonGrid";
import { gameTimeByUnit } from "@/lib/playbook/seasonTime";
import type { GameEvent } from "@/lib/types";

const UNION = "rugby_union" as never;

const event = {
  id: "e1",
  game_id: "g1",
  type: "quarter_start",
  player_id: null,
  metadata: { quarter: 1 },
  created_by: "u1",
  created_at: new Date(0).toISOString(),
} as unknown as GameEvent;

describe("sport dispatchers", () => {
  it("only take AFL into an AFL branch", () => {
    expect(aflBranch("afl")).toBe("afl");
    expect(() => aflBranch(UNION)).toThrow(/rugby_union/);
    expect(() => noSportBranch(UNION, "the test")).toThrow(/the test.*rugby_union/);
  });

  it("never score an unknown sport as AFL", () => {
    expect(() => scoreFromEvents(UNION, [])).toThrow(/rugby_union/);
  });

  it("never plan an unknown sport as AFL", () => {
    expect(() => projectGamePlan({ sport: UNION } as never)).toThrow(/rugby_union/);
  });

  it("never grid an unknown sport as AFL", () => {
    expect(() => gridUnits(UNION, null)).toThrow(/rugby_union/);
  });

  it("never time an unknown sport as league", () => {
    expect(() => gameTimeByUnit(UNION, [event], "line", 600)).toThrow(/rugby_union/);
  });
});
