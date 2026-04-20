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
      <div className="flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm bg-brand-500" /> For
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm bg-red-400" /> Against
        </span>
      </div>
      {rows.map((row) => {
        const forPct = maxGoals > 0 ? (row.avgGoalsFor / maxGoals) * 100 : 0;
        const agPct = maxGoals > 0 ? (row.avgGoalsAgainst / maxGoals) * 100 : 0;
        const won = row.avgGoalsFor > row.avgGoalsAgainst;
        return (
          <div key={row.quarter} className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-16 shrink-0 font-medium text-gray-700">Q{row.quarter}</span>
              <span className={`text-xs font-semibold ${won ? "text-brand-600" : "text-red-600"}`}>
                {row.avgGoalsFor.toFixed(1)}g {row.avgBehindsFor.toFixed(1)}b vs {row.avgGoalsAgainst.toFixed(1)}g {row.avgBehindsAgainst.toFixed(1)}b
              </span>
              <span className="text-xs text-gray-400">({row.gamesCount} games)</span>
            </div>
            <div className="space-y-1">
              <div className="h-3 w-full rounded-full bg-gray-100">
                <div
                  className="h-3 rounded-full bg-brand-500 transition-all"
                  style={{ width: `${Math.max(forPct, 2)}%` }}
                />
              </div>
              <div className="h-3 w-full rounded-full bg-gray-100">
                <div
                  className="h-3 rounded-full bg-red-400 transition-all"
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
