// ─── A period's clock pause, as game events ──────────────────────
// Every sport's live clock is rebuilt from the period's quarter_start
// time, so a pause (a timeout, an injury stoppage) that lived only on
// the phone was lost on a reload: the clock came back running, on by
// the stoppage, and every kid on the field was credited minutes they
// sat through. Netball's ran past the hooter and ended the quarter
// (round-2 usability test, 24 Oct 2026). Basketball and touch kept
// theirs on the phone, so a second phone still never saw it.
//
// Now a pause and a resume are each a `clock_pause` game event
// (recordClockPause, live/actions.ts):
//   { quarter, paused, elapsed_ms, at_ms }
// `paused: false` is the resume. `elapsed_ms` is the clock's reading
// (game ms into the period, the frame of every other event's stamp)
// and `at_ms` the writing phone's wall clock. The period's latest one
// is all a screen needs: paused, the clock reads `elapsed_ms`; running
// again, it reads `elapsed_ms` plus the time since `at_ms`. A reload,
// a second phone and the replay all get the same clock.
//
// Minutes don't need the events: each sport's replay credits time from
// its events' clock readings, which a pause already holds still.

import type { GameEvent } from "@/lib/types";
import { RUNNING_CLOCK, type PeriodPause } from "@/lib/live/periodClock";

/** What recordClockPause saves (the event's metadata). */
export interface ClockPauseInput {
  quarter: number;
  /** true: the clock stopped. false: it started again. */
  paused: boolean;
  /** The clock's reading, in game ms into the period. */
  elapsed_ms: number;
  /** When, on the writing phone's clock (epoch ms). */
  at_ms: number;
}

/** A period's latest pause or resume. */
export interface ClockPauseMark {
  /** The event's idempotency key (its write's op id), else its id. */
  key: string;
  paused: boolean;
  elapsedMs: number;
  atMs: number;
}

export function isClockPauseInput(v: unknown): v is ClockPauseInput {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.quarter === "number" &&
    Number.isInteger(m.quarter) &&
    m.quarter >= 1 &&
    typeof m.paused === "boolean" &&
    typeof m.elapsed_ms === "number" &&
    Number.isFinite(m.elapsed_ms) &&
    m.elapsed_ms >= 0 &&
    typeof m.at_ms === "number" &&
    Number.isFinite(m.at_ms)
  );
}

/** The save for a tap on Pause or Resume. */
export function clockPauseInput(
  period: number,
  paused: boolean,
  elapsedMs: number,
  nowMs: number,
): ClockPauseInput {
  return { quarter: period, paused, elapsed_ms: Math.max(0, Math.round(elapsedMs)), at_ms: nowMs };
}

/**
 * The latest pause or resume of `period` while it's in play, from the
 * game's events in order (the server's, then any not saved yet). Null
 * when the clock hasn't stopped this period, or the period isn't in
 * play (not started, or ended: its quarter_end holds the clock then).
 * A period started again (a restarted game's new Q1) starts clean.
 */
export function lastClockPause(events: readonly GameEvent[], period: number): ClockPauseMark | null {
  if (period < 1) return null;
  let inPeriod = false;
  let mark: ClockPauseMark | null = null;
  for (const ev of events) {
    const meta = (ev.metadata ?? {}) as { quarter?: unknown };
    if (ev.type === "quarter_start") {
      inPeriod = meta.quarter === period;
      mark = null;
    } else if (ev.type === "quarter_end") {
      inPeriod = false;
      mark = null;
    } else if (ev.type === "clock_pause" && inPeriod && meta.quarter === period) {
      const input = ev.metadata;
      if (isClockPauseInput(input)) {
        mark = { key: ev.idempotency_key ?? ev.id, paused: input.paused, elapsedMs: input.elapsed_ms, atMs: input.at_ms };
      }
    }
  }
  return inPeriod ? mark : null;
}

/**
 * The pause for computePeriodClockMs (netball, rugby, soccer's family,
 * basketball, touch's family): banked so the clock reads the mark's
 * `elapsed_ms` at its `at_ms`, and frozen there when it's a pause.
 * `startedAtMs` is the period's quarter_start time, as the screen
 * passes it to computePeriodClockMs.
 */
