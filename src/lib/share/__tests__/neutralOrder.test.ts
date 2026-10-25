// The share text ranked kids by minutes (round 2 usability, 24 Oct 2026),
// so the message posted to every parent ended "#3 Noah — 9:08, #8 Jack —
// 9:08": who sat most, at the bottom. Game time now reads in a neutral
// order: by number, or by name where the sport has no numbers.

import { describe, expect, it } from "vitest";
import { byJerseyThenName } from "@/lib/share/neutralOrder";
import { buildTouchSummary } from "@/lib/sports/touch/summary";
import { replayTouchGame } from "@/lib/sports/touch/replay";
import type { Player } from "@/lib/types";
import { FIELD, game } from "@/lib/sports/touch/__tests__/touchGame";

const kid = (id: string, full_name: string, jersey_number: number | null) => ({ id, full_name, jersey_number });

describe("byJerseyThenName", () => {
  it("orders by number, then by name, numberless kids last", () => {
    const kids = [kid("a", "Zara Low", 9), kid("b", "Ava Bell", null), kid("c", "Noah Hill", 3), kid("d", "Mia Fox", 3)];
    const sorted = [...kids].sort(byJerseyThenName((k) => k));
    expect(sorted.map((k) => k.id)).toEqual(["d", "c", "a", "b"]);
  });

  it("orders alphabetically where the sport has no numbers", () => {
    const kids = [kid("a", "Zara Low", null), kid("b", "Ava Bell", null), kid("c", "Emily Ng", null)];
    expect([...kids].sort(byJerseyThenName((k) => k)).map((k) => k.full_name)).toEqual([
      "Ava Bell",
      "Emily Ng",
      "Zara Low",
    ]);
  });
});

const player = (id: string, full_name: string, jersey_number: number): Player => ({
  id,
  team_id: "t1",
  full_name,
  jersey_number,
  is_active: true,
  created_by: "u1",
  created_at: "2026-10-22T00:00:00Z",
  updated_at: "2026-10-22T00:00:00Z",
});

describe("the share text's game time", () => {
  it("lists kids by number, not by minutes played", () => {
    const g = game();
    g.lineup(FIELD);
    g.start(1);
    g.swap("a", "g", 5);
    g.end(1, 20);
    const names = ["Ava", "Ben", "Cal", "Dan", "Eve", "Fin", "Gus", "Hal"];
    const squad = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id, i) => player(id, `${names[i]} Smith`, i + 1));
    const text = buildTouchSummary({
      teamName: "Us",
      opponentName: "Them",
      trackScoring: false,
      state: replayTouchGame(g.events),
      squad,
      presentIds: ["h"],
    });
    const rows = text.split("⏱ Game time\n")[1].split("\n");
    expect(rows.map((r) => r.split(" ")[0])).toEqual(["#1", "#2", "#3", "#4", "#5", "#6", "#7", "#8"]);
    expect(rows[0]).toBe("#1 Ava — 5:00");
  });
});
