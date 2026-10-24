// ─── Period guard: two phones, one game ──────────────────────
// A game can be run from two phones at once (the coach's, and a parent
// on the game-day link). A phone that hasn't caught up still shows the
// screen it had: its lineup picker after the other phone kicked off,
// its break after the other phone started the next quarter. Its Start
// used to write a second kickoff or break, which overwrote the lineup
// and counted every minute twice (40:00 each in a 40-minute game) — UX
// round 2, 24 Oct 2026.
//
// The live actions ask this guard before they write a kickoff, a period
// start or end, a break lineup or a whole-lineup change, and refuse the
// write when it conflicts with the game as it stands: "Another phone
// already started Q2". Pure: liveWriteGuard.ts reads the events.

export type PeriodWord = "quarter" | "half" | "period";

/** A period word from an age group's (or sport's) own label. */
export function periodWordOf(label: string | null | undefined, fallback: PeriodWord = "quarter"): PeriodWord {
  return label === "half" || label === "period" || label === "quarter" ? label : fallback;
}

/** A period's short name, as the Start buttons say it: Q2, H1, P3. */
export function periodShort(word: PeriodWord, period: number): string {
  const letter = word === "half" ? "H" : word === "period" ? "P" : "Q";
  return `${letter}${period}`;
}

/** What a live write is about to do to the game's periods. */
export type PeriodWrite =
  /** The kickoff lineup (startGame and its siblings). */
  | { kind: "kickoff" }
  /** quarter_start for a period. */
  | { kind: "period_start"; period: number }
  /** quarter_end for a period. */
  | { kind: "period_end"; period: number }
  /**
   * A lineup for the next period, at a break: a lineup_set with no
   * time in a period, or netball's period_break_swap (which names the
   * period it's for).
   */
  | { kind: "break_lineup"; period?: number }
  /** A whole-lineup change during a period (a lineup_set with its time). */
  | { kind: "live_lineup"; period: number }
  /** game_finalised. */
  | { kind: "finalise" };

/** The game's periods as its events and games row have them. */
export interface PeriodState {
  status: string | null;
  kickedOff: boolean;
  started: ReadonlySet<number>;
  ended: ReadonlySet<number>;
  finalised: boolean;
}

interface PeriodEvent {
  type: string;
  metadata?: unknown;
}

function periodOf(metadata: unknown): number | null {
  const q = (metadata as { quarter?: unknown } | null)?.quarter;
  return typeof q === "number" && Number.isFinite(q) ? q : null;
}

export function periodStateOf(status: string | null, events: readonly PeriodEvent[]): PeriodState {
  const started = new Set<number>();
  const ended = new Set<number>();
  let kickedOff = false;
  let finalised = false;
  for (const ev of events) {
    if (ev.type === "lineup_set") kickedOff = true;
    else if (ev.type === "game_finalised") finalised = true;
    else if (ev.type === "quarter_start" || ev.type === "quarter_end") {
      const q = periodOf(ev.metadata);
      if (q === null) continue;
      (ev.type === "quarter_start" ? started : ended).add(q);
      if (ev.type === "quarter_start") kickedOff = true;
    }
  }
  return { status, kickedOff, started, ended, finalised };
}

/**
 * The verdict on a write:
 *   - `ok`: write it.
 *   - `duplicate`: it's already done (the other phone ended this period
 *     too); succeed without writing a second one.
 *   - `stale`: this phone is behind the game; refuse with `message`.
 */
export type PeriodVerdict =
  | { kind: "ok" }
  | { kind: "duplicate" }
  | { kind: "stale"; message: string };

const OK: PeriodVerdict = { kind: "ok" };

function latest(set: ReadonlySet<number>): number | null {
  let max: number | null = null;
  set.forEach((n) => {
    if (max === null || n > max) max = n;
  });
  return max;
}

/** The period being played now: started and not yet ended. */
function livePeriod(state: PeriodState): number | null {
  const last = latest(state.started);
  return last !== null && !state.ended.has(last) ? last : null;
}

export function periodWriteVerdict(state: PeriodState, write: PeriodWrite, word: PeriodWord): PeriodVerdict {
  const finished = state.finalised || state.status === "completed";
  if (finished) {
    // Two phones tapping Finish: the second is the same thing, done.
    if (write.kind === "finalise") return { kind: "duplicate" };
    return { kind: "stale", message: "This game is already finished." };
  }
  if (write.kind === "finalise") return OK;

  const startedText = (p: number) => `Another phone already started ${periodShort(word, p)}.`;
  const last = latest(state.started);

  switch (write.kind) {
    case "kickoff": {
      if (last !== null) return { kind: "stale", message: startedText(last) };
      // The events, not the status: a game left in progress with no
      // lineup shows the picker, and its Start must still work.
      if (state.kickedOff) {
        return { kind: "stale", message: "Another phone already set the lineup and started the game." };
      }
      return OK;
    }
    case "period_start": {
      if (last !== null && last >= write.period) return { kind: "stale", message: startedText(last) };
      return OK;
    }
    case "period_end": {
      if (last !== null && last > write.period) return { kind: "stale", message: startedText(last) };
      if (state.ended.has(write.period)) return { kind: "duplicate" };
      return OK;
    }
    case "break_lineup": {
      // Netball names the period its break lineup is for.
      if (write.period !== undefined && last !== null && last >= write.period) {
        return { kind: "stale", message: startedText(last) };
      }
      // Anyone else's comes between periods: while one is being played,
      // the other phone has already started it.
      const live = livePeriod(state);
      if (live !== null) return { kind: "stale", message: startedText(live) };
      return OK;
    }
    case "live_lineup": {
      if (last !== null && last > write.period) return { kind: "stale", message: startedText(last) };
      if (state.ended.has(write.period)) {
        return { kind: "stale", message: `Another phone already ended ${periodShort(word, write.period)}.` };
      }
      return OK;
    }
  }
}

/**
 * The write a whole-lineup event is: with a time in a period, a change
 * during it; without one, the lineup for the next period.
 */
export function lineupWrite(at: { quarter?: unknown } | null | undefined): PeriodWrite {
  const q = periodOf(at);
  return q === null ? { kind: "break_lineup" } : { kind: "live_lineup", period: q };
}
