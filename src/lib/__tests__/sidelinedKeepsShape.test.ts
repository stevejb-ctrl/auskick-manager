// Regression: marking a player out at a break must NOT shrink the formation.
//
// Real-game bug (Steve, 3/4 time): playing 12 a side (4/4/4). Two players were
// marked injured/out at the break, so the healthy count dropped to 11 and the
// break recomputed the on-field size as min(12, 11) = 11. The coach's 4/4/4
// shape then no longer summed to the "current" size, so deriveEffectiveZoneCaps
// fell back to the default caps for 11 — re-solving the formation, cramming
// players forward and leaving them stuck.
//
// Expected: the field keeps the coach's 12-slot 4/4/4 shape with the missing
// player's slot simply left empty. Only a genuinely SHORT SQUAD (fewer players
// on the team sheet than the configured size) should collapse the shape.

import { describe, expect, it } from "vitest";
import { deriveEffectiveZoneCaps, zoneCapsFor } from "@/lib/fairness";
import type { Lineup } from "@/lib/types";

// The coach's 12-a-side 4/4/4 shape (zones3 / U10).
function lineup444(): Lineup {
  return {
    back: ["b1", "b2", "b3", "b4"],
    hback: [],
    mid: ["m1", "m2", "m3", "m4"],
    hfwd: [],
    fwd: ["f1", "f2", "f3", "f4"],
    bench: ["x1", "x2"],
  };
}

describe("sidelining a player keeps the coach's on-field shape", () => {
  it("preserves 4/4/4 when the configured size (12) is used, even with players out", () => {
    // The fix: pass the CONFIGURED size (12), not the healthy count (11).
    const caps = deriveEffectiveZoneCaps(
      lineup444(),
      12,
      "zones3",
      zoneCapsFor(12, "zones3"),
    );
    expect(caps.back).toBe(4);
    expect(caps.mid).toBe(4);
    expect(caps.fwd).toBe(4);
  });

  it("REGRESSION: passing the reduced healthy count (11) loses the shape", () => {
    // This is what the buggy code did — documents why we must not do it.
    const caps = deriveEffectiveZoneCaps(
      lineup444(),
      11,
      "zones3",
      zoneCapsFor(11, "zones3"),
    );
    // 4+4+4 = 12 !== 11, so it falls back to the default caps for 11 and the
    // coach's shape is destroyed (this is the crammed-forward behaviour).
    const total = caps.back + caps.mid + caps.fwd;
    expect(total).toBe(11);
    expect([caps.back, caps.mid, caps.fwd]).not.toEqual([4, 4, 4]);
  });

  it("still collapses for a genuinely short squad (only 10 players on the sheet)", () => {
    // Short squad keeps its own 3/4/3 shape summing to the size passed in.
    const short: Lineup = {
      back: ["b1", "b2", "b3"],
      hback: [],
      mid: ["m1", "m2", "m3", "m4"],
      hfwd: [],
      fwd: ["f1", "f2", "f3"],
      bench: [],
    };
    const caps = deriveEffectiveZoneCaps(short, 10, "zones3", zoneCapsFor(10, "zones3"));
    expect([caps.back, caps.mid, caps.fwd]).toEqual([3, 4, 3]);
  });
});
