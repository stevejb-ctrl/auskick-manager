// ─── Rugby's 50% floor on the live screen ────────────────────
// Live v3, Phase 8: league and union say "Needs N′ more" under a kid at
// risk of the floor, and the info line counts them. At risk means by
// full time (lib/live/minGameTime), so nobody is flagged at the kickoff,
// and time away (a late arrival) comes off the kid's game.

import { describe, expect, it } from "vitest";
import type { GameEvent, GameEventType } from "@/lib/types";
import { leagueMinTimeStates } from "@/lib/sports/rugby_league/minTime";

const MIN = 60_000;
let ts = 0;
function ev(type: GameEventType, metadata: Record<string, unknown> = {}, playerId: string | null = null): GameEvent {
  ts++;
  return {
    id: `e${ts}`,
    game_id: "g1",
    type,
    player_id: playerId,
    metadata,
    created_at: new Date(Date.UTC(2026, 10, 1, 9, 0, ts)).toISOString(),
    created_by: null,
  } as GameEvent;
}

// Two 20-minute halves; F1, F2 and B1 start, S1 on the bench.
function kickoff(): GameEvent[] {
  return [
    ev("lineup_set", { lineup: { forwards: ["F1", "F2"], backs: ["B1"], bench: ["S1"] } }),
    ev("quarter_start", { quarter: 1 }),
  ];
}

const base = { periodMs: 20 * MIN, periodCount: 2, minPct: 50, soonMs: 5 * MIN, playerIds: ["F1", "F2", "B1", "S1"], out: new Set<string>() };

describe("leagueMinTimeStates", () => {
  it("flags nobody at the kickoff, the bench kid included", () => {
    const states = leagueMinTimeStates({ ...base, events: kickoff(), currentQuarter: 1, elapsedMs: 0, gameElapsedMs: 0 });
    expect(Array.from(states.values()).filter((s) => s.atRisk)).toEqual([]);
  });

  it("flags nothing before kickoff, or with no floor", () => {
    expect(leagueMinTimeStates({ ...base, events: kickoff().slice(0, 1), currentQuarter: 0, elapsedMs: 0, gameElapsedMs: 0 }).size).toBe(0);
    expect(leagueMinTimeStates({ ...base, minPct: 0, events: kickoff(), currentQuarter: 1, elapsedMs: 5 * MIN, gameElapsedMs: 5 * MIN }).size).toBe(0);
  });

  it("a bench kid who sat out H1 is at risk 11 minutes into H2: needs 8′ more, 9 left", () => {
    // S1 came on at H1 8:00 and played 12 minutes, then sat all of H2.
    const events = [
      ...kickoff(),
      ev("swap", { off_player_id: "F2", on_player_id: "S1", quarter: 1, elapsed_ms: 8 * MIN }),
      ev("quarter_end", { quarter: 1, elapsed_ms: 20 * MIN }),
      ev("lineup_set", { lineup: { forwards: ["F1", "F2"], backs: ["B1"], bench: ["S1"] } }),
      ev("quarter_start", { quarter: 2 }),
    ];
    const states = leagueMinTimeStates({ ...base, events, currentQuarter: 2, elapsedMs: 11 * MIN, gameElapsedMs: 31 * MIN });
    const s1 = states.get("S1")!;
    expect(s1.atRisk).toBe(true);
    expect(s1.neededMin).toBe(8);
    expect(s1.canReach).toBe(true);
    // F1 has played all 31 minutes: well clear.
    expect(states.get("F1")!.atRisk).toBe(false);
  });

  it("the same kid at H2 4:00 isn't flagged yet: 16 left, room for a sub's wait", () => {
    const events = [
      ...kickoff(),
      ev("swap", { off_player_id: "F2", on_player_id: "S1", quarter: 1, elapsed_ms: 8 * MIN }),
      ev("quarter_end", { quarter: 1, elapsed_ms: 20 * MIN }),
      ev("lineup_set", { lineup: { forwards: ["F1", "F2"], backs: ["B1"], bench: ["S1"] } }),
      ev("quarter_start", { quarter: 2 }),
    ];
    const s1 = leagueMinTimeStates({ ...base, events, currentQuarter: 2, elapsedMs: 4 * MIN, gameElapsedMs: 24 * MIN }).get("S1")!;
    expect(s1.atRisk).toBe(false);
  });

  it("a kid who's hurt isn't flagged", () => {
    const events = [...kickoff(), ev("injury", { injured: true, quarter: 1, elapsed_ms: 1 * MIN }, "S1")];
    const s1 = leagueMinTimeStates({ ...base, events, currentQuarter: 1, elapsedMs: 19 * MIN, gameElapsedMs: 19 * MIN, out: new Set(["S1"]) }).get("S1")!;
    expect(s1.atRisk).toBe(false);
  });

  it("a late arrival is held to the time they could play", () => {
    // L1 arrives at half time and plays none of H2 so far.
    const events = [
      ...kickoff(),
      ev("quarter_end", { quarter: 1, elapsed_ms: 20 * MIN }),
      ev("player_arrived", { quarter: 2, elapsed_ms: 0 }, "L1"),
      ev("quarter_start", { quarter: 2 }),
    ];
    const l1 = leagueMinTimeStates({ ...base, playerIds: ["L1"], events, currentQuarter: 2, elapsedMs: 2 * MIN, gameElapsedMs: 22 * MIN }).get("L1")!;
    // Half of the 20 minutes they could play: 10, with 18 left.
    expect(l1.neededMin).toBe(10);
    expect(l1.atRisk).toBe(false);
  });
});
