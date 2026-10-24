// A pause is a game event, so a reload (or a second phone) rebuilds the
// clock from the events instead of losing the stoppage.
//
// Round 2 (24 Oct 2026): AFL came back running after a reload, with the
// paused minute credited as play; netball ran past the hooter and ended
// the quarter with everyone on 10:00.

import { describe, expect, it } from "vitest";
import type { GameEvent } from "@/lib/types";
import { computePeriodClockMs, togglePeriodPause, RUNNING_CLOCK } from "@/lib/live/periodClock";
import {
  clockPauseInput,
  isClockPauseInput,
  lastClockPause,
  periodPauseFromEvents,
  storeClockFromMark,
  withQueuedClockPauseMark,
} from "@/lib/live/clockPause";

const MIN = 60_000;
const KICKOFF_MS = Date.parse("2026-10-24T09:00:00.000Z");

let seq = 0;
function ev(type: string, metadata: Record<string, unknown>, atMs = KICKOFF_MS, key?: string): GameEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    game_id: "g1",
    type: type as GameEvent["type"],
    player_id: null,
    metadata,
    created_by: null,
    created_at: new Date(atMs).toISOString(),
    idempotency_key: key ?? null,
  };
}

const start = (quarter: number, atMs = KICKOFF_MS) => ev("quarter_start", { quarter }, atMs);
const pause = (quarter: number, elapsedMs: number, atMs: number, paused = true) =>
  ev("clock_pause", { ...clockPauseInput(quarter, paused, elapsedMs, atMs) }, atMs);

/** The clock netball / rugby / soccer / basketball / touch show at `nowMs`. */
function clockAt(events: GameEvent[], period: number, nowMs: number, multiplier = 1): number {
  const p = periodPauseFromEvents(events, period, KICKOFF_MS, multiplier);
  return computePeriodClockMs({
    currentQuarter: period,
    quarterEnded: false,
    finalised: false,
    quarterStartedAtMs: KICKOFF_MS,
    pausedAtMs: p.pausedAtMs,
    accumulatedPauseMs: p.accumulatedPauseMs,
    fallbackElapsedMs: 0,
    clockMultiplier: multiplier,
    nowMs,
  });
}

describe("a pause rebuilt from the events", () => {
  it("stays paused at the paused time, however long the reload comes after", () => {
    // Paused at 6:29 for an injury; the page reloads at 20:00 on the wall.
    const events = [start(1), pause(1, 6 * MIN + 29_000, KICKOFF_MS + 6 * MIN + 29_000)];
    expect(clockAt(events, 1, KICKOFF_MS + 20 * MIN)).toBe(6 * MIN + 29_000);
    // Without the event the rebuild ran on by the stoppage (netball then
    // hit its 10:00 hooter and ended the quarter).
    expect(clockAt([start(1)], 1, KICKOFF_MS + 20 * MIN)).toBe(20 * MIN);
  });

  it("carries on from the pause after a resume, the stoppage banked", () => {
    const events = [
      start(1),
      pause(1, 5 * MIN, KICKOFF_MS + 5 * MIN),
      pause(1, 5 * MIN, KICKOFF_MS + 7 * MIN, false), // two minutes stopped
    ];
    expect(clockAt(events, 1, KICKOFF_MS + 10 * MIN)).toBe(8 * MIN);
  });

  it("matches the phone's own pause and resume, so a tap and a reload agree", () => {
    // What the screen did locally: pause at 3:00, resume at 4:30.
    const local = togglePeriodPause(togglePeriodPause(RUNNING_CLOCK, KICKOFF_MS + 3 * MIN), KICKOFF_MS + 4.5 * MIN);
    const localClock = (nowMs: number) =>
      computePeriodClockMs({
        currentQuarter: 1,
        quarterEnded: false,
        finalised: false,
        quarterStartedAtMs: KICKOFF_MS,
        pausedAtMs: local.pausedAtMs,
        accumulatedPauseMs: local.accumulatedPauseMs,
        fallbackElapsedMs: 0,
        clockMultiplier: 1,
        nowMs,
      });
    const events = [start(1), pause(1, 3 * MIN, KICKOFF_MS + 3 * MIN), pause(1, 3 * MIN, KICKOFF_MS + 4.5 * MIN, false)];
    for (const now of [KICKOFF_MS + 5 * MIN, KICKOFF_MS + 9 * MIN]) {
      expect(clockAt(events, 1, now)).toBe(localClock(now));
    }
  });

  it("reads game ms on a sped-up clock (the demo's 8×)", () => {
    // 8× clock: 1 real minute is 8 game minutes. Paused at 8:00 of game time.
    const events = [start(1), pause(1, 8 * MIN, KICKOFF_MS + MIN), pause(1, 8 * MIN, KICKOFF_MS + 3 * MIN, false)];
    expect(clockAt(events, 1, KICKOFF_MS + 3.5 * MIN, 8)).toBe(12 * MIN);
  });

  it("ignores another period's pause, a pause before this period's start, and an ended period", () => {
    const q1Pause = pause(1, 4 * MIN, KICKOFF_MS + 4 * MIN);
    expect(lastClockPause([start(1), q1Pause, ev("quarter_end", { quarter: 1 }), start(2)], 2)).toBeNull();
    expect(lastClockPause([start(1), q1Pause, ev("quarter_end", { quarter: 1 })], 1)).toBeNull();
    // A restarted game's new Q1 starts running.
    expect(lastClockPause([start(1), q1Pause, start(1)], 1)).toBeNull();
    expect(lastClockPause([start(1), pause(2, MIN, KICKOFF_MS)], 1)).toBeNull();
    expect(lastClockPause([], 1)).toBeNull();
  });

  it("skips junk metadata", () => {
    expect(lastClockPause([start(1), ev("clock_pause", { quarter: 1, paused: "yes" })], 1)).toBeNull();
    expect(isClockPauseInput({ quarter: 0, paused: true, elapsed_ms: 1, at_ms: 1 })).toBe(false);
    expect(isClockPauseInput({ quarter: 1, paused: true, elapsed_ms: -1, at_ms: 1 })).toBe(false);
    expect(isClockPauseInput(clockPauseInput(2, false, 1234.6, 99))).toBe(true);
  });
});

