"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import type { Game } from "@/lib/types";

interface LiveTopBarProps {
  /** Where the Exit link takes the user. */
  exitHref: string;
  /** Game row — drives the round/date/venue strip in the centre. */
  game: Game;
  /**
   * Optional walkthrough trigger. When provided, the right-hand "?"
   * affordance is a button that calls this (used inside LiveGame /
   * NetballLiveGame where the WalkthroughModal lives). When absent
   * (server-rendered surfaces like the AFL pre-kickoff page), the
   * "?" is a Link to the static /help page instead, so the affordance
   * is consistent across every /live state.
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
export function LiveTopBar({ exitHref, game, onHelp }: LiveTopBarProps) {
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
        </div>
        {onHelp ? (
          <button
            type="button"
            onClick={onHelp}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-hairline font-mono text-sm font-bold text-ink-mute transition-colors duration-fast ease-out-quart hover:border-ink-dim hover:text-ink-dim active:bg-ink/5"
            aria-label="Open walkthrough"
          >
            ?
          </button>
        ) : (
          <Link
            href="/help"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-hairline font-mono text-sm font-bold text-ink-mute transition-colors duration-fast ease-out-quart hover:border-ink-dim hover:text-ink-dim active:bg-ink/5"
            aria-label="Open help"
          >
            ?
          </Link>
        )}
      </div>
    </div>
  );
}
