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
import {
  consumePeriodPin,
  hasPinnedPeriod,
  pinLaterPeriods,
  seedNextPeriodLineup,
  withPinnedPeriods,
  withoutSubPin,
} from "@/lib/game-plan";
import type { GamePlan, PlannedRotation } from "@/lib/game-plan";

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

// ─── withPinnedNextPeriod ──────────────────────────────────────────
// Stagehand round 2: reopening Game plan mid-game always projected
// afresh, so the next quarter the coach had pinned looked lost.

describe("withPinnedPeriods (a period pinned mid-game)", () => {
  const plan: GamePlan = {
    sport: "netball",
    periods: [
      { period: 2, label: "Q2", groups: [{ groupId: "gs", groupLabel: "GS", playerIds: ["a"] }, { groupId: "gk", groupLabel: "GK", playerIds: ["b"] }], bench: ["c", "d"] },
      { period: 3, label: "Q3", groups: [{ groupId: "gs", groupLabel: "GS", playerIds: ["c"] }, { groupId: "gk", groupLabel: "GK", playerIds: ["d"] }], bench: ["a", "b"] },
      { period: 4, label: "Q4", groups: [{ groupId: "gs", groupLabel: "GS", playerIds: ["a"] }, { groupId: "gk", groupLabel: "GK", playerIds: ["b"] }], bench: ["c", "d"] },
    ],
    totals: [],
    periodLabel: "quarter",
    periodLabelPlural: "quarters",
    periodMinutes: 10,
    rotatesWithinPeriod: false,
  };
  const pin: PlannedRotation = {
    gameId: "g1",
    nextPeriodIndex: 2,
    nextPeriodGroups: { gs: ["d"], gk: ["a"] },
    nextPeriodBench: ["b"],
  };

  it("shows the pinned next quarter, leaving the others as projected", () => {
    const shown = withPinnedPeriods(plan, { pin, fromPeriodIndex: 2, availableIds: ["a", "b", "c", "d"] });
    expect(shown.periods[1].groups.map((g) => g.playerIds)).toEqual([["d"], ["a"]]);
    // c wasn't placed by the pin but is still here: on the bench.
    expect(shown.periods[1].bench).toEqual(["b", "c"]);
    expect(shown.periods[0]).toEqual(plan.periods[0]);
    expect(shown.periods[2]).toEqual(plan.periods[2]);
  });

  it("drops a pinned kid who's no longer available", () => {
    const shown = withPinnedPeriods(plan, { pin, fromPeriodIndex: 2, availableIds: ["b", "c", "d"] });
    expect(shown.periods[1].groups.map((g) => g.playerIds)).toEqual([["d"], []]);
    expect(shown.periods[1].bench).toEqual(["b", "c"]);
  });

  it("leaves the projection alone with no pin, or one for an earlier quarter", () => {
    expect(withPinnedPeriods(plan, { pin: null, fromPeriodIndex: 2, availableIds: ["a"] })).toBe(plan);
    expect(withPinnedPeriods(plan, { pin: { ...pin, nextPeriodIndex: 1 }, fromPeriodIndex: 2, availableIds: ["a"] })).toBe(plan);
  });
});

// ─── Later periods planned before kickoff ──────────────────────────
// Stagehand round 3: "Use for Q1" kept only Q1; edits to Q2–Q4 in the
// pre-kickoff Game plan silently vanished. The plan's later periods now
// ride on the pin (`laterPeriods`) and seed each break.

