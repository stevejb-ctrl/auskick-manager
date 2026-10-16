// scripts/lib/game-defaults.mjs mirrors each age group's game defaults
// for .mjs seed scripts, which can't import the sport registry. This
// keeps the mirror in step: every age group of every sport, same
// on-field size and sub interval as newGameDefaults gives a new game.

import { describe, expect, it } from "vitest";
import { ALL_SPORTS } from "@/lib/sports/registry";
import { newGameDefaults } from "@/lib/games/newGameDefaults";
import { GAME_DEFAULTS, gameDefaults } from "../../../scripts/lib/game-defaults.mjs";

describe("scripts' game defaults", () => {
  for (const sport of ALL_SPORTS) {
    const ids = [...sport.ageGroups, ...(sport.legacyAgeGroups ?? [])].map((a) => a.id);

    it(`${sport.id}: one entry per age group`, () => {
      expect(Object.keys(GAME_DEFAULTS[sport.id as keyof typeof GAME_DEFAULTS]).sort()).toEqual([...ids].sort());
    });

    it.each(ids)(`${sport.id} %s matches newGameDefaults`, (ageGroup) => {
      expect(gameDefaults(sport.id, ageGroup)).toEqual(newGameDefaults(sport.id, ageGroup));
    });
  }

  it("refuses an age group from another sport", () => {
    expect(() => gameDefaults("netball", "U10")).toThrow(/No game defaults for netball U10/);
  });
});
