import { describe, expect, it } from "vitest";
import { owedPlayers, type SeasonGrid } from "@/lib/playbook/seasonGrid";

const row = (name: string, biggestGap: number) => ({ playerId: name, name, totalMs: 0, cells: [], biggestGap });

describe("owedPlayers", () => {
  it("names the kids owed a period or more, most owed first", () => {
    const grid: SeasonGrid = {
      units: [],
      rows: [row("Zara", 1), row("Archie", 2), row("Ava", 0.5), row("Mia", 1)],
      within: 1,
      total: 4,
    };
    expect(owedPlayers(grid)).toEqual(["Archie", "Mia", "Zara"]);
  });

  it("is empty when everyone is within a period of even", () => {
    expect(owedPlayers({ units: [], rows: [row("Ava", 0), row("Leo", 0.9)], within: 2, total: 2 })).toEqual([]);
  });
});
