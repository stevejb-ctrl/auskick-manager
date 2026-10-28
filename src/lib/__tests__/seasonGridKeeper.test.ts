// Soccer's season balance read "12 of 12 kids within a half of even" in
// a squad of 13: the kid who only kept goal had no line time, so the
// grid left her out (Stagehand round 7, 28 Oct 2026).

import { describe, expect, it } from "vitest";
import { seasonBalanceGrid } from "@/lib/playbook/seasonGrid";

const MIN = 60_000;

describe("seasonBalanceGrid", () => {
  it("shows a kid who only kept goal, and counts her", () => {
    const grid = seasonBalanceGrid({
      time: {
        ava: { gk: 9 * MIN },
        jack: { att: 10 * MIN, mid: 10 * MIN, def: 10 * MIN },
      },
      players: [
        { id: "ava", name: "Ava" },
        { id: "jack", name: "Jack" },
        { id: "mia", name: "Mia" },
      ],
      columns: [
        { key: "att", label: "Att" },
        { key: "mid", label: "Mid" },
        { key: "def", label: "Def" },
      ],
      periodMs: 30 * MIN,
    });
    expect(grid.rows.map((r) => r.playerId)).toEqual(["ava", "jack"]);
    expect(grid.rows[0].cells.map((c) => c.ms)).toEqual([0, 0, 0]);
    expect(grid.total).toBe(2);
  });
});
