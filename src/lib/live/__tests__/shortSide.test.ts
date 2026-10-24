import { describe, expect, it } from "vitest";
import { shortSideNote } from "@/lib/live/shortSide";

describe("shortSideNote", () => {
  it("says nothing with a full side", () => {
    expect(shortSideNote({ playing: 12, size: 12, min: 6 })).toBeNull();
    expect(shortSideNote({ playing: 0, size: 12, min: 6 })).toBeNull();
  });

  // Round 3 (24 Oct 2026): AFL 12-a-side kicked off with 10, no word.
  it("says how many short", () => {
    expect(shortSideNote({ playing: 6, size: 7, min: 5 })).toEqual({
      text: "Playing 6 of 7. Borrow a player, or play on.",
      belowMin: false,
    });
  });

  // Union U12 (minimum 12) with 11; futsal (minimum 3) with one kid.
  it("says it more firmly under the age group's minimum", () => {
    const note = shortSideNote({ playing: 1, size: 5, min: 3 });
    expect(note?.belowMin).toBe(true);
    expect(note?.text).toMatch(/^Playing 1 of 5, under the 3 this age group plays with/);
  });
});
