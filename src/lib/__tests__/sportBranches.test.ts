// Every per-sport dispatcher has a branch for each sport and fails on
// anything else (cross-sport audit, 14 Oct 2026). They used to end in
// "everything else is AFL" (scores, the game plan, the season grid) or
// "everything else is league" (season time), so a sport without its own
// branch would have run under another sport's rules without a word.
// Touch football stands in for a sport Siren doesn't know.
//
// Football (soccer) is known but its screens aren't built yet (soccer
// plan, phases 2–3): each of those branches fails for it by name.

import { describe, expect, it } from "vitest";
import { aflBranch, noSportBranch, sportNotBuilt } from "@/lib/sports";
import { effectivePolicy, getSportPlaybook } from "@/lib/playbook";
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

describe("Football (soccer)'s unbuilt surfaces", () => {
  const unbuilt = (where: string) => `${where}: Football (soccer) isn't built yet`;

  it("says which surface isn't built, by the sport's name", () => {
    expect(() => sportNotBuilt("soccer", "The live game")).toThrow(unbuilt("The live game"));
  });

  it("never plans, grids or plays soccer under another sport's rules", () => {
    expect(() => projectGamePlan({ sport: "soccer" } as never)).toThrow(unbuilt("projectGamePlan"));
  });

  it("grids soccer's own lines for season balance", () => {
    expect(gridUnits("soccer", "line").columns.map((c) => c.key)).toEqual(["att", "mid", "def"]);
  });

  it("has soccer's own How we play: keeper strategies, goal roles, MiniRoos laws", () => {
    const playbook = getSportPlaybook("soccer");
    expect(playbook.sport).toBe("soccer");
    const policy = effectivePolicy("soccer", "U9", {});
    expect(playbook.strategies(policy).map((s) => s.id)).toEqual(["turns", "keepers"]);
    expect(playbook.recommendedStrategy(policy)).toBe("turns");
    expect(playbook.positionModel(policy, 7).lines.map((l) => l.id)).toEqual(["gk"]);
    expect(playbook.lawRules(policy, playbook.agePolicy("U9")).map((r) => r.id)).toContain("miniroos-scores");
    const u6 = effectivePolicy("soccer", "U6", {});
    expect(playbook.strategies(u6).map((s) => s.id)).toEqual(["minutes"]);
    expect(playbook.positionModel(u6, 4).lines).toEqual([]);
    const u14 = effectivePolicy("soccer", "U14", {});
    expect(playbook.recommendedStrategy(u14)).toBe("keepers");
    expect(playbook.lawRules(u14, playbook.agePolicy("U14"))).toEqual([]);
  });
});
