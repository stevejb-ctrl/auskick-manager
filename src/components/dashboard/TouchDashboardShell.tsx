// ─── TouchDashboardShell ─────────────────────────────────────
// Touch and Oztag's season stats. Same ladder as the AFL, netball,
// league, soccer and basketball dashboards (header with the season
// picker, a totals strip, season balance, the player table), so a coach
// coming from another sport finds it where they expect. The touch
// family's own numbers: tries, the result (when scoring is on), minutes,
// and time in each lane (the position strategies). A mixed team's note
// says boys and girls are evened separately; no kid's group is shown.

import { SeasonBalanceSection, type SeasonBalanceSectionProps } from "./SeasonBalanceGrid";
import { SeasonSelector } from "@/components/dashboard/SeasonSelector";
import { EmptyState } from "@/components/dashboard/EmptyState";
import type { TouchSeasonAggregate } from "@/lib/dashboard/touchAggregators";
import type { Season } from "@/lib/dashboard/types";
import { MIXED_FAIRNESS_NOTE } from "@/lib/sports/touch/mixed";

interface TouchDashboardShellProps {
  seasons: Season[];
  selectedYear: number;
  playerNames: Record<string, string>;
  aggregate: TouchSeasonAggregate;
  totalGames: number;
  trackScoring: boolean;
  /** The team plays lanes: show the middle · link · wing split. */
  withLanes: boolean;
  /** A mixed team: say boys and girls are evened separately. */
  mixed: boolean;
  seasonBalance?: SeasonBalanceSectionProps;
}

function fmtMins(ms: number): string {
  return `${Math.round(ms / 60_000)}`;
}

export function TouchDashboardShell({
  seasons,
  selectedYear,
  playerNames,
  aggregate,
  totalGames,
  trackScoring,
  withLanes,
  mixed,
  seasonBalance,
}: TouchDashboardShellProps) {
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
        <EmptyState title="No completed games yet" description="Finish a game (start → finish) and stats will appear here." />
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

      {mixed && (
        <p data-testid="touch-mixed-stats-note" className="px-1 text-xs text-ink-dim">
          {MIXED_FAIRNESS_NOTE} Under the boys&rsquo; cap the two groups can&rsquo;t share the field equally, so each
          group&rsquo;s minutes are even within it.
        </p>
      )}

      <section className="overflow-x-auto rounded-xl border border-hairline bg-surface shadow-card">
        <table className="w-full text-sm" aria-label="Player stats">
          <thead className="bg-surface-alt text-xs uppercase tracking-wide text-ink-dim">
            <tr>
              <Th className="text-left">Player</Th>
              <Th>GP</Th>
              <Th>Mins</Th>
              {withLanes && <Th>M · L · W</Th>}
              {trackScoring && <Th>Tries</Th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.playerId} className="border-t border-hairline hover:bg-surface-alt">
                <Td className="text-left font-medium text-ink">{playerNames[r.playerId] ?? r.playerId}</Td>
                <Td>{r.gamesPlayed}</Td>
                <Td>{fmtMins(r.ms)}</Td>
                {withLanes && <Td>{`${fmtMins(r.middleMs)} · ${fmtMins(r.linkMs)} · ${fmtMins(r.wingMs)}`}</Td>}
                {trackScoring && <Td>{r.tries || "—"}</Td>}
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
