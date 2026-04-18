import Link from "next/link";
import type { Game } from "@/lib/types";

interface GameCardProps {
  teamId: string;
  game: Game;
  availableCount: number;
  totalActive: number;
}

export function GameCard({ teamId, game, availableCount, totalActive }: GameCardProps) {
  const when = new Date(game.scheduled_at);
  const dateStr = when.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timeStr = when.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Link
      href={`/teams/${teamId}/games/${game.id}`}
      className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            {game.round_number != null && (
              <span className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                Round {game.round_number}
              </span>
            )}
            <span className="text-xs text-gray-400">{dateStr} · {timeStr}</span>
          </div>
          <h3 className="mt-1 truncate text-base font-semibold text-gray-900">
            vs {game.opponent}
          </h3>
          {game.location && (
            <p className="mt-0.5 truncate text-sm text-gray-500">{game.location}</p>
          )}
        </div>
        <div className="text-right">
          <span className="text-lg font-bold tabular-nums text-brand-600">
            {availableCount}
          </span>
          <span className="text-sm text-gray-400"> / {totalActive}</span>
          <p className="text-xs text-gray-400">available</p>
        </div>
      </div>
    </Link>
  );
}
