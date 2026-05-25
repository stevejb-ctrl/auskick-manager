// ─── LeagueDashboardShell ────────────────────────────────────
// Rugby-league season dashboard. Reads a `LeagueSeasonAggregate`
// + per-game `LeagueGameSnapshot`s and renders the metrics that
// matter for junior RL: tries, conversion success rate, vest
// equity (FR / DH), kickoff equity, and Junior Laws §6
// unbroken-period compliance.
//
// Same DashboardShell visual ladder as AFL + netball — coaches
// landing on this page from a different sport should feel
// continuity rather than a fresh design. The data shape is the
// only thing that's sport-specific.

import { SeasonSelector } from "@/components/dashboard/SeasonSelector";
import { EmptyState } from "@/components/dashboard/EmptyState";
import type {
  LeagueSeasonAggregate,
  LeagueSeasonPlayerStats,
} from "@/lib/dashboard/leagueAggregators";
import type { Season } from "@/lib/dashboard/types";

interface LeagueDashboardShellProps {
  seasons: Season[];
  selectedYear: number;
  playerNames: Record<string, string>;
  aggregate: LeagueSeasonAggregate;
  totalGames: number;
}

export function LeagueDashboardShell({
  seasons,
  selectedYear,
  playerNames,
  aggregate,
  totalGames,
}: LeagueDashboardShellProps) {
  if (totalGames === 0) {
    return (
      <div className="space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-ink">Season stats</h1>
          {seasons.length > 1 && (
            <SeasonSelector seasons={seasons} selectedYear={selectedYear} />
          )}
        </header>
        <EmptyState
          title="No completed games yet"
          description="Finish a game (kick off → finalise) and stats will appear here."
        />
      </div>
    );
  }

  const rows: LeagueSeasonPlayerStats[] = Object.values(aggregate.perPlayer)
    .map((s) => ({ ...s }))
    .sort((a, b) => {
      // Sort by games played desc, then by name for stability.
      if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
      return (playerNames[a.playerId] ?? "").localeCompare(
        playerNames[b.playerId] ?? "",
      );
    });

  const shortfallPlayers = rows.filter((r) => r.unbrokenShortfallGames > 0);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Season stats</h1>
        {seasons.length > 1 && (
          <SeasonSelector seasons={seasons} selectedYear={selectedYear} />
        )}
      </header>

      {/* Team totals strip */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TotalCard label="Games" value={aggregate.totals.games} />
        <TotalCard
          label="Tries"
          value={aggregate.totals.tries}
          sub={`${aggregate.totals.points} pts`}
        />
        <TotalCard
          label="Conv. made"
          value={aggregate.totals.conversionsMade}
          sub={`${aggregate.totals.conversionsAttempted} attempts`}
        />
        <TotalCard
          label="Conceded"
          value={aggregate.totals.opponentPoints}
          sub="opp. points"
        />
      </section>

      {shortfallPlayers.length > 0 && (
        <section className="rounded-xl border border-warn/30 bg-warn-soft p-3">
          <header className="px-1">
            <h2 className="text-xs font-bold uppercase tracking-wide text-warn">
              Laws §6 — unbroken-period shortfalls
            </h2>
            <p className="text-xs text-warn">
              These players appeared in a game without banking the required
              unbroken {seasons[0]?.year ? "" : ""}period count. Coaches
              should plan rotations so every player hits the minimum.
            </p>
          </header>
          <ul className="mt-2 space-y-0.5 px-1 text-sm">
            {shortfallPlayers.map((p) => (
              <li key={p.playerId} className="flex justify-between">
                <span className="text-ink">
                  {playerNames[p.playerId] ?? p.playerId}
                </span>
                <span className="font-mono tabular-nums text-warn">
                  {p.unbrokenShortfallGames} of {p.gamesPlayed} games
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Per-player table */}
      <section className="overflow-x-auto rounded-xl border border-hairline bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-xs uppercase tracking-wide text-ink-dim">
            <tr>
              <Th className="text-left">Player</Th>
              <Th>GP</Th>
              <Th>Tries</Th>
              <Th>Conv (M/A)</Th>
              <Th>FR</Th>
              <Th>DH</Th>
              <Th>Kickoffs</Th>
              <Th>Unbroken</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.playerId}
                className="border-t border-hairline hover:bg-surface-alt"
              >
                <Td className="text-left font-medium text-ink">
                  {playerNames[r.playerId] ?? r.playerId}
                </Td>
                <Td>{r.gamesPlayed}</Td>
                <Td>{r.tries || "—"}</Td>
                <Td>
                  {r.conversionsAttempted > 0
                    ? `${r.conversionsMade}/${r.conversionsAttempted}`
                    : "—"}
                </Td>
                <Td>{r.vestFr || "—"}</Td>
                <Td>{r.vestDh || "—"}</Td>
                <Td>{r.kickoffs || "—"}</Td>
                <Td
                  className={
                    r.unbrokenShortfallGames > 0 ? "text-warn" : "text-ok"
                  }
                >
                  {r.unbrokenCompliantGames}/{r.gamesPlayed}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function TotalCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-3 shadow-card">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-dim">
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-ink">
        {value}
      </p>
      {sub && <p className="text-xs text-ink-mute">{sub}</p>}
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-3 py-2 font-bold text-center ${className}`.trim()}
      scope="col"
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={`px-3 py-2 text-center tabular-nums ${className}`.trim()}>
      {children}
    </td>
  );
}
