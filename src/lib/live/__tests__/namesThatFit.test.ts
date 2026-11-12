import { describe, expect, it } from "vitest";
import { namesThatFit } from "@/lib/live/namesThatFit";

describe("namesThatFit", () => {
  it("shows every name that fits", () => {
    expect(namesThatFit(["Zara Q", "Eli S", "Ruby D"], 30)).toEqual({
      shown: ["Zara Q", "Eli S", "Ruby D"],
      more: 0,
      text: "Zara Q, Eli S, Ruby D",
    });
  });

  it("ends with +N, the +N inside the budget too", () => {
    const r = namesThatFit(["Zara Q", "Eli S", "Ruby D", "Jack T", "Kai M"], 22);
    expect(r.text).toBe("Zara Q, Eli S, +3");
    expect(r.text.length).toBeLessThanOrEqual(22);
  });

  it("always shows the first name", () => {
    expect(namesThatFit(["Maximilian-Alexander W", "Eli S"], 10).text).toBe("Maximilian-Alexander W, +1");
  });

  it("is empty for no kids", () => {
    expect(namesThatFit([], 20)).toEqual({ shown: [], more: 0, text: "" });
  });
});