describe("later periods on the pin", () => {
  const pin: PlannedRotation = {
    gameId: "g1",
    laterPeriods: {
      1: { groups: { gs: ["d"], gk: ["a"] }, bench: ["b", "c"] },
      3: { groups: { gs: ["a"], gk: ["b"] }, bench: ["c", "d"] },
    },
  };

  it("seed the break they lead into", () => {
    const seed = seedNextPeriodLineup({ pin, periodIndex: 1, availableIds: ["a", "b", "c", "d"], groupIds: ["gs", "gk"] });
    expect(seed).toEqual({ groups: { gs: ["d"], gk: ["a"] }, bench: ["b", "c"] });
    expect(seedNextPeriodLineup({ pin, periodIndex: 2, availableIds: ["a"], groupIds: ["gs"] })).toBeNull();
    expect(hasPinnedPeriod(pin, 1)).toBe(true);
    expect(hasPinnedPeriod(pin, 2)).toBe(false);
  });

  it("a period pinned mid-game wins over the pre-kickoff plan for it", () => {
    const both: PlannedRotation = { ...pin, nextPeriodIndex: 1, nextPeriodGroups: { gs: ["c"], gk: ["d"] }, nextPeriodBench: ["a", "b"] };
    expect(seedNextPeriodLineup({ pin: both, periodIndex: 1, availableIds: ["a", "b", "c", "d"], groupIds: ["gs", "gk"] })?.groups).toEqual({ gs: ["c"], gk: ["d"] });
  });

  it("starting a period consumes only its own plan", () => {
    const both: PlannedRotation = { ...pin, nextPeriodIndex: 1, nextPeriodGroups: { gs: ["c"] }, nextPeriodBench: [] };
    const after = consumePeriodPin(both, 1);
    expect(after?.nextPeriodGroups).toBeUndefined();
    expect(after?.laterPeriods).toEqual({ 3: pin.laterPeriods![3] });
    // Nothing left: no pin at all.
    expect(consumePeriodPin({ gameId: "g1", laterPeriods: { 1: pin.laterPeriods![1] } }, 1)).toBeNull();
  });

  it("applying a pinned sub keeps the planned periods", () => {
    const withSub: PlannedRotation = { ...pin, pinnedForPeriod: 1, pinnedSwaps: [] };
    expect(withoutSubPin(withSub)).toEqual(pin);
    expect(withoutSubPin({ gameId: "g1", pinnedForPeriod: 1, pinnedSwaps: [] })).toBeNull();
  });

  it("reopening the planner shows every pinned period from there on", () => {
    const plan: GamePlan = {
      sport: "netball",
      periods: [1, 2, 3, 4].map((n) => ({
        period: n,
        label: `Q${n}`,
        groups: [{ groupId: "gs", groupLabel: "GS", playerIds: ["a"] }, { groupId: "gk", groupLabel: "GK", playerIds: ["b"] }],
        bench: ["c", "d"],
      })),
      totals: [],
      periodLabel: "quarter",
      periodLabelPlural: "quarters",
      periodMinutes: 10,
      rotatesWithinPeriod: false,
    };
    const shown = withPinnedPeriods(plan, { pin, fromPeriodIndex: 1, availableIds: ["a", "b", "c", "d"] });
    expect(shown.periods[0]).toEqual(plan.periods[0]);
    expect(shown.periods[1].groups.map((g) => g.playerIds)).toEqual([["d"], ["a"]]);
    expect(shown.periods[2]).toEqual(plan.periods[2]);
    expect(shown.periods[3].groups.map((g) => g.playerIds)).toEqual([["a"], ["b"]]);
  });
});

describe("pinLaterPeriods", () => {
  it("pins Q2 on from a pre-kickoff plan, keeping a pinned sub, replacing old plans", () => {
    const plan: GamePlan = {
      sport: "netball",
      periods: [1, 2, 3].map((n) => ({
        period: n,
        label: `Q${n}`,
        groups: [{ groupId: "gs", groupLabel: "GS", playerIds: [`s${n}`] }],
        bench: [`b${n}`],
      })),
      totals: [],
      periodLabel: "quarter",
      periodLabelPlural: "quarters",
      periodMinutes: 10,
      rotatesWithinPeriod: false,
    };
    const prior: PlannedRotation = { gameId: "g1", pinnedForPeriod: 1, pinnedSwaps: [], laterPeriods: { 5: { groups: {}, bench: [] } } };
    expect(pinLaterPeriods(prior, "g1", plan)).toEqual({
      gameId: "g1",
      pinnedForPeriod: 1,
      pinnedSwaps: [],
      laterPeriods: { 1: { groups: { gs: ["s2"] }, bench: ["b2"] }, 2: { groups: { gs: ["s3"] }, bench: ["b3"] } },
    });
    // Another game's pin isn't carried over.
    expect(pinLaterPeriods({ ...prior, gameId: "other" }, "g1", plan).pinnedForPeriod).toBeUndefined();
  });
});
