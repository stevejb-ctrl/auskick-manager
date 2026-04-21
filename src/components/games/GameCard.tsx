import Link from "next/link";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import type { Game } from "@/lib/types";

interface GameCardProps {
  teamId: string;
  game: Game;
  availableCount: number;
  totalActive: number;
}

export function GameCard({ teamId, game, availableCount, totalActive }: GameCardProps) {
  const isLive = game.status === "in_progress";
  const isDone = game.status === "completed";

  return (
    <Link
      href={`/teams/${teamId}/games/${game.id}`}
      className="block rounded-lg border border-hairline bg-surface p-4 shadow-card transition-colors duration-fast ease-out-quart hover:border-brand-300 hover:bg-brand-50/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {game.round_number != null && (
              <span className="text-[11px] font-semibold uppercase tracking-micro text-brand-600">
                Round {game.round_number}
              </span>
            )}
            <span className="text-xs text-ink-mute">
              <FormattedDateTime iso={game.scheduled_at} mode="short" />
            </span>
            {isLive && (
              <span className="inline-flex items-center gap-1 rounded-full bg-ok/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-micro text-ok">
                <span className="h-1.5 w-1.5 rounded-full bg-ok animate-pulse" />
                Live
              </span>
            )}
            {isDone && (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-alt px-2 py-0.5 text-[10px] font-semibold uppercase tracking-micro text-ink-mute">
                ✓ Done
              </span>
            )}
          </div>
          <h3 className="mt-1 truncate text-base font-semibold text-ink">
            vs {game.opponent}
          </h3>
          {game.location && (
            <p className="mt-0.5 truncate text-sm text-ink-dim">{game.location}</p>
          )}
        </div>
        {/* Only show availability count for upcoming/active games */}
        {!isDone && (
          <div className="shrink-0 text-right">
            <span className="text-lg font-bold tabular-nums text-brand-600">
              {availableCount}
            </span>
            <span className="text-sm text-ink-mute"> / {totalActive}</span>
            <p className="text-xs text-ink-mute">available</p>
          </div>
        )}
      </div>
    </Link>
  );
}
