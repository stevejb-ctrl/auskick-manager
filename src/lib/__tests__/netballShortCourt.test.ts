// Netball played short: the break said "All rules kept" with Wing
// Defence empty (Stagehand round 8, #14).
import { describe, expect, it } from "vitest";
import { netballShortCourtNote } from "@/lib/sports/netball";

const SEVEN = ["gs", "ga", "wa", "c", "wd", "gd", "gk"];

describe("netballShortCourtNote", () => {
  it("names the empty positions on a short court", () => {
    const positions = { gs: ["a"], ga: ["b"], wa: ["c"], c: ["d"], wd: [], gd: ["f"], gk: ["g"] };
    expect(netballShortCourtNote(positions, SEVEN)).toBe("Playing 6 of 7: Wing Defence is empty");
  });

  it("is quiet with every position filled", () => {
    const positions = Object.fromEntries(SEVEN.map((p, i) => [p, [String(i)]]));
    expect(netballShortCourtNote(positions, SEVEN)).toBeNull();
  });
});
