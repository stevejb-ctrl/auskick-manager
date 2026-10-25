import { describe, expect, it } from "vitest";
import { lineupWrite, periodShort, periodStateOf, periodWriteVerdict } from "@/lib/live/periodGuard";

const start = (quarter: number) => ({ type: "quarter_start", metadata: { quarter } });
const end = (quarter: number) => ({ type: "quarter_end", metadata: { quarter, elapsed_ms: 1 } });
const lineup = { type: "lineup_set", metadata: { lineup: {} } };

describe("periodWriteVerdict", () => {
  const before = periodStateOf("upcoming", []);
  const q1 = periodStateOf("in_progress", [lineup, start(1)]);
  const q1Break = periodStateOf("in_progress", [lineup, start(1), end(1)]);
  const q2 = periodStateOf("in_progress", [lineup, start(1), end(1), lineup, start(2)]);

  it("lets the first kickoff through and refuses the second", () => {
    expect(periodWriteVerdict(before, { kind: "kickoff" }, "quarter")).toEqual({ kind: "ok" });
    expect(periodWriteVerdict(q1, { kind: "kickoff" }, "quarter")).toEqual({
      kind: "stale",
      message: "Another phone already started Q1.",
    });
    // Kicked off with no period started yet (a two-step kickoff).
    expect(periodWriteVerdict(periodStateOf("in_progress", [lineup]), { kind: "kickoff" }, "half").kind).toBe("stale");
  });

  it("kicks off a game left in progress with no lineup (the picker shows)", () => {
    expect(periodWriteVerdict(periodStateOf("in_progress", []), { kind: "kickoff" }, "quarter")).toEqual({ kind: "ok" });
  });

  it("refuses a second start of a period, or of one already behind the game", () => {
    expect(periodWriteVerdict(q1Break, { kind: "period_start", period: 2 }, "quarter")).toEqual({ kind: "ok" });
    expect(periodWriteVerdict(q2, { kind: "period_start", period: 2 }, "quarter")).toEqual({
      kind: "stale",
      message: "Another phone already started Q2.",
    });
    expect(periodWriteVerdict(q2, { kind: "period_start", period: 1 }, "half")).toEqual({
      kind: "stale",
      message: "Another phone already started H2.",
    });
  });

  it("ends a period once: a second end is already done, an end behind the game is stale", () => {
    expect(periodWriteVerdict(q1, { kind: "period_end", period: 1 }, "quarter")).toEqual({ kind: "ok" });
    expect(periodWriteVerdict(q1Break, { kind: "period_end", period: 1 }, "quarter")).toEqual({ kind: "duplicate" });
    expect(periodWriteVerdict(q2, { kind: "period_end", period: 1 }, "quarter")).toEqual({
      kind: "stale",
      message: "Another phone already started Q2.",
    });
  });

  it("takes a break lineup at the break and refuses it once the next period is under way", () => {
    expect(periodWriteVerdict(q1Break, { kind: "break_lineup" }, "quarter")).toEqual({ kind: "ok" });
    expect(periodWriteVerdict(q1Break, { kind: "break_lineup", period: 2 }, "quarter")).toEqual({ kind: "ok" });
    expect(periodWriteVerdict(q2, { kind: "break_lineup" }, "quarter")).toEqual({
      kind: "stale",
      message: "Another phone already started Q2.",
    });
    // Netball names the period: Q2's lineup is stale once Q2 has started,
    // even after Q2 has ended too.
    const q2Break = periodStateOf("in_progress", [lineup, start(1), end(1), start(2), end(2)]);
    expect(periodWriteVerdict(q2Break, { kind: "break_lineup", period: 2 }, "quarter").kind).toBe("stale");
    expect(periodWriteVerdict(q2Break, { kind: "break_lineup", period: 3 }, "quarter")).toEqual({ kind: "ok" });
  });

  it("takes a lineup change in the period being played, not in one that's over", () => {
    expect(periodWriteVerdict(q1, { kind: "live_lineup", period: 1 }, "quarter")).toEqual({ kind: "ok" });
    expect(periodWriteVerdict(q1Break, { kind: "live_lineup", period: 1 }, "half")).toEqual({
      kind: "stale",
      message: "Another phone already ended H1.",
    });
    expect(periodWriteVerdict(q2, { kind: "live_lineup", period: 1 }, "quarter").kind).toBe("stale");
  });

  it("finishes once, and refuses period writes on a finished game", () => {
    const done = periodStateOf("completed", [lineup, start(1), end(1), { type: "game_finalised", metadata: {} }]);
    expect(periodWriteVerdict(q1Break, { kind: "finalise" }, "quarter")).toEqual({ kind: "ok" });
    expect(periodWriteVerdict(done, { kind: "finalise" }, "quarter")).toEqual({ kind: "duplicate" });
    expect(periodWriteVerdict(done, { kind: "period_start", period: 2 }, "quarter")).toEqual({
      kind: "stale",
      message: "This game is already finished.",
    });
  });
});

describe("lineupWrite / periodShort", () => {
  it("reads a lineup with a time as a change in that period, without one as a break lineup", () => {
    expect(lineupWrite({ quarter: 2 })).toEqual({ kind: "live_lineup", period: 2 });
    expect(lineupWrite(undefined)).toEqual({ kind: "break_lineup" });
  });

  it("names periods as the Start buttons do", () => {
    expect(periodShort("quarter", 2)).toBe("Q2");
    expect(periodShort("half", 1)).toBe("H1");
    expect(periodShort("period", 3)).toBe("P3");
  });
});
