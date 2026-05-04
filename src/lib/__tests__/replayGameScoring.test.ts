// Coverage for the scoring slice of replayGame:
//
//   1. Per-quarter breakdown (scoreByQuarter) is populated by
//      goal/behind/opponent_* events using the running quarter
//      from quarter_start.
//   2. score_undo decrements the cumulative tally AND the
//      per-quarter slot it was originally booked to. Without this
//      a fresh page load would resurrect undone scores — the
//      latent bug Phase B fixes.
//   3. Retroactive adds (metadata.intended_quarter) attribute
//      back to the picked quarter, not the replay's currentQuarter.

import { describe, expect, it } from "vitest";
import { replayGame } from "@/lib/fairness";
import type { GameEvent } from "@/lib/types";

let evCounter = 0;
function ev(
  type: GameEvent["type"],
  metadata: Record<string, unknown> = {},
  player_id: string | null = null,
): GameEvent {
  evCounter++;
  // Use ms-resolution timestamps so events sort in insertion order.
  const t = new Date(2026, 0, 1, 12, 0, evCounter).toISOString();
  return {
    id: `e${evCounter}`,
    game_id: "g1",
    type,
    player_id,
    metadata,
    created_at: t,
    created_by: "u1",
  } as GameEvent;
}

function freshEvents() {
  evCounter = 0;
  return [
    ev("lineup_set", { lineup: { back: ["p1"], mid: ["p2"], fwd: ["p3"], bench: [] } }),
  ];
}

describe("replayGame — per-quarter scoring", () => {
  it("attributes goals to the running quarter", () => {
    const events: GameEvent[] = [
      ...freshEvents(),
      ev("quarter_start", { quarter: 1 }),
      ev("goal", {}, "p1"),
      ev("goal", {}, "p2"),
      ev("opponent_goal"),
      ev("quarter_end", { quarter: 1 }),
      ev("quarter_start", { quarter: 2 }),
      ev("behind", {}, "p3"),
      ev("opponent_behind"),
    ];
    const state = replayGame(events);
    expect(state.teamScore).toEqual({ goals: 2, behinds: 1 });
    expect(state.opponentScore).toEqual({ goals: 1, behinds: 1 });
    expect(state.scoreByQuarter[1]).toEqual({
      ours: { goals: 2, behinds: 0 },
      theirs: { goals: 1, behinds: 0 },
    });
    expect(state.scoreByQuarter[2]).toEqual({
      ours: { goals: 0, behinds: 1 },
      theirs: { goals: 0, behinds: 1 },
    });
  });

  it("score_undo decrements both cumulative and per-quarter slot", () => {
    const events: GameEvent[] = [
      ...freshEvents(),
      ev("quarter_start", { quarter: 1 }),
      ev("goal", {}, "p1"),
      ev("goal", {}, "p2"),
    ];
    // Take the second goal's id from the just-built events so the
    // undo points at it. The metadata.quarter mirrors what the
    // live undo path writes.
    const goal2Id = events[events.length - 1].id;
    events.push(
      ev(
        "score_undo",
        {
          target_event_id: goal2Id,
          original_type: "goal",
          quarter: 1,
        },
        "p2",
      ),
    );

    const state = replayGame(events);
    expect(state.teamScore).toEqual({ goals: 1, behinds: 0 });
    expect(state.scoreByQuarter[1].ours.goals).toBe(1);
    // p2's per-player tally should also be decremented.
    expect(state.playerScores.p2?.goals ?? 0).toBe(0);
    // p1's stays at 1.
    expect(state.playerScores.p1?.goals ?? 0).toBe(1);
  });

  it("score_undo of opponent goal targets opp's slot", () => {
    const events: GameEvent[] = [
      ...freshEvents(),
      ev("quarter_start", { quarter: 1 }),
      ev("opponent_goal"),
      ev("opponent_goal"),
    ];
    const oppId = events[events.length - 1].id;
    events.push(
      ev(
        "score_undo",
        {
          target_event_id: oppId,
          original_type: "opponent_goal",
          quarter: 1,
        },
        null,
      ),
    );

    const state = replayGame(events);
    expect(state.opponentScore.goals).toBe(1);
    expect(state.scoreByQuarter[1].theirs.goals).toBe(1);
  });

  it("undo of an earlier-quarter goal hits the correct slot", () => {
    // Reproduces the bug pattern: coach scores in Q1, by Q3 they
    // realise it was wrong. The undo's metadata.quarter says Q1, so
    // Q1's slot decrements (not Q3's).
    const events: GameEvent[] = [
      ...freshEvents(),
      ev("quarter_start", { quarter: 1 }),
      ev("goal", {}, "p1"),
      ev("quarter_end", { quarter: 1 }),
      ev("quarter_start", { quarter: 2 }),
      ev("quarter_end", { quarter: 2 }),
      ev("quarter_start", { quarter: 3 }),
      ev("goal", {}, "p2"),
    ];
    const q1GoalId = events[2].id;
    events.push(
      ev(
        "score_undo",
        { target_event_id: q1GoalId, original_type: "goal", quarter: 1 },
        "p1",
      ),
    );
    const state = replayGame(events);
    expect(state.teamScore.goals).toBe(1);
    expect(state.scoreByQuarter[1].ours.goals).toBe(0);
    expect(state.scoreByQuarter[3].ours.goals).toBe(1);
  });

  it("retroactive add (intended_quarter) attributes to the picked quarter", () => {
    // Coach realises mid-Q3 they missed a goal in Q1. The retro
    // event is created NOW (during Q3 replay) but metadata says
    // intended_quarter: 1. scoreByQuarter[1] should reflect it.
    const events: GameEvent[] = [
      ...freshEvents(),
      ev("quarter_start", { quarter: 1 }),
      ev("quarter_end", { quarter: 1 }),
      ev("quarter_start", { quarter: 2 }),
      ev("quarter_end", { quarter: 2 }),
      ev("quarter_start", { quarter: 3 }),
      ev("goal", { retro: true, intended_quarter: 1, quarter: 1 }, "p1"),
    ];
    const state = replayGame(events);
    expect(state.teamScore.goals).toBe(1);
    expect(state.scoreByQuarter[1].ours.goals).toBe(1);
    expect(state.scoreByQuarter[3].ours.goals).toBe(0);
  });
});
