"use client";

import Link from "next/link";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import type { Game } from "@/lib/types";

interface LiveTopBarProps {
  /** Where ✕ Exit takes the user. */
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
  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-hairline bg-surface/85 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-surface/70">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-2 sm:py-3">
        <Link
          href={exitHref}
          className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute transition-colors hover:text-ink-dim"
        >
          ✕ Exit
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
            className="flex h-6 w-6 items-center justify-center rounded-full border border-hairline font-mono text-[11px] font-bold text-ink-mute transition-colors duration-fast ease-out-quart hover:border-ink-dim hover:text-ink-dim"
            aria-label="Open walkthrough"
          >
            ?
          </button>
        ) : (
          <Link
            href="/help"
            className="flex h-6 w-6 items-center justify-center rounded-full border border-hairline font-mono text-[11px] font-bold text-ink-mute transition-colors duration-fast ease-out-quart hover:border-ink-dim hover:text-ink-dim"
            aria-label="Open help"
          >
            ?
          </Link>
        )}
      </div>
    </div>
  );
}
