// Behavioural coverage for suggestStartingLineup, focused on the three
// quarter-break properties Steve wants the algorithm to enforce:
//
//   1. ANTI-CLUSTER: an end-of-quarter zone shouldn't migrate as a
//      group — if 3 players were all in mid in Q1, ≥ 2 of them should
//      end up in DIFFERENT new zones in Q2, not all flock to fwd.
//   2. ROTATION:    a player shouldn't be assigned to the same zone
//      they ended the previous quarter in, when a viable alternative
//      exists.
//   3. SEASON DIVERSITY: a player who has played < 1 full quarter of
//      a given zone all season gets a strong nudge toward that zone,
//      so by the end of the season every player has played all three
//      zones for ≥ 1 quarter.
//
// `pinned` players (recent arrivals, field-locked, zone-locked) bypass
// these heuristics — they're verbatim placements the coach already
// committed to.

import { describe, expect, it } from "vitest";
import {
  suggestStartingLineup,
  type PlayerZoneMinutes,
} from "@/lib/fairness";
import type { Player, Zone } from "@/lib/types";

function makePlayer(id: string): Player {
  return {
    id,
    team_id: "T",
    full_name: id,
    jersey_number: null,
    is_active: true,
    created_by: "owner",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

const ZONE_CAPS_3 = { back: 3, hback: 0, mid: 3, hfwd: 0, fwd: 3 };

function players(ids: string[]): Player[] {
  return ids.map(makePlayer);
}

function zoneOf(lineup: { back: string[]; mid: string[]; fwd: string[] }, id: string): Zone | null {
  if (lineup.back.includes(id)) return "back";
  if (lineup.mid.includes(id)) return "mid";
  if (lineup.fwd.includes(id)) return "fwd";
  return null;
}

const QUARTER_MINS = 12 * 60 * 1000;

describe("suggestStartingLineup — anti-cluster at quarter breaks", () => {
  // Adversarial setup designed to break the old algorithm: every "ex-mid"
  // player has played mid for a full quarter and a chunk of season-mid as
  // well. Their season profiles are identical. Without a cluster penalty,
  // sorting + per-player owed-score gives them all the SAME preference
  // ranking (e.g. fwd first, back second), and they all flock to fwd.
  //
  // We probe with multiple seeds — without an anti-cluster term, AT LEAST
  // ONE seed will produce a fully-clustered outcome (all 3 ex-mid players
  // in the same target zone). With the anti-cluster term, every seed
  // distributes them across ≥ 2 zones.
  it("3 ex-mid players don't all land in the same target zone (across multiple seeds)", () => {
    const all = players([
      "B1", "B2", "B3",
      "M1", "M2", "M3",
      "F1", "F2", "F3",
    ]);
    // Identical profiles within each ex-zone group, so the algorithm has
    // no per-player signal to distinguish them.
    const zoneMs = (z: Zone): Record<Zone, number> => {
      const r = { back: 0, hback: 0, mid: 0, hfwd: 0, fwd: 0 };
      r[z] = QUARTER_MINS;
      return r;
    };
    const currentGame: PlayerZoneMinutes = {
      B1: zoneMs("back"), B2: zoneMs("back"), B3: zoneMs("back"),
      M1: zoneMs("mid"),  M2: zoneMs("mid"),  M3: zoneMs("mid"),
      F1: zoneMs("fwd"),  F2: zoneMs("fwd"),  F3: zoneMs("fwd"),
    };
    const season: PlayerZoneMinutes = {};
    const previousQuarterZones: Record<string, Zone> = {
      B1: "back", B2: "back", B3: "back",
      M1: "mid",  M2: "mid",  M3: "mid",
      F1: "fwd",  F2: "fwd",  F3: "fwd",
    };

    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const lineup = suggestStartingLineup(
        all,
        season,
        seed,
        ZONE_CAPS_3,
        currentGame,
        {},
        previousQuarterZones,
      );
      const midDestinations = ["M1", "M2", "M3"]
        .map((id) => zoneOf(lineup, id))
        .filter((z): z is Zone => z !== null);
      const distinct = new Set(midDestinations);
      expect(
        distinct.size,
        `seed ${seed}: expected ex-mid trio to split across ≥ 2 zones, got all in ${Array.from(distinct).join(",")}`,
      ).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("suggestStartingLineup — no same zone two quarters in a row", () => {
  it("a player in fwd in Q1 should not be assigned to fwd in Q2 when other slots are open", () => {
    // 9 players, plenty of room in every zone.
    const all = players(["B1","B2","B3","M1","M2","M3","F1","F2","F3"]);
    const previousQuarterZones: Record<string, Zone> = {
      F1: "fwd",
      F2: "fwd",
      F3: "fwd",
    };
    // F1 played a full quarter of fwd this game; haven't played anything else.
    const fwdOnly = { back: 0, hback: 0, mid: 0, hfwd: 0, fwd: QUARTER_MINS };
    const currentGame: PlayerZoneMinutes = {
      F1: fwdOnly, F2: fwdOnly, F3: fwdOnly,
    };
    const lineup = suggestStartingLineup(
      all,
      {},
      0,
      ZONE_CAPS_3,
      currentGame,
      {},
      previousQuarterZones,
    );
    // F1 should NOT be in fwd again. (We don't say where they go — back
    // or mid is fine.)
    expect(zoneOf(lineup, "F1")).not.toBe("fwd");
  });

  it("the same-zone penalty is overridden by pinned positions (recent arrivals / locks stay put)", () => {
    const all = players(["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9"]);
    // P1 was in fwd last quarter AND is pinned (e.g. zone-locked) → stays.
    const previousQuarterZones: Record<string, Zone> = { P1: "fwd" };
    const lineup = suggestStartingLineup(
      all,
      {},
      0,
      ZONE_CAPS_3,
      {},
      { P1: "fwd" }, // pinnedPositions
      previousQuarterZones,
    );
    expect(zoneOf(lineup, "P1")).toBe("fwd");
  });
});

describe("suggestStartingLineup — season-level diversity (every kid plays every zone for ≥ 1 quarter)", () => {
  it("a player who has zero season minutes in fwd is steered toward fwd", () => {
    // 3 players, 3 slots (one per zone).
    const all = players(["X", "Y", "Z"]);
    const caps = { back: 1, hback: 0, mid: 1, hfwd: 0, fwd: 1 };
    // X has played plenty of back + mid all season but never fwd.
    // Y and Z are balanced — anything goes for them.
    const balanced = { back: 30 * 60_000, hback: 0, mid: 30 * 60_000, hfwd: 0, fwd: 30 * 60_000 };
    const season: PlayerZoneMinutes = {
      X: { back: 60 * 60_000, hback: 0, mid: 60 * 60_000, hfwd: 0, fwd: 0 },
      Y: balanced,
      Z: balanced,
    };
    const lineup = suggestStartingLineup(
      all,
      season,
      0,
      caps,
    );
    // X should land in fwd — the never-played zone.
    expect(zoneOf(lineup, "X")).toBe("fwd");
  });

});

describe("suggestStartingLineup — backwards compatibility", () => {
  it("works with no previousQuarterZones argument (start of game / unit-test callers)", () => {
    const all = players(["A", "B", "C"]);
    const caps = { back: 1, hback: 0, mid: 1, hfwd: 0, fwd: 1 };
    const lineup = suggestStartingLineup(all, {}, 0, caps);
    // All 3 placed somewhere on the field, no exceptions.
    const placed = ["A", "B", "C"].map((id) => zoneOf(lineup, id));
    expect(placed.every((z) => z !== null)).toBe(true);
  });

  it("respects pinnedPositions even when a same-zone-as-last-Q penalty would otherwise apply", () => {
    // P1 was field-locked in fwd. They MUST stay in fwd this quarter,
    // even though previousQuarterZones says fwd → would normally penalise.
    const all = players(["P1", "P2", "P3"]);
    const caps = { back: 1, hback: 0, mid: 1, hfwd: 0, fwd: 1 };
    const lineup = suggestStartingLineup(
      all,
      {},
      0,
      caps,
      {},
      { P1: "fwd" },
      { P1: "fwd" },
    );
    expect(zoneOf(lineup, "P1")).toBe("fwd");
  });
});
