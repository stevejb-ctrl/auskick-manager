"use client";

// ─── useOneUndo ──────────────────────────────────────────────
// The live screen's one Undo, every sport (lib/live/lastUndoable): it
// keeps what this phone did (scores, fouls, swaps), picks what Undo
// takes back, and renders the undo strip naming it ("Undo: Ava on for
// Leo"). The shared chrome (useLiveChrome) is built on it; AFL's and
// netball's screens, with their own stores, use it directly.
//
// The swap toast no longer carries an Undo of its own: two Undos on
// screen at once named different things (Stagehand round 9).

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { UndoStrip } from "@/components/live/UndoStrip";
import { lastUndoable, undoableLabel, type OwnAction, type Undoable, type UndoEvent } from "@/lib/live/lastUndoable";

/** How long the strip flashes what was just recorded (AFL's 8 s). */
const FLASH_MS = 8000;
/** Enough to undo a run of mistakes; older ones can't be taken back by tap anyway. */
const KEEP = 40;

export interface OneUndo {
  /** A score this phone recorded (its write's key) and what the strip says. */
  scored(key: string | null | undefined, text: string): void;
  /** A foul this phone recorded (basketball). */
  fouled(key: string | null | undefined): void;
  /** A change the screen can put back (a swap): `run` puts it back. */
  changed(change: { label: string; run: () => void }): void;
  /** Something else that moves kids (an injury, a fill): a change before it can't be put back. */
  other(): void;
  /** What Undo takes back now. */
  pick: Undoable | null;
  /** …in words, after "Undo: ". */
  label: string | null;
  /** The strip stops flashing (an undo was written some other way). */
  quiet(): void;
  /**
   * The strip (null when there's nothing to take back or `show` is
   * false). Undo puts a change back itself; a score or a foul goes to
   * the screen's own write.
   */
  strip(opts: {
    show: boolean;
    disabled?: boolean;
    plain?: boolean;
    onScore: (event: UndoEvent) => void;
    onFoul?: (event: UndoEvent) => void;
  }): ReactNode;
}

export function useOneUndo(opts: {
  /** The game's events (the server's and this phone's writes not back yet). */
  events: readonly UndoEvent[];
  scoreTypes: ReadonlySet<string>;
  /** The period in play (null at a break or before the start). */
  period: number | null;
  teamName: string;
  opponentName: string;
  firstName: (playerId: string) => string;
}): OneUndo {
  const { events, scoreTypes, period, teamName, opponentName, firstName } = opts;
  const [own, setOwn] = useState<OwnAction[]>([]);
  const seqRef = useRef(0);
  const runs = useRef(new Map<number, () => void>());
  const [flashSeq, setFlashSeq] = useState<number | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    },
    [],
  );

  const quiet = useCallback(() => {
    if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    flashTimer.current = null;
    setFlashSeq(null);
  }, []);

  const push = useCallback((make: (seq: number) => OwnAction, flash: boolean) => {
    const seq = ++seqRef.current;
    setOwn((prev) => {
      const next = [...prev, make(seq)];
      const dropped = next.length > KEEP ? next.slice(0, next.length - KEEP) : [];
      for (const a of dropped) runs.current.delete(a.seq);
      return next.slice(-KEEP);
    });
    if (flash) {
      if (flashTimer.current !== null) clearTimeout(flashTimer.current);
      setFlashSeq(seq);
      flashTimer.current = setTimeout(() => setFlashSeq(null), FLASH_MS);
    }
    return seq;
  }, []);

  const scored = useCallback<OneUndo["scored"]>(
    (key, text) => {
      if (key) push((seq) => ({ kind: "score", seq, key, text }), true);
    },
    [push],
  );
  const fouled = useCallback<OneUndo["fouled"]>(
    (key) => {
      if (key) push((seq) => ({ kind: "foul", seq, key }), true);
    },
    [push],
  );
  const changed = useCallback<OneUndo["changed"]>(
    ({ label, run }) => {
      const seq = push((s) => ({ kind: "change", seq: s, period, label }), true);
      runs.current.set(seq, run);
    },
    [push, period],
  );
  const other = useCallback(() => {
    push((seq) => ({ kind: "other", seq }), false);
  }, [push]);

  const pick = useMemo(() => lastUndoable({ events, scoreTypes, own, period }), [events, scoreTypes, own, period]);
  const label = pick ? undoableLabel(pick, { teamName, opponentName, firstName }) : null;
  // The strip flashes while what it names is what was just recorded.
  const pickSeq =
    pick?.kind === "change"
      ? pick.action.seq
      : pick?.mine
        ? own.find((a) => (a.kind === "score" || a.kind === "foul") && a.key === pick.event.idempotency_key)?.seq ?? null
        : null;
  const flashing = flashSeq !== null && pickSeq === flashSeq;

  return {
    scored,
    fouled,
    changed,
    other,
    pick,
    label,
    quiet,
    strip: ({ show, disabled, plain, onScore, onFoul }) => {
      if (!show || !pick || !label) return null;
      const onUndo = () => {
        quiet();
        if (pick.kind === "change") {
          const seq = pick.action.seq;
          setOwn((prev) => prev.map((a) => (a.kind === "change" && a.seq === seq ? { ...a, undone: true } : a)));
          const run = runs.current.get(seq);
          runs.current.delete(seq);
          run?.();
        } else if (pick.kind === "foul") onFoul?.(pick.event);
        else onScore(pick.event);
      };
      return (
        <UndoStrip
          flashing={flashing}
          message={label}
          onUndo={onUndo}
          disabled={disabled || (pick.kind === "foul" && !onFoul)}
          plain={plain}
        />
      );
    },
  };
}
