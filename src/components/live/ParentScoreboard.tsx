import { SFCard, StatusPill } from "@/components/sf";
import { AutoRefresh } from "@/components/live/AutoRefresh";
import { liveStatusFromEvents, scoreFromEvents } from "@/lib/results";
import type { GameEvent, Sport } from "@/lib/types";

interface ParentScoreboardProps {
  sport: Sport;
  teamName: string;
  opponent: string;
  events: GameEvent[];
  trackScoring: boolean;
  /** "quarter" or "half" — names the period. */
  periodLabel: "quarter" | "half" | "period";
}

/**
 * What a parent sees on the live screen: a read-only scoreboard that
 * refreshes itself. It replaces the dead end parents used to hit ("Only
 * admins and game managers can run a live game") — UX plan §6, Parents.
 */
export function ParentScoreboard({
  sport,
  teamName,
  opponent,
  events,
  trackScoring,
  periodLabel,
}: ParentScoreboardProps) {
  const status = liveStatusFromEvents(events);
  const score = trackScoring ? scoreFromEvents(sport, events) : null;
  const abbr = periodLabel.charAt(0).toUpperCase();
  const statusText = status.finalised
    ? "Full time"
    : status.period === 0
      ? "Not started"
      : status.periodEnded
        ? `${abbr}${status.period} break`
        : `${abbr}${status.period} in play`;

  return (
    <SFCard>
      <AutoRefresh intervalMs={15_000} />
      <div className="flex items-center justify-between gap-3">
        <StatusPill status={status.finalised ? "final" : status.period > 0 ? "live" : "upcoming"} />
        <span className="font-mono text-xs font-semibold text-ink-dim" aria-live="polite">
          {statusText}
        </span>
      </div>
      {score ? (
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-micro text-ink-dim">{teamName}</p>
            <p className="font-mono text-4xl font-bold tabular-nums text-ink">{score.us}</p>
            {score.usDetail && <p className="font-mono text-xs text-ink-mute">{score.usDetail}</p>}
          </div>
          <span className="text-ink-mute">–</span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-micro text-ink-dim">{opponent}</p>
            <p className="font-mono text-4xl font-bold tabular-nums text-ink">{score.them}</p>
            {score.themDetail && <p className="font-mono text-xs text-ink-mute">{score.themDetail}</p>}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-center text-sm text-ink-dim">
          {teamName} vs {opponent} — this team doesn&apos;t keep score.
        </p>
      )}
      <p className="mt-4 text-center text-xs text-ink-mute">
        Updates every 15 seconds. Coaches and managers run the game from their phones.
      </p>
    </SFCard>
  );
}
