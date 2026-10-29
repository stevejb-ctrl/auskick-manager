import { describe, expect, it } from "vitest";
import { tileName } from "@/components/live/tileName";

describe("tileName", () => {
  it("reads the kid, where they are, number, time, then state chips", () => {
    expect(
      tileName({ name: "Zara Q", place: "Back", number: 1, time: "1:04", states: ["Coming off next, pair 4", "1 goal, 0 behinds"] }),
    ).toBe("Zara Q, Back, #1, 1:04, Coming off next, pair 4, 1 goal, 0 behinds");
  });

  it("leaves out the parts a tile doesn't have", () => {
    expect(tileName({ name: "Yuri P", place: null, number: null, time: "0:00", states: [false, undefined, ""] })).toBe("Yuri P, 0:00");
    expect(tileName({ name: "Mia T" })).toBe("Mia T");
  });

  it("reads a list of places in order, and a number given as '#7' once", () => {
    expect(tileName({ name: "Zara Quill", place: ["Forwards", "HK"], number: "#7", time: "25:00", states: ["Stays"] })).toBe(
      "Zara Quill, Forwards, HK, #7, 25:00, Stays",
    );
  });
});
