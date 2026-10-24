// An undo now names the score it takes back, which with two phones
// scoring isn't always the latest (UX round 2, 24 Oct 2026). Every reader
// of the event log must take back the named one, as the server, the
// score log and the soccer/touch/basketball replays already do. These
// used to pop the latest score whatever the undo said.

import { describe, expect, it } from "vitest";
import type { GameEvent } from "@/lib/types";
import { replayRugbyGame, rugbyPoints, rugbyScoreByPeriod } from "@/lib/sports/rugby_league/fairness";
import { totalConversionAttemptsByPlayer } from "@/lib/sports/rugby_league/kicks";
import { replayNetballGameForStats } from "@/lib/dashboard/netballAggregators";
import { undoTap } from "@/lib/live/undoTarget";

let n = 0;
function ev(type: string, extra: Partial<GameEvent> = {}): GameEvent {
  n += 1;
  return {
    id: `e${n}`,
    game_id: "g",
    type: type as GameEvent["type"],
    player_id: null,
    metadata: { quarter: 1, elapsed_ms: n * 1000 },
    created_by: null,
    created_at: new Date(Date.UTC(2026, 9, 24, 9, 0, n)).toISOString(),
    ...extra,
  };
}

const undoOf = (target: GameEvent) =>
  ev("score_undo", { metadata: { target_event_id: target.id, original_type: target.type, quarter: 1 } });

describe("rugby", () => {
  const points = rugbyPoints("rugby_league");
  const kickoff = [
    ev("lineup_set", { metadata: { lineup: { forwards: ["p1", "p2"], backs: [], bench: [] } } }),
    ev("quarter_start", { metadata: { quarter: 1 } }),
  ];

  it("the replay takes back the named try, not the other phone's later one", () => {
    const mine = ev("try", { player_id: "p1" });
    const theirs = ev("opponent_try");
    const s = replayRugbyGame([...kickoff, mine, theirs, undoOf(mine)], points);
    expect(s.teamScore.tries).toBe(0);
    expect(s.opponentScore.tries).toBe(1);
    expect(s.playerTries.p1 ?? 0).toBe(0);
  });

  it("the score by period takes back the named one", () => {
    const mine = ev("try", { player_id: "p1" });
    const theirs = ev("opponent_try");
    const byPeriod = rugbyScoreByPeriod([...kickoff, mine, theirs, undoOf(mine)], 4, points);
    expect(byPeriod[1].team.tries).toBe(0);
    expect(byPeriod[1].opponent.tries).toBe(1);
  });

  it("the conversion count takes back the named kick", () => {
    const tryEv = ev("try", { player_id: "p1" });
    const kick = ev("conversion_attempt", { player_id: "p2", metadata: { quarter: 1, made: true } });
    const theirs = ev("opponent_try");
    expect(totalConversionAttemptsByPlayer([...kickoff, tryEv, kick, theirs, undoOf(kick)]).p2 ?? 0).toBe(0);
  });
});

describe("netball stats", () => {
  it("take back the named goal", () => {
    const start = [ev("quarter_start", { metadata: { quarter: 1 } })];
    const mine = ev("goal", { player_id: "gs" });
    const theirs = ev("opponent_goal");
    const s = replayNetballGameForStats("g", [...start, mine, theirs, undoOf(mine)], 600);
    expect(s.playerGoals.gs ?? 0).toBe(0);
    expect(s.teamGoalsByQtr[1] ?? 0).toBe(0);
    expect(s.oppGoalsByQtr[1]).toBe(1);
  });
});

describe("undoTap", () => {
  const types = new Set(["goal", "opponent_goal"]);

  it("names the strip's score by its write key, not the other phone's later one", () => {
    const mine = ev("goal", { player_id: "p1", idempotency_key: "op-mine" });
    const theirs = ev("opponent_goal", { idempotency_key: "op-theirs" });
    const tap = undoTap([mine, theirs], types, "op-mine");
    expect(tap).toMatchObject({ kind: "undo", target: { eventId: mine.id }, optimistic: { metadata: { target_event_id: mine.id } } });
  });

  it("names a score still on its way by its key", () => {
    const pending = ev("goal", { id: "optimistic-op-1", idempotency_key: "op-1" });
    expect(undoTap([pending], types, "op-1")).toMatchObject({ kind: "undo", target: { key: "op-1" } });
  });

  it("says when the other phone already took the strip's score back", () => {
    const mine = ev("goal", { idempotency_key: "op-mine" });
    expect(undoTap([mine, undoOf(mine)], types, "op-mine")).toEqual({ kind: "gone" });
  });

  it("never falls back to another score when the strip's score never saved (round 3: offline undo)", () => {
    // Our try saved; the opposition try tapped offline was dropped, so it
    // isn't on screen any more. Undo must not take back our saved try.
    const ours = ev("goal", { player_id: "p1", idempotency_key: "op-ours" });
    expect(undoTap([ours], types, "op-dropped")).toEqual({ kind: "missing" });
  });

  it("with nothing named, names the latest standing score exactly", () => {
    const a = ev("goal");
    const b = ev("opponent_goal");
    expect(undoTap([a, b], types, null)).toMatchObject({ kind: "undo", target: { eventId: b.id } });
    expect(undoTap([], types, null)).toEqual({ kind: "none" });
  });
});
