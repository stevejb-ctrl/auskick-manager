// Netball's Repeat at the break (UX audit 23 Oct 2026, P1): the break
// built Repeat from last quarter's lineup as it stood, so a kid who
// arrived late during the quarter was on neither the court nor the
// bench, and started the next quarter forgotten. Repeat keeps last
// quarter's court and puts everyone else who can play on the bench.

import { describe, expect, it } from "vitest";
import { repeatPositionLineup } from "@/lib/live/lineupOps";

const last = {
  positions: { gs: ["ivy"], ga: ["chloe"], wa: ["grace"], c: ["olivia"], wd: ["harper"], gd: ["lily"], gk: ["sienna"] },
  bench: ["emily", "amelia"],
};

describe("repeatPositionLineup", () => {
  it("puts a late arrival on the bench", () => {
    const pool = ["ivy", "chloe", "grace", "olivia", "harper", "lily", "sienna", "emily", "amelia", "sophie"];
    const next = repeatPositionLineup(last, pool);
    expect(next.positions).toEqual(last.positions);
    expect(next.bench).toEqual(["emily", "amelia", "sophie"]);
  });

  it("leaves a kid who can't play off the court and the bench", () => {
    // Amelia hurt (off the bench), Grace lent (her bib left empty).
    const pool = ["ivy", "chloe", "olivia", "harper", "lily", "sienna", "emily"];
    const next = repeatPositionLineup(last, pool);
    expect(next.positions.wa).toEqual([]);
    expect(next.positions.gs).toEqual(["ivy"]);
    expect(next.bench).toEqual(["emily"]);
  });

  it("doesn't change last quarter's lineup", () => {
    repeatPositionLineup(last, ["ivy", "sophie"]);
    expect(last.bench).toEqual(["emily", "amelia"]);
    expect(last.positions.gs).toEqual(["ivy"]);
  });
});
