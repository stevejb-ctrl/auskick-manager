// Every per-sport dispatcher has a branch for each sport and fails on
// anything else (cross-sport audit, 14 Oct 2026). They used to end in
// "everything else is AFL" (scores, the game plan, the season grid) or
// "everything else is league" (season time), so a sport without its own
// branch would have run under another sport's rules without a word.
// Touch football stands in for a sport Siren doesn't know.

import { describe, expect, it } from "vitest";
import { aflBranch, noSportBranch } from "@/lib/sports";
import { scoreFromEvents } from "@/lib/results";
import { projectGamePlan } from "@/lib/game-plan/project";
import { gridUnits } from "@/lib/playbook/seasonGrid";
import { gameTimeByUnit } from "@/lib/playbook/seasonTime";
import type { GameEvent } from "@/lib/types";

const UNKNOWN = "touch_football" as never;

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
    expect(() => aflBranch(UNKNOWN)).toThrow(/touch_football/);
    expect(() => noSportBranch(UNKNOWN, "the test")).toThrow(/the test.*touch_football/);
  });

  it("never score an unknown sport as AFL", () => {
    expect(() => scoreFromEvents(UNKNOWN, [])).toThrow(/touch_football/);
  });

  it("never plan an unknown sport as AFL", () => {
    expect(() => projectGamePlan({ sport: UNKNOWN } as never)).toThrow(/touch_football/);
  });

  it("never grid an unknown sport as AFL", () => {
    expect(() => gridUnits(UNKNOWN, null)).toThrow(/touch_football/);
  });

  it("never time an unknown sport as league", () => {
    expect(() => gameTimeByUnit(UNKNOWN, [event], "line", 600)).toThrow(/touch_football/);
  });
});
