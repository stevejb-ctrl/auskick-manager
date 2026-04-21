import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import type { Game } from "@/lib/types";

interface GameInfoHeaderProps {
  teamName: string;
  g: Game;
  /**
   * Compact variant: single slim line of round · date · venue, no card.
   * Used when the scorebug is already showing below this header so the
   * full title would be redundant.
   */
  compact?: boolean;
}

export function GameInfoHeader({ teamName, g, compact = false }: GameInfoHeaderProps) {
  if (compact) {
    return (
      <div className="flex flex-wrap items-baseline gap-x-2 px-1 text-xs text-ink-mute">
        {g.round_number != null && (
          <span className="font-mono font-bold uppercase tracking-micro text-ink-dim">
            R{g.round_number}
          </span>
        )}
        <span>
          <FormattedDateTime iso={g.scheduled_at} mode="long" />
        </span>
        {g.location && <span>· {g.location}</span>}
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-baseline gap-2">
        {g.round_number != null && (
          <span className="text-[11px] font-bold uppercase tracking-micro text-brand-700">
            Round {g.round_number}
          </span>
        )}
        <span className="text-xs text-ink-mute">
          <FormattedDateTime iso={g.scheduled_at} mode="long" />
        </span>
      </div>
      <h2 className="mt-0.5 text-base font-semibold text-ink">
        {teamName} vs {g.opponent}
      </h2>
      {g.location && <p className="text-xs text-ink-mute">{g.location}</p>}
      {g.notes && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-ink-dim">
          {g.notes}
        </p>
      )}
    </div>
  );
}
