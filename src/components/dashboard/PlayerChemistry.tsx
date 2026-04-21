import type { PlayerChemistryPair } from "@/lib/dashboard/types";
import { EmptyState } from "./EmptyState";

const MS_PER_MIN = 60_000;

interface Props {
  pairs: PlayerChemistryPair[];
  playerNames: Record<string, string>;
  hasData: boolean;
}

export function PlayerChemistry({ pairs, playerNames, hasData }: Props) {
  if (!hasData || pairs.length === 0) {
    return (
      <EmptyState
        title="No data yet — will populate once games are played"
        description="Shows the 10 player pairs with the best net score while on field together."
      />
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {pairs.map((pair, i) => {
        const nameA = playerNames[pair.playerAId] ?? pair.playerAId;
        const nameB = playerNames[pair.playerBId] ?? pair.playerBId;
        const netColor =
          pair.netDiff > 0
            ? "text-brand-600"
            : pair.netDiff < 0
            ? "text-danger"
            : "text-ink-mute";
        return (
          <div
            key={i}
            className="rounded-lg border border-hairline bg-surface p-3 shadow-card"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-ink">
                {nameA} <span className="text-ink-mute">&amp;</span> {nameB}
              </p>
              <span
                className={`shrink-0 text-lg font-bold leading-none tabular-nums ${netColor}`}
              >
                {pair.netDiff > 0 ? "+" : ""}
                {pair.netDiff}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3 text-[11px] text-ink-dim">
              <span className="tabular-nums">
                {Math.round(pair.durationMs / MS_PER_MIN)} min together
              </span>
              <span className="h-3 w-px bg-hairline" aria-hidden />
              <span>
                <span className="font-semibold text-brand-600 tabular-nums">
                  {pair.goalsFor}
                </span>{" "}
                for
              </span>
              <span>
                <span className="font-semibold text-danger tabular-nums">
                  {pair.goalsAgainst}
                </span>{" "}
                agst
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
