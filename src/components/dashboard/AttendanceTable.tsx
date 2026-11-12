import type { AttendanceRow } from "@/lib/dashboard/types";
import { EmptyState } from "./EmptyState";

interface Props {
  rows: AttendanceRow[];
  totalGames: number;
  hasData: boolean;
}

export function AttendanceTable({ rows, hasData }: Props) {
  if (!hasData || rows.length === 0) {
    return (
      <EmptyState
        title="No attendance data yet"
        description="Attendance populates once games are played and finalised."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-hairline">
      <table className="w-full text-sm">
        <thead className="bg-surface-alt">
          <tr>
            <th className="px-2 py-2 text-left text-nano font-semibold uppercase tracking-micro text-ink-mute">
              #
            </th>
            <th className="px-2 py-2 text-left text-nano font-semibold uppercase tracking-micro text-ink-mute">
              Player
            </th>
            <th className="px-2 py-2 text-right text-nano font-semibold uppercase tracking-micro text-ink-mute">
              Played
            </th>
            <th className="px-2 py-2 text-right text-nano font-semibold uppercase tracking-micro text-ink-mute">
              %
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline bg-surface">
          {rows.map((row) => (
            <tr key={row.playerId}>
              <td className="px-2 py-2 tabular-nums text-ink-mute">
                {row.jerseyNumber ?? ""}
              </td>
              <td className="w-full max-w-0 truncate px-2 py-2 font-medium text-ink" title={row.playerName}>
                {row.playerName}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-ink-dim">
                {/* Out of the games they were on the squad for: a kid
                    added mid-season isn't charged for the ones before. */}
                {row.gamesPlayed} / {row.gamesOnSquad}
              </td>
              <td className="px-2 py-2 text-right">
                <span
                  className={`font-semibold tabular-nums ${
                    row.attendancePct >= 80
                      ? "text-brand-600"
                      : row.attendancePct >= 50
                      ? "text-warn"
                      : "text-danger"
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