export function periodPauseFromMark(
  mark: ClockPauseMark | null,
  startedAtMs: number | null,
  clockMultiplier: number,
): PeriodPause {
  if (!mark || startedAtMs === null) return RUNNING_CLOCK;
  const multiplier = clockMultiplier > 0 ? clockMultiplier : 1;
  return {
    pausedAtMs: mark.paused ? mark.atMs : null,
    accumulatedPauseMs: mark.atMs - startedAtMs - mark.elapsedMs / multiplier,
  };
}

/** periodPauseFromMark of the period's latest mark in `events`. */
export function periodPauseFromEvents(
  events: readonly GameEvent[],
  period: number,
  startedAtMs: number | null,
  clockMultiplier: number,
): PeriodPause {
  return periodPauseFromMark(lastClockPause(events, period), startedAtMs, clockMultiplier);
}

/**
 * AFL's live store clock from a mark, at `nowMs`: the game ms banked
 * and whether it's running (the store then starts it from `nowMs`).
 */
export function storeClockFromMark(
  mark: Pick<ClockPauseMark, "paused" | "elapsedMs" | "atMs">,
  nowMs: number,
  clockMultiplier: number,
): { accumulatedMs: number; running: boolean } {
  if (mark.paused) return { accumulatedMs: mark.elapsedMs, running: false };
  const multiplier = clockMultiplier > 0 ? clockMultiplier : 1;
  return { accumulatedMs: mark.elapsedMs + Math.max(0, nowMs - mark.atMs) * multiplier, running: true };
}

/** A write-queue op, as far as a saved pause needs it. */
export interface QueuedOp {
  id: string;
  kind: string;
  args: unknown[];
  queuedAt: number;
}

/**
 * `events` with the pauses and resumes still in the write queue (no
 * signal, or a reload before they saved) as the events they'll insert,
 * for `gameId`. They go last, in the queue's order: the game's writes
 * share one queue lane, so nothing still queued is older than what's
 * saved. A copy of a queued one already in `events` (the screen's
 * optimistic copy, or the server's row while the save's reply is on its
 * way) gives way to the queue's, so a pause queued before a reload
 * can't land after a resume made since.
 */
export function withQueuedClockPauses(
  events: readonly GameEvent[],
  queue: readonly QueuedOp[],
  gameId: string,
): readonly GameEvent[] {
  const queued: GameEvent[] = [];
  for (const op of queue) {
    if (op.kind !== "recordClockPause" || op.args[1] !== gameId) continue;
    const input = op.args[2];
    if (!isClockPauseInput(input)) continue;
    queued.push({
      id: `queued-${op.id}`,
      game_id: gameId,
      type: "clock_pause",
      player_id: null,
      metadata: { ...input },
      created_by: null,
      created_at: new Date(op.queuedAt).toISOString(),
      idempotency_key: op.id,
    });
  }
  if (queued.length === 0) return events;
  const queuedKeys = new Set(queued.map((e) => e.idempotency_key));
  return [
    ...events.filter((e) => !(e.type === "clock_pause" && e.idempotency_key && queuedKeys.has(e.idempotency_key))),
    ...queued,
  ];
}

/**
 * The latest of `saved` (the replay's mark) and this game's pauses
 * still in the write queue for `period`: AFL's live store has no events
 * list to merge them into.
 */
export function withQueuedClockPauseMark(
  saved: ClockPauseMark | null,
  queue: readonly QueuedOp[],
  gameId: string,
  period: number,
): ClockPauseMark | null {
  let mark = saved;
  for (const op of queue) {
    if (op.kind !== "recordClockPause" || op.args[1] !== gameId) continue;
    const input = op.args[2];
    if (!isClockPauseInput(input) || input.quarter !== period) continue;
    mark = { key: op.id, paused: input.paused, elapsedMs: input.elapsed_ms, atMs: input.at_ms };
  }
  return mark;
}
