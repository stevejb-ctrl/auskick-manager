// Verify the suggester + zoneCapsFor cooperate to produce the
// requested on-field count for every legal size in every age group,
// across both sports. This is the test that would have caught the
// "set 10, app shows 11" report from Newcastle's first real game —
// it pins the math down at every supported size.

import { describe, expect, it } from "vitest";
import { suggestStartingLineup, zoneCapsFor } from "@/lib/fairness";
import type { Player } from "@/lib/types";
import { aflSport } from "@/lib/sports/afl";
import { netballSport } from "@/lib/sports/netball";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    team_id: "T",
    full_name: `Player ${i}`,
    jersey_number: i + 1,
    is_active: true,
    created_by: "u",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }));
}

describe("AFL on-field-size: zoneCapsFor + suggestStartingLineup", () => {
  for (const ageCfg of aflSport.ageGroups) {
    const model = ageCfg.positions.length > 3 ? "positions5" : "zones3";
    for (let size = ageCfg.minOnFieldSize; size <= ageCfg.maxOnFieldSize; size++) {
      it(`${ageCfg.id} size=${size} (${model}) places exactly ${size} on field`, () => {
        // Surplus so bench is always non-empty — exercises the
        // "more available than fit" path the suggester takes when a
        // coach has rolled over from a bigger squad.
        const players = makePlayers(size + 4);
        const caps = zoneCapsFor(size, model);
        const totalCaps = caps.back + caps.hback + caps.mid + caps.hfwd + caps.fwd;
        expect(totalCaps).toBe(size);

        const lineup = suggestStartingLineup(players, {}, 0, caps);
        const onField =
          lineup.back.length +
          lineup.hback.length +
          lineup.mid.length +
          lineup.hfwd.length +
          lineup.fwd.length;
        expect(onField).toBe(size);
        expect(lineup.bench.length).toBe(players.length - size);
      });
    }
  }
});

describe("Netball on-field-size: zoneCapsFor + suggestStartingLineup", () => {
  // Netball has its own positions5/lineup shape; for the AFL fairness
  // suggester we use the same zoneCapsFor utility but with the netball
  // age group's bounds. This guards us against a future regression where
  // someone hardcodes AFL bounds into the suggester path.
  for (const ageCfg of netballSport.ageGroups) {
    const model = ageCfg.positions.length > 3 ? "positions5" : "zones3";
    for (let size = ageCfg.minOnFieldSize; size <= ageCfg.maxOnFieldSize; size++) {
      it(`${ageCfg.id} size=${size} caps sum to ${size}`, () => {
        const caps = zoneCapsFor(size, model);
        const totalCaps = caps.back + caps.hback + caps.mid + caps.hfwd + caps.fwd;
        expect(totalCaps).toBe(size);
      });
    }
  }
});

describe("Edge cases", () => {
  it("clamps oversized requests to the model's hardMax", () => {
    // zoneCapsFor's hardMax is 18 for positions5, 15 for zones3.
    expect(
      Object.values(zoneCapsFor(99, "zones3")).reduce((a, b) => a + b, 0),
    ).toBeLessThanOrEqual(15);
    expect(
      Object.values(zoneCapsFor(99, "positions5")).reduce((a, b) => a + b, 0),
    ).toBeLessThanOrEqual(18);
  });

  it("clamps below-zero requests to 0", () => {
    expect(
      Object.values(zoneCapsFor(-3, "zones3")).reduce((a, b) => a + b, 0),
    ).toBe(0);
  });

  it("U10 (zones3) at size 10 returns 3-4-3", () => {
    const caps = zoneCapsFor(10, "zones3");
    expect(caps.back).toBe(3);
    expect(caps.mid).toBe(4);
    expect(caps.fwd).toBe(3);
  });

  it("U10 (zones3) at size 11 returns 4-4-3", () => {
    const caps = zoneCapsFor(11, "zones3");
    expect(caps.back).toBe(4);
    expect(caps.mid).toBe(4);
    expect(caps.fwd).toBe(3);
  });
});
