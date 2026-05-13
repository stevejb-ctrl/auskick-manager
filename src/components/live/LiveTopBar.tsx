"use client";

import Link from "next/link";
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
  // Tap targets sit at iOS-min 44pt — Steve 2026-05-13 the previous
  // text-only Exit + 24pt "?" pill were both well below that, and
  // Exit's `✕` glyph read as "discard / close" mid-game (terrifying
  // when the GM is mid-flow). Switched to a plain "Exit" word with a
  // proper hit area, and bumped the help affordance to 44×44.
  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-hairline bg-surface/85 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-surface/70">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-2 sm:px-3">
        <Link
          href={exitHref}
          className="inline-flex min-h-[44px] items-center rounded-md px-3 font-mono text-xs font-bold uppercase tracking-micro text-ink-mute transition-colors hover:bg-ink/5 hover:text-ink-dim active:bg-ink/10"
        >
          Exit
        </Link>
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
