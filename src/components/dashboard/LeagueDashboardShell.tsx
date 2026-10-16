// ─── LeagueDashboardShell ────────────────────────────────────
// Rugby-league season dashboard. Reads a `LeagueSeasonAggregate`
// + per-game `LeagueGameSnapshot`s and renders the metrics that
// matter for junior RL: tries, conversion success rate, vest
// equity (FR / DH), kickoff equity, and Junior Laws §6
// unbroken-period compliance.
//
// Each law's columns show only where the age group has that law
// (leagueStatsColumns): U13+ grades play international laws, so they
// score penalty and field goals and none of the junior laws apply (the
// goal counts replace the kickoff / unbroken columns and the §6 panel
// goes); junior grades never show goals (Law 17 forbids both kicks);
// FR and DH show where those vests are worn (none at U6–U7, FR only at
// U8).
//
// Same DashboardShell visual ladder as AFL + netball — coaches
// landing on this page from a different sport should feel
// continuity rather than a fresh design. The data shape is the
// only thing that's sport-specific.

import { SeasonBalanceSection, type SeasonBalanceSectionProps } from "./SeasonBalanceGrid";
import { SeasonSelector } from "@/components/dashboard/SeasonSelector";
import { EmptyState } from "@/components/dashboard/EmptyState";
import type {
  LeagueSeasonAggregate,
  LeagueSeasonPlayerStats,
} from "@/lib/dashboard/leagueAggregators";
import type { Season } from "@/lib/dashboard/types";
import type { LeagueStatsColumns } from "@/lib/dashboard/leagueStatsColumns";
import type { RugbyScoreWords } from "@/lib/sports/rugby_league/fairness";

interface LeagueDashboardShellProps {
  seasons: Season[];
  selectedYear: number;
  playerNames: Record<string, string>;
  aggregate: LeagueSeasonAggregate;
  totalGames: number;
  /** Stats › Season balance (UX plan 4.4). */
  seasonBalance?: SeasonBalanceSectionProps;
  /** Which law columns the team's age group has (leagueStatsColumns). */
  columns: LeagueStatsColumns;
  /** The sport's goal names (union's field goal is a drop goal). */
  words: RugbyScoreWords;
}

export function LeagueDashboardShell({
  seasons,
  selectedYear,
  playerNames,
  aggregate,
  totalGames,
  seasonBalance,
  columns,
  words,
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

  const shortfallPlayers = columns.unbroken
    ? rows.filter((r) => r.unbrokenShortfallGames > 0)
    : [];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Season stats</h1>
        {seasons.length > 1 && (
          <SeasonSelector seasons={seasons} selectedYear={selectedYear} />
        )}
      </header>

      {/* Team totals strip */}
      <section
        className={`grid grid-cols-2 gap-3 ${columns.goals ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}
      >
        <TotalCard label="Games" value={aggregate.totals.games} />
        <TotalCard
          label="Tries"
          value={aggregate.totals.tries}
          sub={`${aggregate.totals.points} pts`}
        />
        <TotalCard
          label="Conv. made"
          value={aggregate.totals.conversionsMade}
          sub={`${aggregate.totals.conversionsAttempted} ${
            aggregate.totals.conversionsAttempted === 1 ? "attempt" : "attempts"
          }`}
        />
        {columns.goals && (
          <>
            <TotalCard label="Pen. goals" value={aggregate.totals.penaltyGoals} />
            <TotalCard label={`${words.fieldGoal.label}s`} value={aggregate.totals.fieldGoals} />
          </>
        )}
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

      {seasonBalance && <SeasonBalanceSection {...seasonBalance} />}

      {/* Per-player table */}
      <section className="overflow-x-auto rounded-xl border border-hairline bg-surface shadow-card">
        <table className="w-full text-sm" aria-label="Player stats">
          <thead className="bg-surface-alt text-xs uppercase tracking-wide text-ink-dim">
            <tr>
              <Th className="text-left">Player</Th>
              <Th>GP</Th>
              <Th>Tries</Th>
              <Th>Conv (M/A)</Th>
              {columns.goals && (
                <>
                  <Th>{words.penaltyGoal.short}</Th>
                  <Th>{words.fieldGoal.short}</Th>
                </>
              )}
              {columns.fr && <Th>FR</Th>}
              {columns.dh && <Th>DH</Th>}
              {columns.kickoffs && <Th>Kickoffs</Th>}
              {columns.unbroken && <Th>Unbroken</Th>}
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
                {columns.goals && (
                  <>
                    <Td>{r.penaltyGoals || "—"}</Td>
                    <Td>{r.fieldGoals || "—"}</Td>
                  </>
                )}
                {columns.fr && <Td>{r.vestFr || "—"}</Td>}
                {columns.dh && <Td>{r.vestDh || "—"}</Td>}
                {columns.kickoffs && <Td>{r.kickoffs || "—"}</Td>}
                {columns.unbroken && (
                  <Td
                    className={
                      r.unbrokenShortfallGames > 0 ? "text-warn" : "text-ok"
                    }
                  >
                    {r.unbrokenCompliantGames}/{r.gamesPlayed}
                  </Td>
                )}
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
    <div
      role="group"
      aria-label={label}
      className="rounded-xl border border-hairline bg-surface p-3 shadow-card"
    >
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
