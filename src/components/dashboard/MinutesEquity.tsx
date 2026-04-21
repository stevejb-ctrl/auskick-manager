import type { PlayerSeasonStats } from "@/lib/dashboard/types";
import { EmptyState } from "./EmptyState";

const MS_PER_MIN = 60_000;

interface Props {
  stats: PlayerSeasonStats[];
  hasData: boolean;
}

export function MinutesEquity({ stats, hasData }: Props) {
  if (!hasData || stats.length === 0) {
    return (
      <EmptyState
        title="No data yet — will populate once games are played"
        description="Shows each player's total minutes vs the squad average."
      />
    );
  }

  const totalMs = stats.reduce((s, p) => s + p.totalMs, 0);
  const avg = stats.length > 0 ? totalMs / stats.length : 0;
  const maxMs = Math.max(...stats.map((p) => p.totalMs));

  const sorted = [...stats].sort((a, b) => b.totalMs - a.totalMs);

  function colorClass(ms: number) {
    if (avg === 0) return "bg-ink-mute";
    const ratio = ms / avg;
    if (ratio < 0.8) return "bg-danger";
    if (ratio > 1.2) return "bg-warn";
    return "bg-brand-500";
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-dim">
        <span>
          Team avg:{" "}
          <strong className="text-ink tabular-nums">
            {Math.round(avg / MS_PER_MIN)} min
          </strong>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-danger" aria-hidden />
          &lt;80%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-warn" aria-hidden />
          &gt;120%
        </span>
      </div>
      <div className="space-y-2.5">
        {sorted.map((p) => {
          const pct = maxMs > 0 ? (p.totalMs / maxMs) * 100 : 0;
          return (
            <div key={p.playerId}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-ink">
                  {p.playerName}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-ink-dim">
                  {Math.round(p.totalMs / MS_PER_MIN)} min
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-surface-alt">
                <div
                  className={`h-2 rounded-full transition-all duration-slow ${colorClass(
                    p.totalMs
                  )}`}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