describe("AFL's store clock from the events", () => {
  it("is held at the pause, or running on from the resume", () => {
    expect(storeClockFromMark({ paused: true, elapsedMs: 5 * MIN, atMs: 0 }, 99 * MIN, 1)).toEqual({
      accumulatedMs: 5 * MIN,
      running: false,
    });
    expect(storeClockFromMark({ paused: false, elapsedMs: 5 * MIN, atMs: 10 * MIN }, 11 * MIN, 1)).toEqual({
      accumulatedMs: 6 * MIN,
      running: true,
    });
    expect(storeClockFromMark({ paused: false, elapsedMs: 5 * MIN, atMs: 10 * MIN }, 11 * MIN, 8).accumulatedMs).toBe(13 * MIN);
  });
});

describe("AFL: a pause still in the write queue", () => {
  const op = (id: string, gameId: string, input: unknown, kind = "recordClockPause") => ({
    id,
    kind,
    args: [{ kind: "team", teamId: "t1" }, gameId, input],
    queuedAt: KICKOFF_MS + 2 * MIN,
  });
  const saved = { key: "e9", paused: false, elapsedMs: MIN, atMs: KICKOFF_MS + MIN };

  it("wins over the replay's mark, so a reload with no signal keeps it", () => {
    const mark = withQueuedClockPauseMark(saved, [op("op1", "g1", clockPauseInput(1, true, 2 * MIN, KICKOFF_MS + 2 * MIN))], "g1", 1);
    expect(mark).toEqual({ key: "op1", paused: true, elapsedMs: 2 * MIN, atMs: KICKOFF_MS + 2 * MIN });
  });

  it("takes the queue's latest: a pause queued before a reload, then a resume made since", () => {
    const mark = withQueuedClockPauseMark(
      saved,
      [op("op1", "g1", clockPauseInput(1, true, 2 * MIN, KICKOFF_MS + 2 * MIN)), op("op2", "g1", clockPauseInput(1, false, 2 * MIN, KICKOFF_MS + 4 * MIN))],
      "g1",
      1,
    );
    expect(mark?.paused).toBe(false);
  });

  it("leaves other games, other periods and other writes alone", () => {
    const input = clockPauseInput(1, true, 2 * MIN, KICKOFF_MS + 2 * MIN);
    expect(withQueuedClockPauseMark(saved, [op("op2", "g2", input)], "g1", 1)).toBe(saved);
    expect(withQueuedClockPauseMark(saved, [op("op3", "g1", input, "recordSwap")], "g1", 1)).toBe(saved);
    expect(withQueuedClockPauseMark(saved, [op("op4", "g1", { quarter: 1 })], "g1", 1)).toBe(saved);
    expect(withQueuedClockPauseMark(saved, [op("op5", "g1", input)], "g1", 2)).toBe(saved);
  });
});
