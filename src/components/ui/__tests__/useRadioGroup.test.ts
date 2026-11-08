import { describe, expect, it } from "vitest";
import { radioKeyTarget, rovingIndex } from "@/components/ui/useRadioGroup";

describe("radioKeyTarget", () => {
  it("moves to the next and previous radio, wrapping at the ends", () => {
    expect(radioKeyTarget("ArrowRight", 0, 4)).toBe(1);
    expect(radioKeyTarget("ArrowDown", 3, 4)).toBe(0);
    expect(radioKeyTarget("ArrowLeft", 0, 4)).toBe(3);
    expect(radioKeyTarget("ArrowUp", 2, 4)).toBe(1);
  });

  it("jumps to the first and last with Home and End", () => {
    expect(radioKeyTarget("Home", 2, 4)).toBe(0);
    expect(radioKeyTarget("End", 1, 4)).toBe(3);
  });

  it("skips disabled radios", () => {
    const off = (i: number) => i === 1 || i === 3;
    expect(radioKeyTarget("ArrowRight", 0, 4, off)).toBe(2);
    expect(radioKeyTarget("ArrowRight", 2, 4, off)).toBe(0);
    expect(radioKeyTarget("End", 0, 4, off)).toBe(2);
    expect(radioKeyTarget("Home", 2, 4, (i) => i === 0)).toBe(1);
  });

  it("ignores other keys, and a group with nothing enabled", () => {
    expect(radioKeyTarget("Tab", 0, 4)).toBeNull();
    expect(radioKeyTarget(" ", 0, 4)).toBeNull();
    expect(radioKeyTarget("ArrowRight", 0, 3, () => true)).toBeNull();
    expect(radioKeyTarget("ArrowRight", 0, 0)).toBeNull();
  });
});

describe("rovingIndex", () => {
  it("is the checked radio, else the first enabled one", () => {
    expect(rovingIndex(["a", "b", "c"], "b")).toBe(1);
    expect(rovingIndex(["a", "b", "c"], null)).toBe(0);
    expect(rovingIndex(["a", "b", "c"], "z")).toBe(0);
    expect(rovingIndex(["a", "b", "c"], null, (i) => i === 0)).toBe(1);
    // A group waiting on a save keeps its stop on the checked radio.
    expect(rovingIndex(["a", "b", "c"], "c", () => true)).toBe(2);
  });
});
