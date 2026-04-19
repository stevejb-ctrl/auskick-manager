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
    if (avg === 0) return "bg-gray-300";
    const ratio = ms / avg;
    if (ratio < 0.8) return "bg-red-400";
    if (ratio > 1.2) return "bg-amber-400";
    return "bg-brand-500";
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span>Team avg: <strong className="text-gray-700">{Math.round(avg / MS_PER_MIN)} min</strong></span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded bg-red-400" /> &lt;80% avg</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded bg-amber-400" /> &gt;120% avg</span>
      </div>
      {sorted.map((p) => {
        const pct = maxMs > 0 ? (p.totalMs / maxMs) * 100 : 0;
        return (
          <div key={p.playerId} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-sm font-medium text-gray-700">
              {p.playerName}
            </span>
            <div className="flex-1 rounded-full bg-gray-100">
              <div
                className={`h-4 rounded-full ${colorClass(p.totalMs)} transition-all`}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
            <span className="w-14 text-right text-sm text-gray-600">
              {Math.round(p.totalMs / MS_PER_MIN)} min
            </span>
          </div>
        );
      })}
    </div>
  );
}
