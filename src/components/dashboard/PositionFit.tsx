import type { Zone } from "@/lib/types";
import type { PositionFitRow } from "@/lib/dashboard/types";
import { EmptyState } from "./EmptyState";

const ZONE_LABEL: Record<Zone, string> = {
  back: "Back",
  hback: "H-back",
  mid: "Mid",
  hfwd: "H-fwd",
  fwd: "Fwd",
};

const MS_PER_MIN = 60_000;

interface Props {
  rows: PositionFitRow[];
  playerNames: Record<string, string>;
  hasData: boolean;
}

export function PositionFit({ rows, playerNames, hasData }: Props) {
  if (!hasData || rows.length === 0) {
    return (
      <EmptyState
        title="No data yet — will populate once games are played"
        description="Shows each player's scoring effectiveness per zone they've played in."
      />
    );
  }

  // Group by player
  const byPlayer = new Map<string, PositionFitRow[]>();
  for (const row of rows) {
    const existing = byPlayer.get(row.playerId) ?? [];
    existing.push(row);
    byPlayer.set(row.playerId, existing);
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {Array.from(byPlayer.entries()).map(([pid, zoneRows]) => {
        const playerName = playerNames[pid] ?? pid;
        const sorted = [...zoneRows].sort(
          (a, b) => b.durationMs - a.durationMs
        );
        return (
          <div
            key={pid}
            className="rounded-lg border border-hairline bg-surface p-3 shadow-card"
          >
            <p className="mb-2 text-sm font-semibold text-ink">{playerName}</p>
            <div className="space-y-1.5">
              {/* Column headers */}
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-micro text-ink-mute">
                <span className="w-14 shrink-0">Zone</span>
                <span className="w-10 shrink-0 text-right">Min</span>
                <span className="flex-1 text-right">For/90</span>
                <span className="flex-1 text-right">Agst/90</span>
              </div>
              {sorted.map((row) => (
                <div
                  key={row.zone}
                  className="flex items-center gap-2 text-xs tabular-nums"
                >
                  <span className="w-14 shrink-0 font-medium text-ink-dim">
                    {ZONE_LABEL[row.zone]}
                  </span>
                  <span className="w-10 shrink-0 text-right text-ink-mute">
                    {Math.round(row.durationMs / MS_PER_MIN)}m
                  </span>
                  <span className="flex-1 text-right font-semibold text-brand-600">
                    {row.goalsForRate.toFixed(1)}
                  </span>
                  <span className="flex-1 text-right font-semibold text-danger">
                    {row.goalsAgainstRate.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
