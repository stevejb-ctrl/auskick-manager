// Plan-ahead rotation — next-period seed + stale-reconcile (RED-first).
//
// F2 lets a coach build the NEXT period's lineup during the dying minutes
// of the current one (ROTPLAN-02). The pinned lineup rides in the same
// Wave-1 `plannedRotation` slice (the `nextPeriod*` fields). When the
// break arrives, each sport's break path must open PRE-SEEDED from that
// pin instead of recomputing its own suggestion — but only when the pin
// is still valid. `seedNextPeriodLineup` is the pure decision behind that:
//
//   • SEED MATCH — a pin whose `nextPeriodIndex` === the upcoming period,
//     every player still available → returns the pinned groups/bench
//     verbatim (the break opens on exactly this lineup),
//   • WRONG-PERIOD — `nextPeriodIndex` !== the upcoming period → returns
//     null ("no seed"), so the break falls back to its own suggestion,
//   • STALE (D-13) — a pinned on-field player is now unavailable
//     (injured / loaned / marked out) → that player is reconciled OUT of
//     every on-field group, never fielded; still-available teammates stay
//     placed and the break's suggester/draft fills the freed slot.
//
// The helper is sport-neutral: groupIds are opaque strings, so the SAME
// contract holds for AFL zones, netball positions, and rugby-league
// forwards/backs. This spec pins that contract before the helper exists.

import { describe, it, expect } from "vitest";
import { seedNextPeriodLineup } from "@/lib/game-plan";
import type { PlannedRotation } from "@/lib/game-plan";

// ─── Cross-sport fixtures ──────────────────────────────────────────
// Each sport: its expected groupIds, a fully-pinned next-period lineup,
// and which on-field player to mark unavailable for the stale case.
interface SportFixture {
  sport: string;
  groupIds: string[];
  nextPeriodGroups: Record<string, string[]>;
  nextPeriodBench: string[];
  /** An on-field pinned player to mark unavailable in the stale case. */
  staleOnFieldId: string;
  /** The group the stale player sits in (asserted to still exist post-reconcile). */
  staleGroupId: string;
  /** Another on-field pinned player that stays available — must remain fielded. */
  survivingTeammateId: string;
}

const FIXTURES: SportFixture[] = [
  {
    sport: "afl",
    groupIds: ["back", "hback", "mid", "hfwd", "fwd"],
    nextPeriodGroups: {
      back: ["A1", "A2"],
      hback: ["A3"],
      mid: ["A4", "A5"],
      hfwd: ["A6"],
      fwd: ["A7", "A8"],
    },
    nextPeriodBench: ["A9", "A10", "A11"],
    staleOnFieldId: "A1",
    survivingTeammateId: "A2",
    staleGroupId: "back",
  },
  {
    sport: "netball",
    groupIds: ["GS", "GA", "WA", "C", "WD", "GD", "GK"],
    nextPeriodGroups: {
      GS: ["N1"],
      GA: ["N2"],
      WA: ["N3"],
      C: ["N4"],
      WD: ["N5"],
      GD: ["N6"],
      GK: ["N7"],
    },
    nextPeriodBench: ["N8", "N9"],
    staleOnFieldId: "N4",
    survivingTeammateId: "N5",
    staleGroupId: "C",
  },
  {
    sport: "rugby_league",
    groupIds: ["forwards", "backs"],
    nextPeriodGroups: {
      forwards: ["L1", "L2", "L3"],
      backs: ["L4", "L5", "L6"],
    },
    nextPeriodBench: ["L7", "L8"],
    staleOnFieldId: "L1",
    survivingTeammateId: "L2",
    staleGroupId: "forwards",
  },
];

function allIds(f: SportFixture): string[] {
  return [
    ...Object.values(f.nextPeriodGroups).flat(),
    ...f.nextPeriodBench,
  ];
}

// A plannedRotation pin carrying ONLY the F2 next-period fields.
function makePin(f: SportFixture, nextPeriodIndex: number): PlannedRotation {
  return {
    gameId: "game-1",
    nextPeriodIndex,
    nextPeriodGroups: f.nextPeriodGroups,
    nextPeriodBench: f.nextPeriodBench,
  };
}

describe.each(FIXTURES)(
  "seedNextPeriodLineup — $sport",
  (f) => {
    // The break leads INTO period index 2 (the upcoming period).
    const UPCOMING = 2;

    it("SEED MATCH: returns the pinned next-period groups + bench verbatim when every player is available", () => {
      const result = seedNextPeriodLineup({
        pin: makePin(f, UPCOMING),
        periodIndex: UPCOMING,
        availableIds: allIds(f),
        groupIds: f.groupIds,
      });
      expect(result).not.toBeNull();
      expect(result!.groups).toEqual(f.nextPeriodGroups);
      expect(result!.bench).toEqual(f.nextPeriodBench);
    });

    it("WRONG-PERIOD: returns null when the pin targets a different period", () => {
      const result = seedNextPeriodLineup({
        pin: makePin(f, UPCOMING),
        periodIndex: UPCOMING + 1, // break leads into a later period
        availableIds: allIds(f),
        groupIds: f.groupIds,
      });
      expect(result).toBeNull();
    });

    it("STALE (D-13): reconciles an unavailable on-field player OUT of every group, keeping valid teammates", () => {
      const available = allIds(f).filter((id) => id !== f.staleOnFieldId);
      const result = seedNextPeriodLineup({
        pin: makePin(f, UPCOMING),
        periodIndex: UPCOMING,
        availableIds: available,
        groupIds: f.groupIds,
      });
      expect(result).not.toBeNull();

      // The unavailable player is fielded NOWHERE — not in any on-field group...
      const fieldedIds = Object.values(result!.groups).flat();
      expect(fieldedIds).not.toContain(f.staleOnFieldId);
      // ...nor smuggled onto the bench (they're simply unavailable).
      expect(result!.bench).not.toContain(f.staleOnFieldId);

      // The stale player's group key survives reconcile (stable shape)...
      expect(result!.groups).toHaveProperty(f.staleGroupId);
      // ...and every still-available pinned player stays fielded.
      expect(fieldedIds).toContain(f.survivingTeammateId);
    });

    it("returns null when there is no pin", () => {
      const result = seedNextPeriodLineup({
        pin: null,
        periodIndex: UPCOMING,
        availableIds: allIds(f),
        groupIds: f.groupIds,
      });
      expect(result).toBeNull();
    });
  },
);

describe("seedNextPeriodLineup — purity", () => {
  it("does not mutate the pin and is deterministic", () => {
    const f = FIXTURES[0];
    const pin = makePin(f, 2);
    const snapshot = JSON.stringify(pin);

    const a = seedNextPeriodLineup({
      pin,
      periodIndex: 2,
      availableIds: allIds(f),
      groupIds: f.groupIds,
    });
    const b = seedNextPeriodLineup({
      pin,
      periodIndex: 2,
      availableIds: allIds(f),
      groupIds: f.groupIds,
    });

    expect(a).toEqual(b);
    expect(JSON.stringify(pin)).toBe(snapshot);
  });
});
