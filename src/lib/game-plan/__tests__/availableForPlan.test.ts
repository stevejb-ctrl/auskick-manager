// The next-period planner must only offer present + healthy players.
// Regression: a short-squad game showed the full squad, including
// injured and away (didn't-attend) players (Steve 2026-06-15).

import { describe, it, expect } from "vitest";
import { availablePlayersForPlan } from "@/lib/game-plan/availableForPlan";

const squad = [
  { id: "onfield" },
  { id: "benched" },
  { id: "injured" },
  { id: "loaned" },
  { id: "away" }, // never made it into the lineup
];

// In the game = on field + bench (+ the injured/loaned, who are still
// physically present on the bench). "away" is NOT in the lineup.
const inGameIds = new Set(["onfield", "benched", "injured", "loaned"]);
const injured = new Set(["injured"]);
const loaned = new Set(["loaned"]);

describe("availablePlayersForPlan", () => {
  it("keeps only present + healthy players", () => {
    const ids = availablePlayersForPlan(squad, inGameIds, injured, loaned).map(
      (p) => p.id,
    );
    expect(ids).toEqual(["onfield", "benched"]);
  });

  it("excludes away players (not in the lineup)", () => {
    const ids = availablePlayersForPlan(squad, inGameIds, injured, loaned).map((p) => p.id);
    expect(ids).not.toContain("away");
  });

  it("excludes injured and loaned players", () => {
    const ids = availablePlayersForPlan(squad, inGameIds, injured, loaned).map((p) => p.id);
    expect(ids).not.toContain("injured");
    expect(ids).not.toContain("loaned");
  });

  it("returns everyone when no one is sidelined or away", () => {
    const all = new Set(squad.map((p) => p.id));
    expect(
      availablePlayersForPlan(squad, all, new Set(), new Set()).map((p) => p.id),
    ).toEqual(["onfield", "benched", "injured", "loaned", "away"]);
  });
});
