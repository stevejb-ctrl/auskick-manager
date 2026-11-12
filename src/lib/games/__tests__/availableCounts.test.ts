import { describe, expect, it } from "vitest";
import { availableCountsByGame } from "@/lib/games/availableCounts";

describe("availableCountsByGame", () => {
  it("leaves out kids who were switched off (the 16/15 bug)", () => {
    const rows = [
      { game_id: "g1", player_id: "ruby", status: "available" },
      { game_id: "g1", player_id: "sam", status: "available" },
      { game_id: "g1", player_id: "ava", status: "available" },
    ];
    // Ruby left the squad; Sam and Ava are active.
    expect(availableCountsByGame(rows, ["sam", "ava"]).get("g1")).toBe(2);
  });

  it("counts only available rows, per game", () => {
    const rows = [
      { game_id: "g1", player_id: "a", status: "available" },
      { game_id: "g1", player_id: "b", status: "unavailable" },
      { game_id: "g2", player_id: "a", status: "available" },
      { game_id: "g2", player_id: "b", status: "available" },
    ];
    const counts = availableCountsByGame(rows, ["a", "b"]);
    expect(counts.get("g1")).toBe(1);
    expect(counts.get("g2")).toBe(2);
    expect(counts.get("g3")).toBeUndefined();
  });
});
