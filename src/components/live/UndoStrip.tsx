"use client";

import { useEffect } from "react";
import { announce } from "@/lib/a11y/announce";

interface UndoStripProps {
  /** Just scored: the strip flashes dark with what was recorded. */
  flashing: boolean;
  /**
   * What Undo takes back ("Roos goal — Mia", "foul on Sam", "Ava on for
   * Leo"), shown as "Undo: …": bold while flashing, then quiet. Always
   * named, so it's clear what Undo takes back after a swap or a foul, or
   * when two phones are scoring (lib/live/lastUndoable, useOneUndo).
   */
  message: string;
  onUndo: () => void;
  disabled?: boolean;
  /**
   * Live v3 (AFL's shell): a plain line on the chalk, the Undo an
   * underlined word, tinted for a moment after a score (the filled Undo
   * then). Omitted: the grey strip in every other sport's score bar.
   */
  plain?: boolean;
}

/**
 * The undo strip above the sticky score bar (UX plan Phase 6: one
 * undo toast for every sport). Flashes for a few seconds after a score
 * with what was recorded, then settles quietly, still naming it.
 */
export function UndoStrip({ flashing, message, onUndo, disabled = false, plain = false }: UndoStripProps) {
  // Said into the page's one live region as it flashes (UX round 3, e4:
  // a status mounted already holding its text is often skipped). Ahead
  // of the new score, which the scorebug says.
  useEffect(() => {
    if (flashing && message) announce(message, { priority: 1 });
  }, [flashing, message]);
  if (plain) {
    return (
      <div
        className={`mx-[12px] flex min-h-[36px] items-center gap-[8px] rounded-[12px] pl-[4px] transition-colors duration-300 ${
          flashing ? "bg-surface-alt text-ink-dim" : "bg-transparent text-ink-mute"
        }`}
        data-testid="undo-strip"
      >
        <span className={`min-w-0 flex-1 truncate text-[0.8125rem] ${flashing ? "font-bold text-ink" : ""}`}>
          {message ? `Undo: ${message}` : "Undo"}
        </span>
        <button
          type="button"
          onClick={onUndo}
          disabled={disabled}
          className={`inline-flex min-h-[36px] flex-shrink-0 items-center rounded-[9px] px-[10px] font-display text-[0.84375rem] font-extrabold transition-colors disabled:opacity-60 motion-safe:active:scale-[0.97] ${
            flashing ? "bg-ink text-mark" : "text-ink underline decoration-hairline underline-offset-[3px]"
          }`}
        >
          Undo
        </button>
      </div>
    );
  }
  return (
    <div
      className={`mx-4 mb-1 flex items-center justify-between rounded-sm px-3 py-1.5 transition-colors ${
        flashing ? "bg-ink text-warm" : "bg-surface-alt"
      }`}
      data-testid="undo-strip"
    >
      <span className={`text-xs ${flashing ? "text-warm/80" : "text-ink-dim"}`}>
        {/* Says what Undo takes back: a parent who'd just made a swap
            pressed Undo for it (Stagehand round 8, #13). */}
        {message ? `Undo: ${message}` : "Undo"}
      </span>
      <button
        type="button"
        onClick={onUndo}
        disabled={disabled}
        className={`-my-3 px-2 py-3 font-mono text-xs font-bold uppercase tracking-micro transition-colors disabled:opacity-60 motion-safe:active:scale-[0.97] ${
          flashing ? "text-due-dark hover:text-due-dark/80" : "text-brand-700 hover:text-brand-600"
        }`}
      >
        Undo
      </button>
    </div>
  );
}
