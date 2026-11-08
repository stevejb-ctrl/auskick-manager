"use client";

// ─── KidBar ──────────────────────────────────────────────────
// Tap a kid and the bar becomes theirs (live v3, Steve 8 Nov 2026): the
// score dock grown into everything you do to one kid, in the bar's place,
// so nothing covers the field.
//
//   #3 Mia · CHB                                    ×
//   ▬▬▬ Centre · 14′ this game · 62% of game
//   Tap another kid to swap with Mia.
//   ② Mia → Zara  BCK  [Edited ↺]           [Make swap 2]   (in a pair)
//   [+ GOAL] [+ BEHIND] [INJURED] [MORE]
//
// Tap another kid to swap them (at once, with Undo); tap Mia again, ×,
// or Escape to put her down. Injured goes straight to who comes on;
// More is the player sheet (switch, lend, hold, season time).
//
// Sport-agnostic: the sport passes the words and the buttons. The swap
// line keeps the dock's test id (dock-swap-hint).

import { useEffect, type ReactNode } from "react";

export interface KidBarPair {
  /** The pair's number (index + 1). */
  n: number;
  /** "Mia → Zara". */
  text: string;
  /** Where ("BCK"). */
  where?: string;
  /** Due now: hi-vis. */
  hot: boolean;
  edited?: boolean;
  onRevert?: () => void;
  onMake: () => void;
  disabled?: boolean;
}

export interface KidBarProps {
  /** The kid's name: the group's accessible name. */
  name: string;
  /** "#3 Mia · CHB". */
  heading: string;
  /** The line under it: where, minutes, % of game. */
  line?: ReactNode;
  /** A small split of their time by line, before `line`. */
  split?: ReactNode;
  /** What tapping another kid does. */
  hint?: ReactNode;
  /** Their pair in the planned sub. */
  pair?: KidBarPair | null;
  /** The buttons: score, Injured, More (BAR buttons, size sm). */
  actions: ReactNode;
  /** How many buttons, for the row's columns. */
  columns: number;
  onClose: () => void;
}

export function KidBar({ name, heading, line, split, hint, pair, actions, columns, onClose }: KidBarProps) {
  // Escape puts the kid down (when no sheet is open over the bar: a
  // sheet's own Escape closes it first and stops there).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="group"
      aria-label={name}
      data-testid="kid-bar"
      data-score-dock=""
      className="flex flex-col gap-[7px] border-t border-hairline px-[2px] pt-[8px]"
    >
      <div className="flex items-start gap-[8px] pl-[3px]">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display stretch-75 text-[1.1875rem] font-extrabold leading-[1.05] text-ink">{heading}</p>
          {(line || split) && (
            <p className="mt-[2px] flex min-w-0 items-center gap-[6px] text-[0.75rem] text-ink-mute">
              {split}
              <span className="min-w-0 truncate">{line}</span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Put ${name} down`}
          className="flex h-[44px] min-w-[44px] flex-none items-center justify-center rounded-[12px] text-[1.25rem] font-bold leading-none text-ink shadow-[inset_0_0_0_1.5px_rgb(var(--l-hairline))] hover:bg-surface-alt"
        >
          ×
        </button>
      </div>
      {pair && (
        <div
          className={`flex items-center gap-[8px] rounded-[14px] py-[6px] pl-[8px] pr-[6px] ${
            pair.hot ? "shadow-[inset_0_0_0_1.5px_rgb(var(--c-hivis))]" : "shadow-[inset_0_0_0_1.5px_rgb(var(--l-hairline))]"
          }`}
        >
          <span
            aria-hidden
            className={`grid h-[26px] w-[26px] flex-none place-items-center rounded-[8px] font-display text-[0.9375rem] font-black ${
              pair.hot ? "bg-hivis text-hivis-ink" : "bg-primary text-on-primary"
            }`}
          >
            {pair.n}
          </span>
          <span className="min-w-0 flex-1 font-display stretch-80 text-base font-extrabold leading-[1.1] text-ink">
            {pair.text}
            {pair.where && <i className="ml-[4px] not-italic text-[0.6875rem] tracking-[0.08em] text-ink-mute">{pair.where}</i>}
            {pair.edited && pair.onRevert && (
              <button
                type="button"
                onClick={pair.onRevert}
                aria-label="Edited. Revert to Siren's pick"
                className="ml-[4px] inline-flex min-h-[24px] items-center rounded-[7px] bg-primary px-[7px] align-[1px] font-display text-[0.6875rem] font-extrabold tracking-[0.04em] text-on-primary"
              >
                Edited ↺
              </button>
            )}
          </span>
          <button
            type="button"
            onClick={pair.onMake}
            disabled={pair.disabled}
            className={`min-h-[44px] flex-none rounded-[11px] px-[12px] font-display text-[0.875rem] font-black disabled:opacity-60 ${
              pair.hot ? "bg-hivis text-hivis-ink" : "bg-primary text-on-primary"
            }`}
          >
            Make swap {pair.n}
          </button>
        </div>
      )}
      {hint && (
        <p data-testid="dock-swap-hint" className="pl-[3px] text-[0.78125rem] text-ink-dim">
          {hint}
        </p>
      )}
      <div
        className="grid gap-[8px] bigtext:!grid-cols-2"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, columns)}, minmax(0, 1fr))` }}
      >
        {actions}
      </div>
    </div>
  );
}

/** A little stacked bar of a kid's time in each line (the kid bar's header). */
export function TimeSplit({ parts }: { parts: { ms: number; className: string }[] }) {
  const total = parts.reduce((t, p) => t + p.ms, 0);
  return (
    <span aria-hidden data-testid="time-split" className="flex h-[6px] w-[46px] flex-none overflow-hidden rounded-full bg-bar-track">
      {total > 0 &&
        parts
          .filter((p) => p.ms > 0)
          .map((p, i) => <span key={i} className={`h-full ${p.className}`} style={{ width: `${(p.ms / total) * 100}%` }} />)}
    </span>
  );
}
