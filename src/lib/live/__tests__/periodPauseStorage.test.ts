// A saved pause survives a reload: the clock rebuilt after it stays
// frozen at the pause instead of counting the paused seconds as play.

import { describe, expect, it } from "vitest";
import { computePeriodClockMs, RUNNING_CLOCK, togglePeriodPause } from "@/lib/live/periodClock";
import {
  parseStoredPause,
  periodPauseKey,
  readPeriodPause,
  serializePause,
  writePeriodPause,
} from "@/lib/live/periodPauseStorage";

const MIN = 60_000;

function memory() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: async (k: string) => map.get(k) ?? null,
    setItem: async (k: string, v: string) => void map.set(k, v),
    removeItem: async (k: string) => void map.delete(k),
  };
}

const clockAt = (pause: { pausedAtMs: number | null; accumulatedPauseMs: number }, nowMs: number) =>
  computePeriodClockMs({
    currentQuarter: 1,
    quarterEnded: false,
    finalised: false,
    quarterStartedAtMs: 0,
    pausedAtMs: pause.pausedAtMs,
    accumulatedPauseMs: pause.accumulatedPauseMs,
    fallbackElapsedMs: 0,
    clockMultiplier: 1,
    nowMs,
  });

describe("periodPauseStorage", () => {
  it("keeps a pause across a reload: the clock stays at the pause, not the wall time", async () => {
    const storage = memory();
    // Paused at 10:00 for a timeout; the phone reloads at 11:00.
    const paused = togglePeriodPause(RUNNING_CLOCK, 10 * MIN);
    await writePeriodPause(storage, "g1", 1, paused);

    const restored = await readPeriodPause(storage, "g1", 1);
    expect(clockAt(restored, 11 * MIN)).toBe(10 * MIN);
    // Without the saved pause, the reload counted the timeout as play.
    expect(clockAt(RUNNING_CLOCK, 11 * MIN)).toBe(11 * MIN);
  });

  it("keeps earlier pauses banked after a resume", async () => {
    const storage = memory();
    const paused = togglePeriodPause(RUNNING_CLOCK, 10 * MIN);
    const resumed = togglePeriodPause(paused, 11 * MIN);
    await writePeriodPause(storage, "g1", 1, resumed);
    const restored = await readPeriodPause(storage, "g1", 1);
    expect(restored).toEqual({ pausedAtMs: null, accumulatedPauseMs: MIN });
    expect(clockAt(restored, 15 * MIN)).toBe(14 * MIN);
  });

  it("ignores a pause saved for another period, or another game", async () => {
    const storage = memory();
    await writePeriodPause(storage, "g1", 1, togglePeriodPause(RUNNING_CLOCK, 5 * MIN));
    expect(await readPeriodPause(storage, "g1", 2)).toEqual(RUNNING_CLOCK);
    expect(await readPeriodPause(storage, "g2", 1)).toEqual(RUNNING_CLOCK);
  });

  it("reads junk or blocked storage as a running clock", async () => {
    expect(parseStoredPause("not json", 1)).toEqual(RUNNING_CLOCK);
    expect(parseStoredPause(JSON.stringify({ period: 1, pausedAtMs: "x", accumulatedPauseMs: -5 }), 1)).toEqual(RUNNING_CLOCK);
    const broken = { getItem: async () => { throw new Error("blocked"); } };
    expect(await readPeriodPause(broken, "g1", 1)).toEqual(RUNNING_CLOCK);
    expect(serializePause(1, RUNNING_CLOCK)).toBe('{"period":1,"pausedAtMs":null,"accumulatedPauseMs":0}');
    expect(periodPauseKey("g1")).toBe("siren:period-pause:g1");
  });
});
