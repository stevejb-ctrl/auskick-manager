import { describe, expect, it } from "vitest";
import { gridUnits, seasonBalanceGrid } from "@/lib/playbook/seasonGrid";

const MIN = 60_000;

describe("season balance grid", () => {
  it("lists kids who've played, owed cells, and the team line", () => {
    const P = 10 * MIN;
    const grid = seasonBalanceGrid({
      time: {
        mia: { "attack-third": 4 * P, "centre-third": 2 * P },
        ava: { "attack-third": 2 * P, "centre-third": 2 * P, "defence-third": 2 * P },
      },
      players: [
        { id: "mia", name: "Mia" },
        { id: "ava", name: "Ava" },
        { id: "zoe", name: "Zoe" },
      ],
      columns: gridUnits("netball", "third").columns,
      periodMs: P,
    });
    expect(grid.rows.map((r) => r.name)).toEqual(["Mia", "Ava"]);
    expect(grid.rows[0].cells.map((c) => c.owed)).toEqual([-2, 0, 2]);
    expect(grid.rows[0].biggestGap).toBe(2);
    expect([grid.within, grid.total]).toEqual([1, 2]);
    expect(gridUnits("afl", "position").columns.map((c) => c.key)).toEqual(["fwd", "mid", "back"]);
  });
});
