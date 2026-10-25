// ─── SoccerDashboardShell ────────────────────────────────────
// Football (soccer)'s season stats. Same ladder as the AFL, netball and
// league dashboards (header with the season picker, a totals strip,
// season balance, the player table), so a coach coming from another
// sport finds it where they expect. Soccer's own numbers: goals, the
// result (only when scoring is on: MiniRoos keeps none), minutes, and
// time in goal, which "Everyone has a turn" shares out. Goals nobody was
// named for get their own row, so the goals add up to goals for.

import { SeasonBalanceSection, type SeasonBalanceSectionProps } from "./SeasonBalanceGrid";
import { SeasonSelector } from "@/components/dashboard/SeasonSelector";
import { EmptyState } from "@/components/dashboard/EmptyState";
import type { SoccerSeasonAggregate } from "@/lib/dashboard/soccerAggregators";
import type { Season } from "@/lib/dashboard/types";

interface SoccerDashboardShellProps {
  seasons: Season[];
  selectedYear: number;
  playerNames: Record<string, string>;
  aggregate: SoccerSeasonAggregate;
  totalGames: number;
  trackScoring: boolean;
  /** No keeper at this age (4 a side): no "In goal" column. */
  withKeeper: boolean;
  seasonBalance?: SeasonBalanceSectionProps;
}

function fmtMins(ms: number): string {
  return `${Math.round(ms / 60_000)}`;
}

export function SoccerDashboardShell({
  seasons,
  selectedYear,
  playerNames,
  aggregate,
  totalGames,
  trackScoring,
  withKeeper,
  seasonBalance,
}: SoccerDashboardShellProps) {
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
          description="Finish a game (kick off → finish) and stats will appear here."
        />
      </div>
    );
  }

  // A squad kid who came but never got on is listed at 0, so the coach
  // sees who missed out (UX round 2, 24 Oct 2026); a fill-in only once
  // they've played.
  const rows = Object.values(aggregate.perPlayer)
    .filter((r) => r.gamesPlayed > 0 || playerNames[r.playerId] !== undefined)
    .sort(
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
            <TotalCard label="Goals" value={t.goalsFor} />
            <TotalCard label="Conceded" value={t.goalsAgainst} />
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
              {trackScoring && <Th>Goals</Th>}
              {withKeeper && <Th>In goal</Th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.playerId} className="border-t border-hairline hover:bg-surface-alt">
                <Td className="text-left font-medium text-ink">{playerNames[r.playerId] ?? r.playerId}</Td>
                <Td>{r.gamesPlayed}</Td>
                <Td>{fmtMins(r.ms)}</Td>
                {trackScoring && <Td>{r.goals || "—"}</Td>}
                {withKeeper && (
                  <Td>{r.keeperMs > 0 ? `${fmtMins(r.keeperMs)} min · ${r.keeperGames} ${r.keeperGames === 1 ? "game" : "games"}` : "—"}</Td>
                )}
              </tr>
            ))}
          </tbody>
          {/* Goals nobody was named for, so the column adds up to goals
              for (as touch's tries do: UX round 2, 24 Oct 2026). */}
          {trackScoring && aggregate.noScorer.goals > 0 && (
            <tfoot>
              <tr className="border-t border-hairline text-ink-dim">
                <Td className="text-left">No scorer</Td>
                <Td>—</Td>
                <Td>—</Td>
                <Td>{aggregate.noScorer.goals}</Td>
                {withKeeper && <Td>—</Td>}
              </tr>
            </tfoot>
          )}
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
