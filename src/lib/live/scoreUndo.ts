// Which score an undo removes. One rule for the replay, the score log
// and the undo action: an undo that names its target (Fix scores'
// delete, or a resolved live undo) removes that score; one that doesn't
// (older netball undos) removes the latest score still standing.
// Stagehand round 2: the netball break's score review still counted an
// undone goal because the log and the replay paired undos differently.

interface UndoableEvent {
  id: string;
  type: string;
  metadata?: unknown;
}

/** The score an undo names, if any (\`target\` is netball's older key). */
export function undoTargetId(metadata: unknown): string | null {
  const m = (metadata ?? {}) as { target_event_id?: unknown; target?: unknown };
  if (typeof m.target_event_id === "string" && m.target_event_id) return m.target_event_id;
  if (typeof m.target === "string" && m.target) return m.target;
  return null;
}

/**
 * Take an undo's score off the standing list (mutates): the named one
 * when it's still standing, else the latest. Returns the removed entry.
 */
export function takeUndoTarget<T extends { id: string }>(standing: T[], metadata: unknown): T | null {
  const named = undoTargetId(metadata);
  const i = named ? standing.findIndex((s) => s.id === named) : -1;
  const at = i >= 0 ? i : standing.length - 1;
  if (at < 0) return null;
  return standing.splice(at, 1)[0];
}

/** undo id → the score it removes, for events in order. */
export function pairScoreUndos(events: UndoableEvent[], scoreTypes: ReadonlySet<string>): Map<string, string> {
  const standing: { id: string }[] = [];
  const out = new Map<string, string>();
  for (const ev of events) {
    if (scoreTypes.has(ev.type)) standing.push({ id: ev.id });
    else if (ev.type === "score_undo") {
      const removed = takeUndoTarget(standing, ev.metadata);
      if (removed) out.set(ev.id, removed.id);
    }
  }
  return out;
}
