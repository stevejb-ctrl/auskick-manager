import { describe, expect, it } from "vitest";
import {
  conversionCycle,
  nextEligibleConversionKickers,
  playerConversionStatusInCycle,
  kickoffCycle,
  nextEligibleKickoffTakers,
  kickoffRecordedForPeriod,
  kickoffTakers,
} from "@/lib/sports/rugby_league/kicks";
import type { GameEvent, GameEventType } from "@/lib/types";

let _ts = 0;
function ev(
  type: GameEventType,
  metadata: Record<string, unknown> = {},
  playerId: string | null = null,
): GameEvent {
  _ts++;
  return {
    id: `e${_ts}`,
    game_id: "g1",
    type,
    player_id: playerId,
    metadata,
    created_by: null,
    created_at: new Date(2026, 0, 1, 9, 0, _ts).toISOString(),
  };
}
function reset() {
  _ts = 0;
}

function conversion(
  player: string,
  made: boolean,
  options: { force?: boolean } = {},
): GameEvent {
  return ev(
    "conversion_attempt",
    { made, force: options.force === true },
    player,
  );
}

function kickoff(player: string, period: number): GameEvent {
  return ev("kickoff_taken", { period }, player);
}

// ─── conversionCycle ─────────────────────────────────────────

describe("conversionCycle — empty + single", () => {
  it("returns an empty attempted set with no events", () => {
    reset();
    const c = conversionCycle([], ["p1", "p2", "p3"]);
    expect(c.attempted.size).toBe(0);
    expect(c.cycleComplete).toBe(false);
    expect(c.countInCycle).toBe(0);
  });

  it("records the first kicker", () => {
    reset();
    const c = conversionCycle(
      [conversion("p1", true)],
      ["p1", "p2", "p3"],
    );
    expect(c.attempted).toEqual(new Set(["p1"]));
    expect(c.cycleComplete).toBe(false);
    expect(c.countInCycle).toBe(1);
  });
});

describe("conversionCycle — cycle reset", () => {
  it("does not reset while some on-field players haven't kicked", () => {
    reset();
    const c = conversionCycle(
      [conversion("p1", true), conversion("p2", false)],
      ["p1", "p2", "p3"],
    );
    expect(c.attempted).toEqual(new Set(["p1", "p2"]));
    expect(c.cycleComplete).toBe(false);
  });

  it("resets when every on-field player has kicked, ready for the next cycle", () => {
    reset();
    const c = conversionCycle(
      [
        conversion("p1", true),
        conversion("p2", false),
        conversion("p3", true),
      ],
      ["p1", "p2", "p3"],
    );
    // After the third attempt, every on-field player had kicked
    // → cycle resets to empty for the NEXT one.
    expect(c.attempted.size).toBe(0);
    expect(c.countInCycle).toBe(0);
  });

  it("repeats — second cycle after a full reset", () => {
    reset();
    const events = [
      conversion("p1", true),
      conversion("p2", true),
      conversion("p3", true), // reset
      conversion("p1", false), // new cycle starts here
    ];
    const c = conversionCycle(events, ["p1", "p2", "p3"]);
    expect(c.attempted).toEqual(new Set(["p1"]));
    expect(c.countInCycle).toBe(1);
  });
});

