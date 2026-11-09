// ─── What the one Undo takes back ────────────────────────────
// Every sport's live screen has one Undo (the undo strip under the
// score), and it always says what it will take back: "Undo: Roos goal —
// Mia", "Undo: foul on Sam", "Undo: Ava on for Leo". Stagehand round 9
// (9 Nov 2026) found it named the last score after a swap or a foul,
// didn't take fouls back at all, and a swap's toast carried a second
// Undo beside it.
//
// The rule: the newest thing this phone did that can still be taken
// back, else (nothing of this phone's left) the newest score or foul
// standing in the game, whoever recorded it. This phone's own come first
// so a parent's Undo on the game-day link takes back their score, not
// the coach's later one (two-phones.spec.ts).
//
//   - A score or a foul: from the game's events, so it's undoable as
//     long as it stands (not taken back here, on the other phone, or by
//     Scores and fixes).
//   - A swap (or another change the screen can put back, a sit-out):
//     only while it's the newest thing this phone did, in the same
//     period. Anything after it (another swap, an injury, a score) and
//     putting it back could undo the wrong thing, so it drops.
//
// Pure: the screens keep this phone's actions (useOneUndo) and hand
// them over with the events.

import { takeUndoTarget } from "@/lib/live/scoreUndo";

/** The fields of a game event this reads. */
export interface UndoEvent {
  id: string;
  type: string;
  player_id: string | null;
  created_at: string;
  idempotency_key?: string | null;
  metadata?: unknown;
}

/** Something this phone did, oldest first, in tap order (`seq`). */
export type OwnAction =
  /** A score: its write's key (the event's idempotency_key). `text` is what the strip said when it was recorded. */
  | { kind: "score"; seq: number; key: string; text?: string }
  /** A foul (basketball): its write's key. */
  | { kind: "foul"; seq: number; key: string }
  /**
   * A change the screen puts back itself (a swap, "Make all swaps", a
   * sit-out). `undone` once it has been.
   */
  | { kind: "change"; seq: number; period: number | null; label: string; undone?: boolean }
  /** Anything else that moves kids (an injury and who came on, a fill): a change before it can't be put back. */
  | { kind: "other"; seq: number };

export type Undoable =
  | { kind: "score"; event: UndoEvent; mine: boolean; text?: string }
  | { kind: "foul"; event: UndoEvent; mine: boolean }
  | { kind: "change"; action: Extract<OwnAction, { kind: "change" }> };

const byTime = (a: UndoEvent, b: UndoEvent) => a.created_at.localeCompare(b.created_at);
const isFoulUndo = (e: UndoEvent) => Boolean((e.metadata as { undo?: unknown } | null | undefined)?.undo);

/** The game's scores still standing, oldest first. */
export function standingScoreEvents<E extends UndoEvent>(events: readonly E[], scoreTypes: ReadonlySet<string>): E[] {
  const standing: E[] = [];
  for (const ev of [...events].sort(byTime)) {
    if (scoreTypes.has(ev.type)) standing.push(ev);
    else if (ev.type === "score_undo") takeUndoTarget(standing, ev.metadata);
  }
  return standing;
}

/**
 * The fouls still standing, oldest first. A foul taken back (`undo`)
 * takes off that kid's latest, as the replay's count does.
 */
export function standingFoulEvents<E extends UndoEvent>(events: readonly E[]): E[] {
  const standing: E[] = [];
  for (const ev of [...events].sort(byTime)) {
    if (ev.type !== "foul" || !ev.player_id) continue;
    if (!isFoulUndo(ev)) {
      standing.push(ev);
      continue;
    }
    for (let i = standing.length - 1; i >= 0; i--) {
      if (standing[i].player_id === ev.player_id) {
        standing.splice(i, 1);
        break;
      }
    }
  }
  return standing;
}

/**
 * What Undo takes back now, or null. `events`: the game's (the server's
 * and this phone's writes not back yet). `own`: this phone's actions,
 * oldest first. `period`: the period in play (a change from an earlier
 * one can't be put back).
 */
export function lastUndoable(input: {
  events: readonly UndoEvent[];
  scoreTypes: ReadonlySet<string>;
  own: readonly OwnAction[];
  period: number | null;
}): Undoable | null {
  const { events, scoreTypes, own, period } = input;
  const scores = standingScoreEvents(events, scoreTypes);
  const fouls = standingFoulEvents(events);
  const newestSeq = own.reduce((n, a) => Math.max(n, a.seq), -Infinity);

  // This phone's, newest first.
  for (const a of [...own].sort((x, y) => y.seq - x.seq)) {
    if (a.kind === "score") {
      const ev = scores.find((s) => s.idempotency_key === a.key);
      if (ev) return { kind: "score", event: ev, mine: true, text: a.text };
    } else if (a.kind === "foul") {
      const ev = fouls.find((f) => f.idempotency_key === a.key);
      if (ev) return { kind: "foul", event: ev, mine: true };
    } else if (a.kind === "change") {
      if (!a.undone && a.seq === newestSeq && a.period === period) return { kind: "change", action: a };
    }
  }

  // Nothing of this phone's: the newest score or foul in the game.
  const latest = [...scores, ...fouls].sort(byTime).at(-1);
  if (!latest) return null;
  return scoreTypes.has(latest.type)
    ? { kind: "score", event: latest, mine: false }
    : { kind: "foul", event: latest, mine: false };
}

/** "Roos goal", "Sharks 2-pointer": a score event's type, in plain words. */
function scoreWords(type: string, teamName: string, opponentName: string): string {
  const theirs = type.startsWith("opponent_");
  const what = type
    .replace(/^opponent_/, "")
    .replace("two_pointer", "2-pointer")
    .replace("three_pointer", "3-pointer")
    .replace("conversion_attempt", "conversion")
    .replace("girls_try", "girl's try")
    .replace(/_/g, " ");
  return `${theirs ? opponentName : teamName} ${what}`;
}

/**
 * What the strip says Undo takes back, after "Undo: ": "Roos goal — Mia",
 * "Sharks goal", "foul on Sam", "Ava on for Leo".
 */
export function undoableLabel(
  pick: Undoable,
  names: { teamName: string; opponentName: string; firstName: (playerId: string) => string },
): string {
  if (pick.kind === "change") return pick.action.label;
  if (pick.kind === "foul") return `foul on ${pick.event.player_id ? names.firstName(pick.event.player_id) : "a player"}`;
  if (pick.text) return pick.text;
  const ours = !pick.event.type.startsWith("opponent_");
  const who = ours && pick.event.player_id ? ` — ${names.firstName(pick.event.player_id)}` : "";
  return `${scoreWords(pick.event.type, names.teamName, names.opponentName)}${who}`;
}

/**
 * A swap's words on the strip: "Ava on for Leo", "Ava on" (an empty
 * spot), "the 3 swaps" ("Make all swaps").
 */
export function swapUndoLabel(pairs: readonly { off: string | null; on: string }[], firstName: (playerId: string) => string): string {
  if (pairs.length !== 1) return `the ${pairs.length} swaps`;
  const [{ off, on }] = pairs;
  return off ? `${firstName(on)} on for ${firstName(off)}` : `${firstName(on)} on`;
}

/** The toast after Undo put a swap back: "Swap undone", or "Swaps undone" for a batch. */
export function swapsUndoneText(label: string): string {
  return label.startsWith("the ") ? "Swaps undone" : "Swap undone";
}
