// ─── Which score an undo tap takes back ──────────────────────
// Two phones can score in the same game. Each undo used to take back
// "the latest score still standing", which might be the other phone's:
// the runner's strip offered to undo its opposition goal and the coach's
// goal vanished instead (UX round 2, 24 Oct 2026). Now the phone names
// the score: the one its undo strip shows, by the event's id, or, while
// that score is still on its way to the server, by its write's
// idempotency key (the id of an optimistic event on screen isn't a row's).
//
// Pure. The live actions read the game's scores and undos (in order) and
// ask this which one to take back.

import { isOptimisticEventId, type OptimisticEventInput } from "@/lib/live/optimisticEvents";
import { takeUndoTarget } from "@/lib/live/scoreUndo";
import type { GameEvent } from "@/lib/types";

/** The score an undo names: a saved event's id, or its write's key. */
export interface UndoTargetRef {
  eventId?: string | null;
  key?: string | null;
}

interface ScoreRow {
  id: string;
  type: string;
  idempotency_key?: string | null;
}

export type UndoResolution<T> =
  /** Take back this one. */
  | { kind: "target"; target: T }
  /** Nothing standing to take back (an undo that names nothing). */
  | { kind: "none" }
  /** This undo has already landed (the write queue replaying it). */
  | { kind: "done" }
  /** The named score is already gone: say so and write nothing. */
  | { kind: "gone"; message: string };

export const UNDO_GONE_MESSAGE = "That score was already taken back on another phone.";
/**
 * The named score isn't in the game at all: its write never saved (a tap
 * made offline that didn't get through). Round 3 (24 Oct 2026): such an
 * undo used to take back an earlier, saved score instead.
 */
export const UNDO_MISSING_MESSAGE = "That score didn't save, so there's nothing to take back.";

/**
 * The undo's target among `rows` (the game's scores and score_undos in
 * the order they landed). With `ref`, exactly that score, if it still
 * stands; without one (an older phone's queued undo), the latest
 * standing score of `fallbackTypes` (every score type by default).
 */
export function resolveUndoTarget<T extends ScoreRow>(
  rows: readonly T[],
  scoreTypes: ReadonlySet<string>,
  ref: UndoTargetRef | null,
  opts: { ownKey?: string | null; fallbackTypes?: ReadonlySet<string> } = {},
): UndoResolution<T> {
  if (opts.ownKey && rows.some((r) => r.type === "score_undo" && r.idempotency_key === opts.ownKey)) {
    return { kind: "done" };
  }
  const standing: T[] = [];
  for (const row of rows) {
    if (row.type === "score_undo") takeUndoTarget(standing, (row as { metadata?: unknown }).metadata);
    else if (scoreTypes.has(row.type)) standing.push(row);
  }
  const eventId = ref?.eventId && !isOptimisticEventId(ref.eventId) ? ref.eventId : null;
  const key = ref?.key ?? null;
  if (eventId || key) {
    const named = rows.find(
      (r) => scoreTypes.has(r.type) && ((eventId !== null && r.id === eventId) || (key !== null && r.idempotency_key === key)),
    );
    if (!named) return { kind: "gone", message: UNDO_MISSING_MESSAGE };
    if (!standing.includes(named)) return { kind: "gone", message: UNDO_GONE_MESSAGE };
    return { kind: "target", target: named };
  }
  const fallback = opts.fallbackTypes ?? scoreTypes;
  for (let i = standing.length - 1; i >= 0; i--) {
    if (fallback.has(standing[i].type)) return { kind: "target", target: standing[i] };
  }
  return { kind: "none" };
}

/**
 * The undo's arguments as the write queue hands them over. An undo
 * queued before it named its score (an op saved on a phone that went
 * offline mid-game) has the idempotency key where the target now goes.
 */
export function undoArgs(target: unknown, idempotencyKey: string | undefined): { ref: UndoTargetRef | null; key: string | undefined } {
  if (typeof target === "string") return { ref: null, key: target };
  if (target && typeof target === "object") {
    const t = target as UndoTargetRef;
    const ref: UndoTargetRef = {
      eventId: typeof t.eventId === "string" ? t.eventId : null,
      key: typeof t.key === "string" ? t.key : null,
    };
    return { ref: ref.eventId || ref.key ? ref : null, key: idempotencyKey };
  }
  return { ref: null, key: idempotencyKey };
}

/** The ref a phone sends for an event on its screen. */
export function undoRefFor(event: { id: string; idempotency_key?: string | null }): UndoTargetRef {
  if (isOptimisticEventId(event.id)) return { key: event.idempotency_key ?? event.id.slice("optimistic-".length) };
  return { eventId: event.id };
}

export type UndoTap =
  /** Write this undo (shown at once) naming `target`. */
  | { kind: "undo"; optimistic: OptimisticEventInput; target: UndoTargetRef }
  /** The strip's score was already taken back on the other phone. */
  | { kind: "gone" }
  /**
   * The strip's score isn't on screen: its write never saved. Nothing to
   * take back, and never another score in its place.
   */
  | { kind: "missing" }
  /** No score standing. */
  | { kind: "none" };

/**
 * What an undo tap does on a replay screen (`events`: the server's and
 * the writes not back yet). The strip names this phone's last score
 * (`namedKey`, its write's key): that one, if it still stands. With
 * nothing named (the strip settled to "Undo last score"), the latest
 * standing score on screen, named exactly so the server takes back the
 * same one. A named score that isn't on screen never saved: nothing to
 * do (it used to fall back to the latest, an earlier saved score).
 */
export function undoTap(events: readonly GameEvent[], scoreTypes: ReadonlySet<string>, namedKey: string | null): UndoTap {
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const standing: GameEvent[] = [];
  for (const ev of sorted) {
    if (scoreTypes.has(ev.type)) standing.push(ev);
    else if (ev.type === "score_undo") takeUndoTarget(standing, ev.metadata);
  }
  let pick: GameEvent | undefined;
  if (namedKey) {
    const named = sorted.find((e) => scoreTypes.has(e.type) && e.idempotency_key === namedKey);
    if (!named) return { kind: "missing" };
    if (!standing.includes(named)) return { kind: "gone" };
    pick = named;
  }
  pick ??= standing[standing.length - 1];
  if (!pick) return { kind: "none" };
  return {
    kind: "undo",
    optimistic: {
      type: "score_undo",
      player_id: pick.player_id ?? null,
      metadata: {
        target_event_id: pick.id,
        original_type: pick.type,
        quarter: (pick.metadata as { quarter?: number } | null)?.quarter,
      },
    },
    target: undoRefFor(pick),
  };
}
