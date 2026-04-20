import type { Zone } from "@/lib/types";
import type { ZoneCombination } from "@/lib/dashboard/types";
import { EmptyState } from "./EmptyState";

const ZONE_LABEL: Record<Zone, string> = {
  back: "Back",
  hback: "Half-back",
  mid: "Midfield",
  hfwd: "Half-forward",
  fwd: "Forward",
};

const MS_PER_MIN = 60_000;

interface Props {
  combosByZone: Partial<Record<Zone, ZoneCombination[]>>;
  playerNames: Record<string, string>;
  hasData: boolean;
}

export function WinningCombinations({ combosByZone, playerNames, hasData }: Props) {
  if (!hasData || Object.keys(combosByZone).length === 0) {
    return (
      <EmptyState
        title="No data yet — will populate once games are played"
        description="Requires zone-assignment and scoring events to compute lineup effectiveness."
      />
    );
  }

  const zones = Object.keys(combosByZone) as Zone[];

  return (
    <div className="space-y-6">
      {zones.map((zone) => {
        const combos = combosByZone[zone] ?? [];
        if (combos.length === 0) return null;
        return (
          <div key={zone}>
            <h4 className="mb-3 text-sm font-semibold text-gray-700">{ZONE_LABEL[zone]}</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Players</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Min</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">For</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Agnst</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {combos.map((c, i) => {
                    const names = c.playerIds
                      .map((id) => playerNames[id] ?? id)
                      .join(", ");
                    return (
                      <tr key={i} className={`hover:bg-gray-50 ${c.isLowConfidence ? "opacity-60" : ""}`}>
                        <td className="px-3 py-2 text-gray-900">
                          {names}
                          {c.isLowConfidence && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                              &lt;20 min
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600">
                          {Math.round(c.durationMs / MS_PER_MIN)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-brand-700">{c.goalsFor}</td>
                        <td className="px-3 py-2 text-right text-red-600">{c.goalsAgainst}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${c.netDiff > 0 ? "text-brand-700" : c.netDiff < 0 ? "text-red-600" : "text-gray-500"}`}>
                          {c.netDiff > 0 ? "+" : ""}{c.netDiff}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
