// A team's own players on the field (rugby union plan, phase 2; every
// sport). Competitions differ by state, so the coach sets their
// competition's size once for the team: NULL means the age group's
// default. Every new game starts from it, inside the age's range, and a
// change of age group keeps it inside the new range.

import { describe, expect, it } from "vitest";
import { newGameDefaults, storedOnFieldSize, teamOnFieldSize } from "@/lib/games/newGameDefaults";
import { getAgeGroupConfig } from "@/lib/sports";

const unionU10 = getAgeGroupConfig("rugby_union", "U10"); // 12 a side, 10–15
const unionU12 = getAgeGroupConfig("rugby_union", "U12"); // 15 a side, 12–15
const unionU9 = getAgeGroupConfig("rugby_union", "U9"); // 10 a side, 7–10

describe("a team's own players on the field", () => {
  it("a new game takes the team's size, else the age group's", () => {
    expect(newGameDefaults("rugby_union", "U10")).toEqual({ on_field_size: 12, sub_interval_seconds: 240 });
    expect(newGameDefaults("rugby_union", "U10", null).on_field_size).toBe(12);
    expect(newGameDefaults("rugby_union", "U10", 10).on_field_size).toBe(10);
    expect(newGameDefaults("rugby_union", "U10", 15).on_field_size).toBe(15);
    // Every sport, not just union.
    expect(newGameDefaults("afl", "U10", 10).on_field_size).toBe(10);
    expect(newGameDefaults("netball", "go", 6).on_field_size).toBe(6);
  });

  it("keeps the team's size inside the age group's range", () => {
    expect(teamOnFieldSize(unionU10, 20)).toBe(15);
    expect(teamOnFieldSize(unionU10, 4)).toBe(10);
    expect(newGameDefaults("rugby_union", "U10", 20).on_field_size).toBe(15);
  });

  it("stores a size only when it isn't the age group's own, inside its range", () => {
    expect(storedOnFieldSize(unionU10, 12)).toBeNull();
    expect(storedOnFieldSize(unionU10, null)).toBeNull();
    expect(storedOnFieldSize(unionU10, 10)).toBe(10);
    expect(storedOnFieldSize(unionU10, 18)).toBe(15);
  });

  it("re-clamps a team's size into a new age group's range", () => {
    // U10 at 10 a side moves up to U12 (12–15): 12, which is not U12's 15.
    expect(storedOnFieldSize(unionU12, 10)).toBe(12);
    expect(storedOnFieldSize(unionU12, 13)).toBe(13);
    // U10 at 15 moves down to U9 (7–10): 10, U9's own size, so stored as none.
    expect(storedOnFieldSize(unionU9, 15)).toBeNull();
  });
});
