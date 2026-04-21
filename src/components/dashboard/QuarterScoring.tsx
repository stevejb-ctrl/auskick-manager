import type { QuarterScoringRow } from "@/lib/dashboard/types";
import { EmptyState } from "./EmptyState";

interface Props {
  rows: QuarterScoringRow[];
  hasData: boolean;
}

export function QuarterScoring({ rows, hasData }: Props) {
  if (!hasData || rows.length === 0) {
    return (
      <EmptyState
        title="No data yet — will populate once games are played"
        description="Shows average goals scored vs conceded per quarter across all games."
      />
    );
  }

  const maxGoals = Math.max(
    ...rows.flatMap((r) => [r.avgGoalsFor, r.avgGoalsAgainst])
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-dim">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-3 rounded-sm bg-brand-500"
            aria-hidden
          />{" "}
          For
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-3 rounded-sm bg-danger"
            aria-hidden
          />{" "}
          Against
        </span>
      </div>
      {rows.map((row) => {
        const forPct = maxGoals > 0 ? (row.avgGoalsFor / maxGoals) * 100 : 0;
        const agPct =
          maxGoals > 0 ? (row.avgGoalsAgainst / maxGoals) * 100 : 0;
        const won = row.avgGoalsFor > row.avgGoalsAgainst;
        return (
          <div key={row.quarter} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-ink">
                Q{row.quarter}
              </span>
              <span className="text-[10px] uppercase tracking-micro text-ink-mute">
                {row.gamesCount} {row.gamesCount === 1 ? "game" : "games"}
              </span>
            </div>
            <p
              className={`text-xs font-medium tabular-nums ${
                won ? "text-brand-600" : "text-danger"
              }`}
            >
              {row.avgGoalsFor.toFixed(1)}g {row.avgBehindsFor.toFixed(1)}b{" "}
              <span className="text-ink-mute">vs</span>{" "}
              {row.avgGoalsAgainst.toFixed(1)}g{" "}
              {row.avgBehindsAgainst.toFixed(1)}b
            </p>
            <div className="space-y-1">
              <div className="h-2.5 w-full rounded-full bg-surface-alt">
                <div
                  className="h-2.5 rounded-full bg-brand-500 transition-all duration-slow"
                  style={{ width: `${Math.max(forPct, 2)}%` }}
                />
              </div>
              <div className="h-2.5 w-full rounded-full bg-surface-alt">
                <div
                  className="h-2.5 rounded-full bg-danger transition-all duration-slow"
                  style={{ width: `${Math.max(agPct, 2)}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
