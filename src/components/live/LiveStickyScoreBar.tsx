"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// ─── LiveStickyScoreBar ──────────────────────────────────────
// Shared sticky-bottom wrapper that hosts the in-play scorebug +
// optional undo strip on both AFL `LiveGame.tsx` and netball
// `NetballLiveGame.tsx`. Mounted once when live play starts and
// stays for the rest of the game (until Q-break, FT, or
// finalised).
//
// Chrome owned by the shell:
//   - Full-width fixed-bottom div, z-30 (sits below modals z-50 +
//     SlotFillSheet z-[60], above page content).
//   - Top border-hairline + upward shadow so scrolling content
//     disappears cleanly behind the bar.
//   - `motion-safe:animate-slide-in-bottom-fast` — 180ms slide-up
//     on mount (P1-14). CSS animations don't block input so the
//     scorebug's +G chips respond from frame 1 even mid-slide.
//   - Safe-area-aware bottom padding so the bar clears the iPhone
//     home indicator.
//   - `mx-auto max-w-4xl` inner constraint matches the rest of
//     the in-game layout.
//
// Caller passes:
//   - `scorebug` — the sport-specific scorebug node (AFL
//     `gameHeader` rendered with `flat=true`; netball
//     `liveScoreBug`).
//   - `undoStrip` — optional. The undo affordance lives below the
//     scorebug INSIDE this same bar (Steve 2026-05-13: "should
//     also be at the bottom of it, there should be just enough
//     room"). Each sport renders its own undo strip with the
//     correct gates (AFL: `lastScore && !isPreGame && !isFinished`;
//     netball: `trackScoring && lastScore`) — those gates can't be
//     unified without leaking sport-specific signals.
//
// Steve 2026-05-15: Phase 5d of the LiveGameShell extraction.

import type { ReactNode } from "react";

interface LiveStickyScoreBarProps {
  scorebug: ReactNode;
  /** Optional content rendered below the scorebug (typically the undo strip). */
  undoStrip?: ReactNode;
  /**
   * Scoring is off for this team: say so above the scorebug, so a
   * score sitting at 0 or "—" isn't a puzzle. `settingsHref` links a
   * coach to turn it on; null for runners, who can't.
   */
  scoringOff?: { settingsHref: string | null };
}

export function LiveStickyScoreBar({
  scorebug,
  undoStrip,
  scoringOff,
}: LiveStickyScoreBarProps) {
  // On phones the bar is fixed over the page, so an in-flow spacer of
  // the bar's own height lets the page's last row scroll clear of it.
  // Without it "+ Add late arrival" (and Restart) sat under the bar and
  // the page wouldn't scroll further (round 5). From md the bar is
  // sticky — already in flow — so the spacer hides.
  const barRef = useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = useState(0);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    setBarHeight(el.offsetHeight);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setBarHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Floating chips above the bar (the long-press hint) read its height,
  // so they never sit on the score chips (Steve 2026-10-22: basketball's
  // taller bar had the hint over +1 / +2, and taps hit the hint).
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--live-score-bar-h", `${barHeight}px`);
    return () => {
      root.style.removeProperty("--live-score-bar-h");
    };
  }, [barHeight]);
  return (
    <>
      <div aria-hidden className="md:hidden" style={{ height: barHeight }} />
      <div ref={barRef} className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(26,30,26,0.05)] motion-safe:animate-slide-in-bottom-fast md:sticky md:inset-x-auto">
        <div className="mx-auto max-w-4xl">
          {scoringOff && (
            <p className="px-4 pb-0.5 text-center text-[11px] text-ink-mute">
              Scoring is off
              {scoringOff.settingsHref && (
                <>
                  {" · "}
                  <Link href={scoringOff.settingsHref} className="font-semibold text-brand-700 underline-offset-2 hover:underline">
                    Turn it on
                  </Link>
                </>
              )}
            </p>
          )}
          {scorebug}
          {undoStrip}
        </div>
      </div>
    </>
  );
}
