import Link from "next/link";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import { SFCard, SFIcon, StatusPill } from "@/components/sf";
import type { Game } from "@/lib/types";
import { ResultChip } from "@/components/sf/ResultChip";
import { outcomeOf, type GameScore } from "@/lib/results";

interface GameRowProps {
  teamId: string;
  game: Game;
  availableCount: number;
  totalActive: number;
  /** A played game's score (null when it didn't keep score). */
  score?: GameScore | null;
}

const RESULT = { W: "win", L: "loss", D: "draw" } as const;

/** W/L/D and the score, on a played game's row. */
function RowResult({ score }: { score: GameScore }) {
  return (
    <span className="flex items-center gap-2">
      <ResultChip result={RESULT[outcomeOf(score)]} />
      <span className="font-mono text-sm font-bold tabular-nums text-ink">
        {score.us}–{score.them}
      </span>
    </span>
  );
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
 * A played game shows W/L/D and the score (from its events, as Today's
 * last result does), or the Final pill when it didn't keep score.
 */
export function GameRow({ teamId, game, availableCount, totalActive, score = null }: GameRowProps) {
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
        // No round number, no empty numeral column (design review, Oct
        // 2026: rows without a round looked indented and broken).
        className={`grid items-center gap-3 px-4 py-3 sm:gap-5 sm:px-5 sm:py-4 ${
          game.round_number != null
            ? "grid-cols-[44px_1fr_auto] sm:grid-cols-[60px_1fr_auto_auto]"
            : "grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto]"
        }`}
      >
        {game.round_number != null ? (
          <span
            className={`font-serif italic leading-none ${numeralColor}`}
            style={{ fontSize: 34, letterSpacing: "-0.02em" }}
          >
            {String(game.round_number).padStart(2, "0")}
          </span>
        ) : null}

        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-base font-bold text-ink sm:text-[1.0625rem]">
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
            score ? <RowResult score={score} /> : <StatusPill status="final" />
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
            <div className="font-mono text-nano font-semibold uppercase tracking-micro text-ink-mute">
              available
            </div>
          </div>
        )}

        {/* Phone: collapse status into the chevron column */}
        <div className="flex items-center gap-2 sm:hidden">
          {isLive ? (
            <StatusPill status="live" />
          ) : isDone ? (
            score ? <RowResult score={score} /> : null
          ) : (
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
