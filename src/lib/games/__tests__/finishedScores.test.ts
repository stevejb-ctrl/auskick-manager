import { describe, expect, it } from "vitest";
import type { GameEvent } from "@/lib/types";
import { finishedScoreLog, scoreFixRows, scoreKinds, type ScoreFix } from "@/lib/games/finishedScores";
import { scoreFromEvents, scorersFromEvents } from "@/lib/results";

let seq = 0;
const ev = (type: string, player_id: string | null = null, metadata: Record<string, unknown> = {}): GameEvent =>
  ({
    id: `e${++seq}`,
    game_id: "g",
    type,
    player_id,
    metadata,
    created_at: new Date(Date.UTC(2026, 9, 24, 0, 0, seq)).toISOString(),
    created_by: "u",
  }) as unknown as GameEvent;

/** Apply a fix the way the server writes it: its rows, appended to the log. */
function applyFix(sport: Parameters<typeof scoreFixRows>[0], events: GameEvent[], fix: ScoreFix): GameEvent[] {
  const rows = scoreFixRows(sport, events, fix);
  if ("error" in rows) throw new Error(rows.error);
  return [...events, ...rows.map((r) => ev(r.type, r.player_id, r.metadata))];
}

describe("scoreKinds", () => {
  it("is the sport's own scores, for each side", () => {
    expect(scoreKinds("afl").map((k) => `${k.side}:${k.type}`)).toEqual([
      "us:goal",
      "us:behind",
      "them:opponent_goal",
      "them:opponent_behind",
    ]);
    // A conversion is written as a made attempt.
    const conv = scoreKinds("rugby_league", { goalsFromPlay: false }).find((k) => k.id === "conversion")!;
    expect(conv).toMatchObject({ type: "conversion_attempt", metadata: { made: true }, scorer: true });
    expect(scoreKinds("rugby_league", { goalsFromPlay: false }).some((k) => k.id === "penalty_goal")).toBe(false);
    expect(scoreKinds("oztag").some((k) => k.id === "girls_try")).toBe(false);
    expect(scoreKinds("oztag", { girlsTry: true }).some((k) => k.id === "girls_try")).toBe(true);
    expect(scoreKinds("netball").find((k) => k.side === "them")?.scorer).toBe(false);
  });
});

describe("finishedScoreLog", () => {
  it("lists the scores still standing, by period, leaving out undone ones", () => {
    const events = [
      ev("quarter_start", null, { quarter: 1 }),
      ev("goal", "ava", { quarter: 1 }),
      ev("opponent_goal", null, { quarter: 1 }),
      ev("quarter_end", null, { quarter: 1 }),
      ev("quarter_start", null, { quarter: 2 }),
      ev("goal", "ben", {}),
      ev("goal", "cal", {}),
    ];
    events.push(ev("score_undo", "cal", { target_event_id: events[6].id }));
    const log = finishedScoreLog("soccer", events);
    expect(log.map((r) => [r.type, r.playerId, r.period, r.side])).toEqual([
      ["goal", "ava", 1, "us"],
      ["opponent_goal", null, 1, "them"],
      ["goal", "ben", 2, "us"],
    ]);
  });

  it("leaves a missed conversion off (it isn't a score)", () => {
    const events = [
      ev("quarter_start", null, { quarter: 1 }),
      ev("try", "ava", { quarter: 1 }),
      ev("conversion_attempt", "ben", { quarter: 1, made: false }),
      ev("try", "ava", { quarter: 1 }),
      ev("conversion_attempt", "ben", { quarter: 1, made: true }),
    ];
    expect(finishedScoreLog("rugby_league", events).map((r) => r.id)).toEqual([events[1].id, events[3].id, events[4].id]);
  });
});

// Round 3 (24 Oct 2026): a finished game's "Fix scores" opened a
// read-only summary. The fixes are events, so every replay (the
// summary, the scorers card, Stats) recomputes from the log.
describe("fixing a finished game's scores", () => {
  const played = (sport: string) => [
    ev("lineup_set", null, {}),
    ev("quarter_start", null, { quarter: 1 }),
    ev(sport === "basketball" ? "two_pointer" : sport === "afl" ? "goal" : "try", "ava", { quarter: 1 }),
    ev("quarter_end", null, { quarter: 1, elapsed_ms: 600_000 }),
    ev("quarter_start", null, { quarter: 2 }),
    ev(sport === "basketball" ? "opponent_three_pointer" : sport === "afl" ? "opponent_goal" : "opponent_try", null, { quarter: 2 }),
    ev("quarter_end", null, { quarter: 2, elapsed_ms: 600_000 }),
    ev("game_finalised", null, {}),
  ];

  it("adds a missed score to the period it was in", () => {
    const after = applyFix("afl", played("afl"), { op: "add", type: "behind", playerId: "ben", period: 2 });
    expect(scoreFromEvents("afl", after)).toMatchObject({ us: 7, them: 6 });
    expect(finishedScoreLog("afl", after).find((r) => r.type === "behind")).toMatchObject({ playerId: "ben", period: 2 });
  });

  it("takes off a score that wasn't one", () => {
    const events = played("basketball");
    const after = applyFix("basketball", events, { op: "delete", eventId: events[5].id });
    expect(scoreFromEvents("basketball", after)).toMatchObject({ us: 2, them: 0 });
  });

  it("changes who scored, keeping the score and its period", () => {
    for (const sport of ["afl", "basketball", "rugby_league"] as const) {
      const events = played(sport);
      const after = applyFix(sport, events, { op: "reassign", eventId: events[2].id, playerId: "ben" });
      expect(scoreFromEvents(sport, after)).toEqual(scoreFromEvents(sport, events));
      expect(scorersFromEvents(sport, after).map((s) => s.playerId)).toEqual(["ben"]);
      expect(finishedScoreLog(sport, after).find((r) => r.side === "us")).toMatchObject({ playerId: "ben", period: 1 });
    }
  });

  it("takes off any score in rugby, not just the latest", () => {
    const events = [
      ev("quarter_start", null, { quarter: 1 }),
      ev("try", "ava", { quarter: 1 }),
      ev("try", "ben", { quarter: 1 }),
      ev("game_finalised", null, {}),
    ];
    const after = applyFix("rugby_league", events, { op: "delete", eventId: events[1].id });
    expect(scorersFromEvents("rugby_league", after).map((s) => s.playerId)).toEqual(["ben"]);
  });

  it("refuses a score that's gone, or one of theirs to reassign", () => {
    const events = played("afl");
    const gone = applyFix("afl", events, { op: "delete", eventId: events[2].id });
    expect(scoreFixRows("afl", gone, { op: "delete", eventId: events[2].id })).toEqual({ error: "That score was taken off already." });
    expect(scoreFixRows("afl", events, { op: "reassign", eventId: events[5].id, playerId: "ben" })).toEqual({
      error: "Only our scores have a scorer.",
    });
    expect(scoreFixRows("afl", events, { op: "add", type: "try", playerId: null, period: 1 })).toEqual({
      error: "That isn't a score in this sport.",
    });
  });
});
