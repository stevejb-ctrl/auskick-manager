// Two phones tapping Start within the same ~100 ms both pass the app's
// guard (it reads, then writes). The database refuses the second start
// (migration 0075's unique indexes), and the action has to word that
// refusal as the guard would have: "Another phone already started Q2".

import { describe, expect, it } from "vitest";
import { FINALISED_INDEX, PERIOD_START_INDEX, uniqueRaceVerdict } from "@/lib/live/periodGuard";

const violation = (index: string) => ({
  code: "23505",
  message: `duplicate key value violates unique constraint "${index}"`,
  details: "Key (game_id, ((metadata ->> 'quarter'::text)))=(…, 2) already exists.",
});

describe("uniqueRaceVerdict", () => {
  it("a second start of the period is the other phone's: stale, in the guard's words", () => {
    expect(uniqueRaceVerdict(violation(PERIOD_START_INDEX), { kind: "period_start", period: 2 }, "quarter")).toEqual({
      kind: "stale",
      message: "Another phone already started Q2.",
    });
    expect(uniqueRaceVerdict(violation(PERIOD_START_INDEX), { kind: "period_start", period: 2 }, "half")).toEqual({
      kind: "stale",
      message: "Another phone already started H2.",
    });
  });

  it("a kickoff that loses the race lost the first period's start", () => {
    expect(uniqueRaceVerdict(violation(PERIOD_START_INDEX), { kind: "kickoff" }, "period")).toEqual({
      kind: "stale",
      message: "Another phone already started P1.",
    });
  });

  it("a second Finish is the same thing, done", () => {
    expect(uniqueRaceVerdict(violation(FINALISED_INDEX), { kind: "finalise" }, "quarter")).toEqual({ kind: "duplicate" });
  });

  it("leaves a replayed write key, another error, or no error to the caller", () => {
    const replay = { code: "23505", message: 'duplicate key value violates unique constraint "game_events_idempotency_key_uq"' };
    expect(uniqueRaceVerdict(replay, { kind: "period_start", period: 2 }, "quarter")).toBeNull();
    expect(uniqueRaceVerdict({ code: "42501", message: "permission denied" }, { kind: "period_start", period: 2 }, "quarter")).toBeNull();
    expect(uniqueRaceVerdict(null, { kind: "period_start", period: 2 }, "quarter")).toBeNull();
  });

  it("finds the index in the details when the message doesn't name it", () => {
    const e = { code: "23505", message: "duplicate key", details: `constraint "${PERIOD_START_INDEX}"` };
    expect(uniqueRaceVerdict(e, { kind: "period_start", period: 3 }, "quarter")).toMatchObject({ kind: "stale" });
  });
});
