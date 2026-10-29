"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { setTrackScoring } from "@/app/(app)/teams/[teamId]/games/actions";
import { useStickyInset } from "@/components/ui/useStickyInset";

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
   * score sitting at 0 or "—" isn't a puzzle. `teamId` lets a coach
   * turn it on right here; null for runners, who can't.
   */
  scoringOff?: { teamId: string | null };
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
  // Focus scrolls clear of the bar (the page's scroll padding).
  useStickyInset(barRef, "bottom");
  // Never more than 45% of the screen: past that (large text) the bar
  // scrolls inside itself and the field keeps the rest (UX round 3, e4:
  // at 200% text it was 525 of 844 px and no kid showed). Only then,
  // since a scrolling bar would clip the "+6" ghost over the chips.
  const contentRef = useRef<HTMLDivElement>(null);
  const [capped, setCapped] = useState(false);
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const check = () => setCapped(el.offsetHeight > window.innerHeight * 0.45);
    check();
    window.addEventListener("resize", check);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    ro?.observe(el);
    return () => {
      window.removeEventListener("resize", check);
      ro?.disconnect();
    };
  }, []);
  return (
    <>
      {/* `desk`, not `md`: the bar is sticky only inside the desktop
          phone frame (DeviceFrame); a phone held sideways pins it. */}
      <div aria-hidden className="desk:hidden" style={{ height: `calc(${barHeight}px + var(--live-hint-h, 0px))` }} />
      {/* On a desktop the bar is in flow, but the tap hint still floats
          above it: room for the hint, so it never sits on the page's last
          row (round 9: over Game settings, Fix scores and Restart). */}
      <div aria-hidden className="hidden desk:block" style={{ height: "var(--live-hint-h, 0px)" }} />
      <div
        ref={barRef}
        id="live-scores"
        tabIndex={-1}
        aria-label="Scores"
        role="region"
        className={`fixed inset-x-0 bottom-0 z-30 outline-none border-t border-hairline bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(26,30,26,0.05)] motion-safe:animate-slide-in-bottom-fast desk:sticky desk:inset-x-auto ${
          capped ? "max-h-[45dvh] overflow-y-auto overscroll-contain" : ""
        }`}
      >
        <div ref={contentRef} className="mx-auto max-w-4xl">
          {scoringOff && (
            <p className="px-4 pb-0.5 text-center text-[11px] text-ink-mute">
              Scoring is off
              {scoringOff.teamId && (
                <>
                  {" · "}
                  <TurnScoringOn teamId={scoringOff.teamId} />
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

// "Turn it on" switches scoring on in place. It was a link to team
// settings, which took the coach out of the game with no way back
// (usability pass, 26 Oct 2026). setTrackScoring also marks the game on
// now as keeping score; the refresh brings the scoring buttons in.
function TurnScoringOn({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await setTrackScoring(teamId, true).catch(() => ({ success: false as const, error: "Couldn't turn it on — try again." }));
            if (!result.success) setError(result.error || "Couldn't turn it on — try again.");
            else router.refresh();
          });
        }}
        className="inline-flex min-h-[24px] items-center font-semibold text-brand-700 underline-offset-2 hover:underline disabled:opacity-60"
      >
        {isPending ? "Turning it on…" : "Turn it on"}
      </button>
      {error && <span role="alert" className="block text-danger">{error}</span>}
    </>
  );
}
