import type { Zone } from "@/lib/types";
import type { PositionFitRow } from "@/lib/dashboard/types";
import { EmptyState } from "./EmptyState";

const ZONE_ABBR: Record<Zone, string> = {
  back: "BK",
  hback: "HB",
  mid: "MID",
  hfwd: "HF",
  fwd: "FWD",
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
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Player</th>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Zone</th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Min</th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">For/90</th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Agnst/90</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {Array.from(byPlayer.entries()).map(([pid, zoneRows]) => {
            const playerName = playerNames[pid] ?? pid;
            const sorted = [...zoneRows].sort((a, b) => b.durationMs - a.durationMs);
            return sorted.map((row, idx) => (
              <tr key={`${pid}-${row.zone}`} className="hover:bg-gray-50">
                {idx === 0 && (
                  <td
                    rowSpan={sorted.length}
                    className="px-3 py-2 align-top font-medium text-gray-900"
                  >
                    {playerName}
                  </td>
                )}
                <td className="px-3 py-2 text-gray-500">{ZONE_ABBR[row.zone]}</td>
                <td className="px-3 py-2 text-right text-gray-600">
                  {Math.round(row.durationMs / MS_PER_MIN)}
                </td>
                <td className="px-3 py-2 text-right font-medium text-brand-700">
                  {row.goalsForRate.toFixed(1)}
                </td>
                <td className="px-3 py-2 text-right text-red-600">
                  {row.goalsAgainstRate.toFixed(1)}
                </td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}
