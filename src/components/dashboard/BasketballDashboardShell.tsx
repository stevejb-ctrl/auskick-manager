// ─── BasketballDashboardShell ────────────────────────────────
// Basketball's season stats. Same ladder as the AFL, netball, league
// and soccer dashboards (header with the season picker, a totals strip,
// season balance, the player table), so a coach coming from another
// sport finds it where they expect. Basketball's own numbers: points,
// the result (when scoring is on), minutes, guard and forward time
// (the line and position strategies), and fouls (when the tally is on).

import { SeasonBalanceSection, type SeasonBalanceSectionProps } from "./SeasonBalanceGrid";
import { SeasonSelector } from "@/components/dashboard/SeasonSelector";
import { EmptyState } from "@/components/dashboard/EmptyState";
import type { BasketballSeasonAggregate } from "@/lib/dashboard/basketballAggregators";
import type { Season } from "@/lib/dashboard/types";

interface BasketballDashboardShellProps {
  seasons: Season[];
  selectedYear: number;
  playerNames: Record<string, string>;
  aggregate: BasketballSeasonAggregate;
  totalGames: number;
  trackScoring: boolean;
  trackFouls: boolean;
  /** The team plays guards and forwards: show the split. */
  withLines: boolean;
  seasonBalance?: SeasonBalanceSectionProps;
}

function fmtMins(ms: number): string {
  return `${Math.round(ms / 60_000)}`;
}

export function BasketballDashboardShell({
  seasons,
  selectedYear,
  playerNames,
  aggregate,
  totalGames,
  trackScoring,
  trackFouls,
  withLines,
  seasonBalance,
}: BasketballDashboardShellProps) {
  const header = (
    <header className="flex items-center justify-between">
      <h1 className="text-xl font-bold text-ink">Season stats</h1>
      {seasons.length > 1 && <SeasonSelector seasons={seasons} selectedYear={selectedYear} />}
    </header>
  );
  if (totalGames === 0) {
    return (
      <div className="space-y-4">
        {header}
        <EmptyState
          title="No completed games yet"
          description="Finish a game (tip-off → finish) and stats will appear here."
        />
      </div>
    );
  }

  const rows = Object.values(aggregate.perPlayer).sort(
    (a, b) => b.gamesPlayed - a.gamesPlayed || (playerNames[a.playerId] ?? "").localeCompare(playerNames[b.playerId] ?? ""),
  );
  const t = aggregate.totals;

  return (
    <div className="space-y-6">
      {header}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TotalCard label="Games" value={t.games} />
        {trackScoring && (
          <>
            <TotalCard label="Points for" value={t.pointsFor} />
            <TotalCard label="Against" value={t.pointsAgainst} />
            <TotalCard label="Won · Drawn · Lost" value={`${t.wins}·${t.draws}·${t.losses}`} />
          </>
        )}
      </section>

      {seasonBalance && <SeasonBalanceSection {...seasonBalance} />}

      <section className="overflow-x-auto rounded-xl border border-hairline bg-surface shadow-card">
        <table className="w-full text-sm" aria-label="Player stats">
          <thead className="bg-surface-alt text-xs uppercase tracking-wide text-ink-dim">
            <tr>
              <Th className="text-left">Player</Th>
              <Th>GP</Th>
              <Th>Mins</Th>
              {withLines && <Th>G · F</Th>}
              {trackScoring && <Th>Pts</Th>}
              {trackFouls && <Th>Fouls</Th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.playerId} className="border-t border-hairline hover:bg-surface-alt">
                <Td className="text-left font-medium text-ink">{playerNames[r.playerId] ?? r.playerId}</Td>
                <Td>{r.gamesPlayed}</Td>
                <Td>{fmtMins(r.ms)}</Td>
                {withLines && <Td>{`${fmtMins(r.guardMs)} · ${fmtMins(r.forwardMs)}`}</Td>}
                {trackScoring && <Td>{r.points || "—"}</Td>}
                {trackFouls && <Td>{r.fouls > 0 ? `${r.fouls}${r.foulOuts > 0 ? ` · ${r.foulOuts} out` : ""}` : "—"}</Td>}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function TotalCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div role="group" aria-label={label} className="rounded-xl border border-hairline bg-surface p-3 shadow-card">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-dim">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-3 py-2 text-center font-bold ${className}`.trim()} scope="col">
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 text-center tabular-nums ${className}`.trim()}>{children}</td>;
}
