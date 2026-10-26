// AFL and netball's Undo goes back through every standing score, not
// just the one this phone last tapped (usability pass, 26 Oct 2026).

import { describe, expect, it } from "vitest";
import { standingScores, stackRef, undoStack, type StackScore } from "@/lib/live/undoStack";
import type { GameEvent } from "@/lib/types";

const TYPES = new Set(["goal", "behind", "opponent_goal", "opponent_behind"]);
let n = 0;
function ev(type: string, extra: Partial<GameEvent> = {}, metadata: Record<string, unknown> = { quarter: 1 }): GameEvent {
  n++;
  return {
    id: `e${n}`,
    game_id: "g",
    type,
    player_id: null,
    metadata,
    created_by: null,
    created_at: new Date(Date.UTC(2026, 9, 26, 9, 0, n)).toISOString(),
    idempotency_key: `k${n}`,
    ...extra,
  } as GameEvent;
}

describe("standingScores", () => {
  it("lists the scores still standing, oldest first", () => {
    const a = ev("goal", { player_id: "mia" });
    const b = ev("opponent_behind");
    const c = ev("behind", { player_id: "jo" });
    const undo = ev("score_undo", {}, { target_event_id: c.id, original_type: "behind", quarter: 1 });
    expect(standingScores([a, b, c, undo, ev("quarter_end")], TYPES).map((s) => s.eventId)).toEqual([a.id, b.id]);
    expect(standingScores([a], TYPES)[0]).toEqual({ eventId: a.id, key: a.idempotency_key, type: "goal", playerId: "mia", quarter: 1 });
  });
});

describe("undoStack", () => {
  const saved: StackScore = { eventId: "e1", key: "k1", type: "goal", playerId: "mia", quarter: 1 };
  const theirs: StackScore = { eventId: "e2", key: "k2", type: "opponent_goal", playerId: null, quarter: 1 };
  const tapped: StackScore = { eventId: null, key: "k9", type: "behind", playerId: "jo", quarter: 1 };

  it("puts this phone's unsaved taps last, and doesn't count a saved one twice", () => {
    expect(undoStack([saved, theirs], [tapped], new Set())).toEqual([saved, theirs, tapped]);
    expect(undoStack([saved, theirs], [{ ...saved, eventId: null }], new Set())).toEqual([saved, theirs]);
  });

  it("steps back one score per undo, saved or not", () => {
    let undone = new Set<string>();
    const top = () => undoStack([saved, theirs], [tapped], undone).at(-1);
    expect(top()).toBe(tapped);
    undone = new Set(Array.from(undone).concat("k9"));
    expect(top()).toBe(theirs);
    undone = new Set(Array.from(undone).concat("e2"));
    expect(top()).toBe(saved);
    undone = new Set(Array.from(undone).concat("e1"));
    expect(top()).toBeUndefined();
  });

  it("names a saved score by its event, an unsaved one by its key", () => {
    expect(stackRef(saved)).toEqual({ eventId: "e1" });
    expect(stackRef(tapped)).toEqual({ key: "k9" });
  });
});
