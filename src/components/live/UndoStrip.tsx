"use client";

import { useEffect } from "react";
import { announce } from "@/lib/a11y/announce";

interface UndoStripProps {
  /** Just scored: the strip flashes dark with what was recorded. */
  flashing: boolean;
  /**
   * What was recorded ("Roos goal — Mia"): bold while flashing, then
   * quiet. It stays named, so it's clear which score Undo takes back
   * when two phones are scoring (UX round 2). Empty: "Undo last score".
   */
  message: string;
  onUndo: () => void;
  disabled?: boolean;
}

/**
 * The undo strip above the sticky score bar (UX plan Phase 6: one
 * undo toast for every sport). Flashes for a few seconds after a score
 * with what was recorded, then settles quietly, still naming it.
 */
export function UndoStrip({ flashing, message, onUndo, disabled = false }: UndoStripProps) {
  // Said into the page's one live region as it flashes (UX round 3, e4:
  // a status mounted already holding its text is often skipped). Ahead
  // of the new score, which the scorebug says.
  useEffect(() => {
    if (flashing && message) announce(message, { priority: 1 });
  }, [flashing, message]);
  return (
    <div
      className={`mx-4 mb-1 flex items-center justify-between rounded-sm px-3 py-1.5 transition-colors ${
        flashing ? "bg-ink text-warm" : "bg-surface-alt"
      }`}
      data-testid="undo-strip"
    >
      <span className={`text-xs ${flashing ? "text-warm/80" : "text-ink-dim"}`}>
        {message || "Undo last score"}
      </span>
      <button
        type="button"
        onClick={onUndo}
        disabled={disabled}
        className={`-my-3 px-2 py-3 font-mono text-xs font-bold uppercase tracking-micro transition-colors disabled:opacity-60 motion-safe:active:scale-[0.97] ${
          flashing ? "text-warn hover:text-warn/80" : "text-brand-700 hover:text-brand-600"
        }`}
      >
        Undo
      </button>
    </div>
  );
}