describe("conversionCycle — substitution edge cases", () => {
  it("when a non-kicker subs ON, the cycle grows and does NOT auto-complete", () => {
    reset();
    // p1 + p2 + p3 kick → would normally reset. But the on-field
    // pool now includes p4 (a fresh sub-on); the algorithm sees
    // p4 hasn't kicked and does NOT reset.
    const c = conversionCycle(
      [conversion("p1", true), conversion("p2", true), conversion("p3", true)],
      ["p1", "p2", "p3", "p4"], // p4 came on partway
    );
    expect(c.attempted).toEqual(new Set(["p1", "p2", "p3"]));
    expect(c.cycleComplete).toBe(false);
  });

  it("when a non-kicker subs OFF, the cycle can be complete with fewer players", () => {
    reset();
    // p1 + p2 kick. Pool was [p1, p2, p3] when p3 came off, then
    // [p1, p2] when p3 left. Algorithm uses the current pool —
    // [p1, p2] — and p1 ∪ p2 covers it → reset.
    const c = conversionCycle(
      [conversion("p1", true), conversion("p2", true)],
      ["p1", "p2"], // p3 subbed off
    );
    expect(c.cycleComplete).toBe(false); // current state AFTER reset is empty
    expect(c.attempted.size).toBe(0);
  });

  it("returns empty attempted set when on-field pool is empty", () => {
    reset();
    const c = conversionCycle([conversion("p1", true)], []);
    // Defensive: with no on-field pool, the cycle never resets,
    // attempted just accumulates as-is.
    expect(c.attempted).toEqual(new Set(["p1"]));
    expect(c.cycleComplete).toBe(false);
  });
});

describe("conversionCycle — undo handling", () => {
  it("score_undo pops the latest conversion off the cycle", () => {
    reset();
    const c = conversionCycle(
      [
        conversion("p1", true),
        conversion("p2", false),
        ev("score_undo", {}),
      ],
      ["p1", "p2", "p3"],
    );
    expect(c.attempted).toEqual(new Set(["p1"]));
    expect(c.countInCycle).toBe(1);
  });

  it("score_undo pops the latest scoring event regardless of type — try undo does not touch conversion stack", () => {
    reset();
    const c = conversionCycle(
      [
        conversion("p1", true),
        ev("try", {}, "p2"), // try comes after the conversion
        ev("score_undo", {}), // undo pops the try, NOT the conversion
      ],
      ["p1", "p2", "p3"],
    );
    expect(c.attempted).toEqual(new Set(["p1"]));
  });

  it("undo can unreset a completed cycle — the most recent attempt rolls back, cycle is no longer complete", () => {
    reset();
    const events = [
      conversion("p1", true),
      conversion("p2", true),
      conversion("p3", true), // resets after this
      ev("score_undo", {}), // p3's kick rolls back
    ];
    const c = conversionCycle(events, ["p1", "p2", "p3"]);
    // p3's attempt is undone → cycle state is now { p1, p2 }
    // attempted, NOT complete.
    expect(c.attempted).toEqual(new Set(["p1", "p2"]));
    expect(c.cycleComplete).toBe(false);
  });
});

describe("nextEligibleConversionKickers", () => {
  it("returns on-field players who haven't kicked", () => {
    reset();
    expect(
      nextEligibleConversionKickers(
        [conversion("p1", true)],
        ["p1", "p2", "p3"],
      ),
    ).toEqual(["p2", "p3"]);
  });

  it("returns the full on-field pool when the cycle just reset", () => {
    reset();
    const events = [
      conversion("p1", true),
      conversion("p2", true),
      conversion("p3", true), // cycle complete + auto-reset
    ];
    expect(
      nextEligibleConversionKickers(events, ["p1", "p2", "p3"]),
    ).toEqual(["p1", "p2", "p3"]);
  });

  it("after a cycle reset, a fresh bench player who subs ON gets priority over everyone who's already kicked (Steve 2026-05-18: bug repro)", () => {
    reset();
    // p1, p2, p3 each take a turn — cycle resets after p3.
    // Then p3 subs OFF, p4 subs ON (never kicked this game).
    // On-field pool is now [p1, p2, p4].
    // Eligibility MUST be [p4] only — they jump the queue.
    const events = [
      conversion("p1", true),
      conversion("p2", true),
      conversion("p3", true),
    ];
    expect(
      nextEligibleConversionKickers(events, ["p1", "p2", "p4"]),
    ).toEqual(["p4"]);
  });

  it("after p4 takes their first kick, the on-field rotation is complete again — full pool eligible for the next cycle", () => {
    reset();
    const events = [
      conversion("p1", true),
      conversion("p2", true),
      conversion("p3", true), // cycle 1 reset
      conversion("p4", true), // p4 catches up — all on-field have kicked
    ];
    // Every on-field player now has 1 attempt each. The cycle is
    // complete + auto-reset → fresh rotation, all eligible.
    expect(
      nextEligibleConversionKickers(events, ["p1", "p2", "p4"]),
    ).toEqual(["p1", "p2", "p4"]);
  });

  it("p4 takes their first kick MID-rotation — they're still prioritised over already-kicked players for the next pick", () => {
    reset();
    // p1 kicks. Then p4 subs on (p3 is off the field). On-field is
    // now [p1, p2, p4]. p4 hasn't kicked → priority.
    const events = [
      conversion("p1", true),
    ];
    expect(
      nextEligibleConversionKickers(events, ["p1", "p2", "p4"]),
    ).toEqual(["p2", "p4"]);
    // After p2 kicks too, p4 is the only never-kicker on field.
    const events2 = [...events, conversion("p2", true)];
    expect(
      nextEligibleConversionKickers(events2, ["p1", "p2", "p4"]),
    ).toEqual(["p4"]);
  });
});

