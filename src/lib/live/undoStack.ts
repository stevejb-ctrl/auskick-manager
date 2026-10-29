// ─── The scores Undo can take back, newest last ───────────────
// AFL and netball kept only the score this phone last tapped: after one
// undo, a reload, or a score from the other phone, the strip was gone
// and a wrong score stayed until the break (usability pass, 26 Oct
// 2026). The other sports undo from the game's events, one tap at a
// time back through the scores. These two keep their own score stores,
// so the stack is the scores the server has standing plus this phone's
// taps still on their way, less the ones this phone has taken back.

import type { GameEvent } from "@/lib/types";
import { takeUndoTarget } from "@/lib/live/scoreUndo";
import { isOptimisticEventId } from "@/lib/live/optimisticEvents";
import type { UndoTargetRef } from "@/lib/live/undoTarget";

/** AFL's scores, ours and theirs. */
export const AFL_SCORE_TYPES: ReadonlySet<string> = new Set(["goal", "behind", "opponent_goal", "opponent_behind"]);
/** Netball's goals, ours and theirs. */
export const NETBALL_SCORE_TYPES: ReadonlySet<string> = new Set(["goal", "opponent_goal"]);

export interface StackScore {
  /** The saved event, once the server has it. */
  eventId: string | null;
  /** Its write's key (the event's idempotency_key). */
  key: string | null;
  /** "goal", "behind", "opponent_goal", … */
  type: string;
  playerId: string | null;
  quarter: number;
}

/** The game's scores still standing (not taken back), oldest first. */
export function standingScores(events: readonly GameEvent[], scoreTypes: ReadonlySet<string>): StackScore[] {
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const standing: GameEvent[] = [];
  for (const ev of sorted) {
    if (scoreTypes.has(ev.type)) standing.push(ev);
    else if (ev.type === "score_undo") takeUndoTarget(standing, ev.metadata);
  }
  return standing.map((ev) => ({
    eventId: isOptimisticEventId(ev.id) ? null : ev.id,
    key: ev.idempotency_key ?? null,
    type: ev.type,
    playerId: ev.player_id ?? null,
    quarter: ((ev.metadata ?? {}) as { quarter?: number }).quarter ?? 0,
  }));
}

/** The ids an undo of this score is known by (to mark it taken back). */
export function stackIds(score: StackScore): string[] {
  return [score.eventId, score.key].filter((x): x is string => Boolean(x));
}

/** What the undo write names: the saved event, else its write's key. */
export function stackRef(score: StackScore): UndoTargetRef {
  return score.eventId ? { eventId: score.eventId } : { key: score.key };
}

/**
 * The server's standing scores, then this phone's taps it hasn't got
 * yet, less what this phone has taken back. The last is what Undo takes.
 */
export function undoStack(
  server: readonly StackScore[],
  local: readonly StackScore[],
  undone: ReadonlySet<string>,
): StackScore[] {
  const saved = new Set(server.map((s) => s.key).filter(Boolean));
  const pending = local.filter((s) => !s.key || !saved.has(s.key));
  return [...server, ...pending].filter((s) => !stackIds(s).some((id) => undone.has(id)));
}
