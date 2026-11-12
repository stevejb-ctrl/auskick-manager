import { describe, expect, it } from "vitest";
import { withHealthyOnBench } from "@/lib/live/break/useBreakReplan";

// Undo at the break puts back the lineup from before the re-plan, made
// fit for who can play now (Steve, 12 Nov 2026): a kid who can play and
// wasn't in it joins the bench.
describe("the break's undo: who can play and wasn't in the lineup", () => {
  type L = { field: string[]; bench: string[] };
  const placed = (l: L, id: string) => l.field.includes(id);

  it("adds them to the bench, after the kids already there", () => {
    const before: L = { field: ["a", "b"], bench: ["c"] };
    expect(withHealthyOnBench(before, ["a", "b", "c", "d"], placed)).toEqual({ field: ["a", "b"], bench: ["c", "d"] });
  });

  it("leaves a lineup with everyone in it as it is", () => {
    const before: L = { field: ["a", "b"], bench: ["c"] };
    expect(withHealthyOnBench(before, ["a", "c"], placed)).toBe(before);
  });
});