describe("playerConversionStatusInCycle", () => {
  it("tracks attempts and made counts per player within the cycle", () => {
    reset();
    const status = playerConversionStatusInCycle(
      [conversion("p1", true), conversion("p2", false)],
      ["p1", "p2", "p3"],
    );
    expect(status.p1).toEqual({
      attemptsInCycle: 1,
      madeInCycle: 1,
      hasForceInCycle: false,
    });
    expect(status.p2).toEqual({
      attemptsInCycle: 1,
      madeInCycle: 0,
      hasForceInCycle: false,
    });
    expect(status.p3).toBeUndefined();
  });

  it("clears on cycle reset — players from before the reset are no longer in the status map", () => {
    reset();
    const events = [
      conversion("p1", true),
      conversion("p2", true),
      conversion("p3", true), // reset
    ];
    expect(
      playerConversionStatusInCycle(events, ["p1", "p2", "p3"]),
    ).toEqual({});
  });

  it("flags force entries with hasForceInCycle", () => {
    reset();
    const status = playerConversionStatusInCycle(
      [conversion("p1", true, { force: true })],
      ["p1", "p2"],
    );
    expect(status.p1.hasForceInCycle).toBe(true);
  });
});

// ─── kickoffCycle ────────────────────────────────────────────

describe("kickoffCycle + nextEligibleKickoffTakers", () => {
  it("returns the full squad when no kickoffs have been taken", () => {
    reset();
    expect(nextEligibleKickoffTakers([], ["p1", "p2", "p3"])).toEqual([
      "p1",
      "p2",
      "p3",
    ]);
  });

  it("excludes a player who has already kicked off", () => {
    reset();
    expect(
      nextEligibleKickoffTakers([kickoff("p1", 1)], ["p1", "p2", "p3"]),
    ).toEqual(["p2", "p3"]);
  });

  it("resets when the whole squad has had a turn", () => {
    reset();
    const events = [
      kickoff("p1", 1),
      kickoff("p2", 2),
      kickoff("p3", 3),
    ];
    expect(
      nextEligibleKickoffTakers(events, ["p1", "p2", "p3"]),
    ).toEqual(["p1", "p2", "p3"]);
  });

  it("kickoffCycle reflects the in-progress state", () => {
    reset();
    const c = kickoffCycle([kickoff("p1", 1)], ["p1", "p2", "p3"]);
    expect(c.taken).toEqual(new Set(["p1"]));
    expect(c.cycleComplete).toBe(false);
  });
});

describe("kickoffRecordedForPeriod + kickoffTakers", () => {
  it("kickoffRecordedForPeriod is true once an event for that period lands", () => {
    reset();
    const events = [kickoff("p1", 1)];
    expect(kickoffRecordedForPeriod(events, 1)).toBe(true);
    expect(kickoffRecordedForPeriod(events, 2)).toBe(false);
  });

  it("kickoffTakers returns the set of every player who's taken at least one kickoff", () => {
    reset();
    const events = [kickoff("p1", 1), kickoff("p2", 2)];
    expect(kickoffTakers(events)).toEqual(new Set(["p1", "p2"]));
  });
});
