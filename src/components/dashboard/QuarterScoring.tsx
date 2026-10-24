import type { QuarterScoringRow } from "@/lib/dashboard/types";
import { EmptyState } from "./EmptyState";

// A quarter is won on points (goals × 6 + behinds), so 1.1 (7) beats
// 1.0 (6); it compared goals and called that quarter lost (UX audit,
// 23 Oct 2026). Averages drop a trailing ".0".
const TONE = { ahead: "text-brand-600", level: "text-ink-dim", behind: "text-danger" } as const;
const avg = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

interface Props {
  rows: QuarterScoringRow[];
  hasData: boolean;
}

export function QuarterScoring({ rows, hasData }: Props) {
  if (!hasData || rows.length === 0) {
    return (
      <EmptyState
        title="No data yet — will populate once games are played"
        description="Shows average scores for and against per quarter across all games."
      />
    );
  }

  const maxPoints = Math.max(
    ...rows.flatMap((r) => [r.avgPointsFor, r.avgPointsAgainst])
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
        const forPct = maxPoints > 0 ? (row.avgPointsFor / maxPoints) * 100 : 0;
        const agPct =
          maxPoints > 0 ? (row.avgPointsAgainst / maxPoints) * 100 : 0;
        return (
          <div
            key={row.quarter}
            className="space-y-1.5"
            data-testid={`quarter-scoring-${row.quarter}`}
            data-result={row.result}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-ink">
                Q{row.quarter}
              </span>
              <span className="text-[10px] uppercase tracking-micro text-ink-mute">
                {row.gamesCount} {row.gamesCount === 1 ? "game" : "games"}
              </span>
            </div>
            <p className={`text-xs font-medium tabular-nums ${TONE[row.result]}`}>
              {avg(row.avgGoalsFor)}g {avg(row.avgBehindsFor)}b ({avg(row.avgPointsFor)}){" "}
              <span className="text-ink-mute">vs</span>{" "}
              {avg(row.avgGoalsAgainst)}g {avg(row.avgBehindsAgainst)}b ({avg(row.avgPointsAgainst)})
              <span className="text-ink-mute"> · </span>
              {row.result}
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
