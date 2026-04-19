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
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Pair</th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Min together</th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">For</th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Agnst</th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Net</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {pairs.map((pair, i) => {
            const nameA = playerNames[pair.playerAId] ?? pair.playerAId;
            const nameB = playerNames[pair.playerBId] ?? pair.playerBId;
            return (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-900">
                  {nameA} &amp; {nameB}
                </td>
                <td className="px-3 py-2 text-right text-gray-600">
                  {Math.round(pair.durationMs / MS_PER_MIN)}
                </td>
                <td className="px-3 py-2 text-right font-medium text-brand-700">{pair.goalsFor}</td>
                <td className="px-3 py-2 text-right text-red-600">{pair.goalsAgainst}</td>
                <td className={`px-3 py-2 text-right font-semibold ${pair.netDiff > 0 ? "text-brand-700" : pair.netDiff < 0 ? "text-red-600" : "text-gray-500"}`}>
                  {pair.netDiff > 0 ? "+" : ""}{pair.netDiff}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
