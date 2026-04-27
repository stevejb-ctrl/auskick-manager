import Link from "next/link";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import { SFCard, SFIcon, StatusPill } from "@/components/sf";
import type { Game } from "@/lib/types";

interface GameRowProps {
  teamId: string;
  game: Game;
  availableCount: number;
  totalActive: number;
}

/**
 * Row in the Games list. SF-design treatment:
 *
 *   [Round 07]  vs Opponent                        [Status Pill]  ›
 *   (italic     date · location                    (or count for
 *    serif)                                         upcoming/live)
 *
 * Round numeral is colour-coded:
 *   - alarm   for in-progress
 *   - ink     for upcoming
 *   - ink-mute for completed (less visual weight on past results)
 *
 * Result chips (W/L/D) for completed games are intentionally absent
 * for now — the Game model doesn't carry a result/score field; that
 * would need to be derived from game_events, which is out of scope
 * for the design refresh. Add later as a separate feature.
 */
export function GameRow({ teamId, game, availableCount, totalActive }: GameRowProps) {
  const isLive = game.status === "in_progress";
  const isDone = game.status === "completed";

  const numeralColor = isLive
    ? "text-alarm"
    : isDone
    ? "text-ink-mute"
    : "text-ink";

  return (
    <Link href={`/teams/${teamId}/games/${game.id}`} className="block">
      <SFCard
        pad={0}
        interactive
        className="grid grid-cols-[44px_1fr_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[60px_1fr_auto_auto] sm:gap-5 sm:px-5 sm:py-4"
      >
        {game.round_number != null ? (
          <span
            className={`font-serif italic leading-none ${numeralColor}`}
            style={{ fontSize: 34, letterSpacing: "-0.02em" }}
          >
            {String(game.round_number).padStart(2, "0")}
          </span>
        ) : (
          <span aria-hidden="true" />
        )}

        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-base font-bold text-ink sm:text-[17px]">
            <span className="font-medium text-ink-mute">vs</span>
            <span className="truncate">{game.opponent}</span>
          </div>
          <div className="mt-1 truncate text-xs text-ink-dim">
            <FormattedDateTime iso={game.scheduled_at} mode="short" />
            {game.location && ` · ${game.location}`}
          </div>
        </div>

        {/* Desktop: separate status + count column */}
        <div className="hidden sm:block">
          {isLive ? (
            <StatusPill status="live" />
          ) : isDone ? (
            <StatusPill status="final" />
          ) : (
            <StatusPill status="upcoming" />
          )}
        </div>

        {!isDone && (
          <div className="hidden text-right sm:block">
            <div className="font-mono text-sm font-bold tabular-nums text-ink">
              {availableCount}
              <span className="text-ink-mute">/{totalActive}</span>
            </div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-micro text-ink-mute">
              avail
            </div>
          </div>
        )}

        {/* Phone: collapse status into the chevron column */}
        <div className="flex items-center gap-2 sm:hidden">
          {isLive ? (
            <StatusPill status="live" />
          ) : isDone ? null : (
            !isDone && (
              <span className="font-mono text-xs font-bold tabular-nums text-ink">
                {availableCount}
                <span className="text-ink-mute">/{totalActive}</span>
              </span>
            )
          )}
          <span className="text-ink-mute">
            <SFIcon.chevronRight />
          </span>
        </div>

        <span className="hidden text-ink-mute sm:inline">
          <SFIcon.chevronRight />
        </span>
      </SFCard>
    </Link>
  );
}
