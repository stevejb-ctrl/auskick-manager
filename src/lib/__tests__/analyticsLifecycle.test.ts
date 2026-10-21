// What game_completed and game_created report, worked out from the
// game's own rows. src/lib/analytics/lifecycle.ts.
import { describe, expect, it } from "vitest";
import { daysUntilGame, gameTotals } from "@/lib/analytics/lifecycle";

const ev = (type: string, metadata: Record<string, unknown> = {}) => ({ type, metadata });

describe("gameTotals", () => {
  it("adds up each period's clock at its end, and counts the swaps", () => {
    const events = [
      ev("lineup_set"),
      ev("quarter_start", { quarter: 1 }),
      ev("swap"),
      ev("quarter_end", { quarter: 1, elapsed_ms: 12 * 60_000 }),
      ev("swap"),
      ev("swap"),
      ev("quarter_end", { quarter: 2, elapsed_ms: 12 * 60_000 + 20_000 }),
      ev("game_finalised", { quarter: 2, elapsed_ms: 12 * 60_000 + 20_000 }),
    ];
    expect(gameTotals(events)).toEqual({ durationMin: 24, subsCount: 3 });
  });

  it("takes the last period from the finalise when it has no quarter_end", () => {
    const events = [ev("quarter_end", { quarter: 1, elapsed_ms: 600_000 }), ev("game_finalised", { quarter: 2, elapsed_ms: 600_000 })];
    expect(gameTotals(events).durationMin).toBe(20);
  });

  it("counts netball's mid-quarter subs, carried on its break and finalise events", () => {
    const sub = { positionId: "GS", outPlayerId: null, inPlayerId: "p", atMs: 1 };
    const events = [
      ev("period_break_swap", { quarter: 2, midQuarterSubs: [sub, sub] }),
      ev("game_finalised", { quarter: 4, elapsed_ms: 1, midQuarterSubs: [sub] }),
    ];
    expect(gameTotals(events).subsCount).toBe(3);
  });

  it("has no duration for a game with no clock", () => {
    expect(gameTotals([ev("game_finalised")]).durationMin).toBeNull();
  });
});

describe("daysUntilGame", () => {
  const now = Date.parse("2026-10-20T09:00:00+11:00");
  it("rounds to whole days, negative for a game already played", () => {
    expect(daysUntilGame("2026-10-25T09:00:00+11:00", now)).toBe(5);
    expect(daysUntilGame("2026-10-20T15:00:00+11:00", now)).toBe(0);
    expect(daysUntilGame("2026-10-13T09:00:00+11:00", now)).toBe(-7);
    expect(daysUntilGame("not a date", now)).toBeNull();
  });
});
