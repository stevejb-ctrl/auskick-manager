"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import { FeedbackHeaderButton } from "@/components/feedback/FeedbackHeaderButton";
import type { Game } from "@/lib/types";

interface LiveTopBarProps {
  /** Where the Exit link takes the user. */
  exitHref: string;
  /** Game row — drives the round/date/venue strip in the centre. */
  game: Game;
  /**
   * True once the game is underway (past pre-game). Flips the centre
   * strip from round/date/venue — dead weight during play — to
   * "vs {opponent}", which is what a mid-game glance actually wants.
   * UX review #13, Steve 2026-07-08. Omit/false keeps the pre-game
   * round/date strip (lineup picker, upcoming-game surfaces).
   */
  isLive?: boolean;
  /**
   * Walkthrough trigger. Opens the in-place WalkthroughModal when
   * provided. When absent, the "?" affordance is NOT rendered —
   * Steve 2026-05-25 reported a critical trap in the iOS Capacitor
   * shell: the previous Link-to-/help fallback navigated out of
   * /live into the marketing-styled /help page, which has no way
   * back to the game (no Capacitor-aware "back to app" link, no
   * browser chrome in the WebView). Surfaces that legitimately
   * need a help affordance must wire `onHelp` to a modal handler
   * rather than relying on the Link fallback.
   */
  onHelp?: () => void;
}

/**
 * The in-game top chrome that replaces the (app) layout header on
 * /live routes. Sticky-top, full-width, edge-to-edge with a backdrop
 * blur so scrolling content disappears cleanly behind it. Steve
 * 2026-05-13: extracted so the AFL pre-kickoff LineupPicker surface
 * gets the same bar as live play, Q-break, FT review, and the
 * finalised summary screen.
 *
 * Negative inset-x compensates for the parent layout's `px-4` so the
 * bar runs edge-to-edge regardless of which page is hosting it.
 */
export function LiveTopBar({ exitHref, game, isLive = false, onHelp }: LiveTopBarProps) {
  // Steve 2026-05-14: switched Exit from `<Link>` to an imperative
  // button + router.push because `<Link>` was silently no-op-ing on
  // some device/cache combos (Steve saw it in production: tap
  // registered visually but no navigation occurred). The button form
  // is more defensive — the onClick fires immediately, useTransition
  // shows pending state if the destination is slow, and there's no
  // anchor for the PWA service worker or a stray parent handler to
  // suppress.
  //
  // Tap targets sit at iOS-min 44pt — the previous text-only Exit +
  // 24pt "?" pill were both well below that. Also dropped the "✕"
  // glyph from Exit per usability feedback (it read as "discard /
  // close" mid-game).
  const router = useRouter();
  const [exiting, startExitTransition] = useTransition();
  const handleExit = () => {
    startExitTransition(() => {
      router.push(exitHref);
    });
  };
  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-hairline bg-surface/85 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-surface/70">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-2 sm:px-3">
        <button
          type="button"
          onClick={handleExit}
          disabled={exiting}
          aria-label="Exit live game"
          className="inline-flex min-h-[44px] items-center rounded-md px-3 font-mono text-xs font-bold uppercase tracking-micro text-ink-mute transition-colors hover:bg-ink/5 hover:text-ink-dim active:bg-ink/10 disabled:opacity-60"
        >
          {exiting ? "Exiting…" : "Exit"}
        </button>
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-center gap-x-2 text-xs text-ink-mute">
          {isLive ? (
            <span className="truncate text-sm font-semibold text-ink-dim">
              vs {game.opponent}
            </span>
          ) : (
            <>
              {game.round_number != null && (
                <span className="font-mono font-bold uppercase tracking-micro text-ink-dim">
                  R{game.round_number}
                </span>
              )}
              <span className="truncate">
                <FormattedDateTime iso={game.scheduled_at} mode="long" />
              </span>
              {game.location && (
                <span className="truncate">· {game.location}</span>
              )}
            </>
          )}
        </div>
        {/* Right-edge utility cluster: feedback + walkthrough "?".
            Wrapped in a zero-gap sub-flex so the two 44pt tap boxes
            sit flush; the visible 28pt pills inside read as a tight
            two-icon group instead of two stand-alone affordances
            (Steve 2026-05-25 — feedback was too far from "?").
            -mr-1 nudges the cluster slightly closer to the
            edge for the same compactness reason.
            The "?" only renders when a real in-place walkthrough
            handler is provided — the previous Link-to-/help fallback
            was a critical trap inside the iOS Capacitor shell
            (marketing-styled /help has no way back into the game).
            Surfaces that legitimately need help on the right must
            wire onHelp to a modal; never a Link. */}
        <div className="-mr-1 flex items-center">
          <FeedbackHeaderButton />

          {/* The visible "?" pill is 28pt, but the surrounding button
              keeps the iOS-min 44pt tap target via `h-11 w-11`. Steve
              2026-05-15: previously the whole 44pt area got the
              `rounded-full border` chrome, which read as oversized
              against the small text + Exit label. iOS-native pattern
              is a small visible glyph centered in a generous tap area
              — `group` here just keeps the hover/active state on the
              inner pill rather than the whole outer surface. */}
          {onHelp && (
            <button
              type="button"
              onClick={onHelp}
              className="group inline-flex h-11 w-11 shrink-0 items-center justify-center"
              aria-label="Open walkthrough"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-hairline font-mono text-xs font-bold text-ink-mute transition-colors duration-fast ease-out-quart group-hover:border-ink-dim group-hover:text-ink-dim group-active:bg-ink/5">
                ?
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
