import type { AttendanceRow } from "@/lib/dashboard/types";
import { EmptyState } from "./EmptyState";

interface Props {
  rows: AttendanceRow[];
  totalGames: number;
  hasData: boolean;
}

export function AttendanceTable({ rows, totalGames, hasData }: Props) {
  if (!hasData || rows.length === 0) {
    return (
      <EmptyState
        title="No availability data yet"
        description="Attendance populates once players are marked available/unavailable for games."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">#</th>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Player</th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
              Available / {totalGames}
            </th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.map((row) => (
            <tr key={row.playerId} className="hover:bg-gray-50">
              <td className="px-3 py-2 text-gray-400">{row.jerseyNumber}</td>
              <td className="px-3 py-2 font-medium text-gray-900">{row.playerName}</td>
              <td className="px-3 py-2 text-right text-gray-600">{row.gamesAvailable}</td>
              <td className="px-3 py-2 text-right">
                <span
                  className={`font-semibold ${
                    row.attendancePct >= 80
                      ? "text-brand-700"
                      : row.attendancePct >= 50
                      ? "text-amber-600"
                      : "text-red-600"
                  }`}
                >
                  {row.attendancePct}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
