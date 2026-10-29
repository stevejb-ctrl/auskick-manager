"use client";

// ─── Netball stats dashboard ─────────────────────────────────
// Mirrors the AFL DashboardShell at ./DashboardShell.tsx but with
// netball primitives: three thirds, seven named positions, goals-
// only scoring. Reuses the AFL section primitives where the data
// shape matches (AttendanceTable, MinutesEquity, EmptyState,
// SeasonSelector); rolls its own components for sections where
// netball needs a different table shape (player stats, position
// rotation, chemistry, head-to-head).

import { Suspense } from "react";
import { wholePercents } from "@/lib/percentages";
import type {
  NetballChemistryPair,
  NetballHeadToHeadRecord,
  NetballPlayerSeasonStats,
} from "@/lib/dashboard/netballAggregators";
import {
  MS_PER_MIN,
  NETBALL_ALL_POSITIONS,
  netballPositionLabel,
} from "@/lib/dashboard/netballAggregators";
import type { AttendanceRow, Season } from "@/lib/dashboard/types";
import { SeasonSelector } from "./SeasonSelector";
import { MinutesEquity } from "./MinutesEquity";
import { AttendanceTable } from "./AttendanceTable";
import { SeasonBalanceSection, type SeasonBalanceSectionProps } from "./SeasonBalanceGrid";
import { EmptyState } from "./EmptyState";
import { Metric, ZonePill } from "./PlayerStatsTable";

interface Props {
  seasons: Season[];
  selectedYear: number;
  playerNames: Record<string, string>;
  playerStats: NetballPlayerSeasonStats[];
  chemistry: NetballChemistryPair[];
  headToHead: NetballHeadToHeadRecord[];
  attendance: AttendanceRow[];
  totalGames: number;
  hasPlayData: boolean;
  hasScoringData: boolean;
  hasAvailabilityData: boolean;
  /** Stats › Season balance (UX plan 4.4). */
  seasonBalance?: SeasonBalanceSectionProps;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-card">
      <div className="border-b border-hairline px-4 py-3 sm:px-5 sm:py-4">
        <h3 className="text-sm font-semibold text-ink sm:text-base">{title}</h3>
      </div>
      <div className="p-3 sm:p-5">{children}</div>
    </section>
  );
}

export function NetballDashboardShell(props: Props) {
  const {
    seasons,
    selectedYear,
    playerNames,
    playerStats,
    chemistry,
    headToHead,
    attendance,
    totalGames,
    hasPlayData,
    hasScoringData,
    hasAvailabilityData,
  } = props;

  if (seasons.length === 0) {
    return (
      <EmptyState
        size="page"
        title="No completed games yet"
        description="Stats will appear here once the first game is played and finalised."
      />
    );
  }

  // MinutesEquity expects PlayerSeasonStats (AFL shape) but only reads
  // playerId, playerName, totalMs — so a netball stat row is
  // structurally compatible with the fields it touches. We cast at
  // the boundary to avoid duplicating the bar-chart logic.
  const minutesEquityRows = playerStats.map((s) => ({
    playerId: s.playerId,
    playerName: s.playerName,
    jerseyNumber: null,
    gamesPlayed: s.gamesPlayed,
    totalMs: s.totalMs,
    avgMsPerGame: s.avgMsPerGame,
    zoneMs: { back: 0, hback: 0, mid: 0, hfwd: 0, fwd: 0 },
    goals: s.goals,
    behinds: 0,
    subsIn: 0,
    subsOut: 0,
    teamGameTimePct: s.teamGameTimePct,
    loanMs: 0,
  }));

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-dim sm:text-sm">
          <span className="font-semibold tabular-nums text-ink">
            {totalGames}
          </span>{" "}
          completed {totalGames === 1 ? "game" : "games"}
        </p>
        <Suspense fallback={null}>
          <SeasonSelector seasons={seasons} selectedYear={selectedYear} />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6">
        {/* Season balance replaces "Game time" minutes equity (UX plan 4.4),
            and comes first: it's the answer (design review, Oct 2026). */}
        {props.seasonBalance ? (
          <SeasonBalanceSection {...props.seasonBalance} />
        ) : (
          <Section title="Game time">
            <MinutesEquity stats={minutesEquityRows} hasData={hasPlayData} />
          </Section>
        )}

        <Section title="Player statistics">
          <NetballPlayerStatsTable stats={playerStats} hasData={hasPlayData} />
        </Section>

        <Section title="Player chemistry — top pairs">
          <NetballChemistry
            pairs={chemistry}
            playerNames={playerNames}
            hasData={hasPlayData}
          />
        </Section>

        <Section title="Head-to-head by opponent">
          <NetballHeadToHead
            records={headToHead}
            hasData={hasScoringData && totalGames > 0}
          />
        </Section>

        <Section title="Attendance">
          <AttendanceTable
            rows={attendance}
            totalGames={totalGames}
            hasData={hasAvailabilityData}
          />
        </Section>
      </div>
    </div>
  );
}

// ─── Player statistics ───────────────────────────────────────
// One card per kid, as AFL's PlayerStatsTable (UX audit 23 Oct 2026:
// the old table was 499px wide in a 330px card on a phone, with no
// scroll cue): name and total minutes, games / average / % time / goals,
// the three thirds as % of their own court time, then the bibs.
//
// Thirds and bibs share one source: time on court, mid-quarter subs
// included (playerThirdMs and its split by bib), so a kid's bibs add up
// to their thirds. The bibs used to count quarter starts, which missed a
// replacement's stint.
function NetballPlayerStatsTable({
  stats,
  hasData,
}: {
  stats: NetballPlayerSeasonStats[];
  hasData: boolean;
}) {
  if (!hasData || stats.length === 0) {
    return (
      <EmptyState
        title="No play data yet"
        description="Per-player game time + third breakdown populates after the first finalised game."
      />
    );
  }
  const fmt = (ms: number) => Math.round(ms / MS_PER_MIN);

  return (
    // One explicit column (minmax(0, 1fr)), so a card can't grow to the
    // width of its metric row and clip at 320 px (UX round 3, e4).
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {stats.map((s) => {
        // Shares that add up to 100 (lib/percentages).
        const [attPct, cenPct, defPct] = wholePercents([s.thirdMs.attack, s.thirdMs.centre, s.thirdMs.defence]);
        const played = NETBALL_ALL_POSITIONS.filter((p) => (s.positionMs[p] ?? 0) > 0);
        const bibPcts = wholePercents(played.map((p) => s.positionMs[p] ?? 0));
        const bibs = played.map((p, i) => `${netballPositionLabel(p)} ${bibPcts[i]}%`);
        return (
          <div
            key={s.playerId}
            data-testid={`player-stats-${s.playerId}`}
            className="min-w-0 rounded-lg border border-hairline bg-surface p-3 shadow-card"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate font-semibold text-ink">{s.playerName}</p>
              <div className="shrink-0 text-right">
                <p className="text-xl font-bold leading-none tabular-nums text-brand-600">{fmt(s.totalMs)}</p>
                <p className="mt-0.5 text-nano uppercase tracking-micro text-ink-mute">total min</p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              <Metric label="GP" value={s.gamesPlayed} />
              <Metric label="Avg/G" value={`${fmt(s.avgMsPerGame)}m`} />
              <Metric label="% Time" value={`${s.teamGameTimePct}%`} />
              <Metric label="Goals" value={s.goals} accent={s.goals > 0 ? "brand" : undefined} />
            </div>

            {/* Thirds, attack → defence, in the court's colours. */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-micro font-medium">
              <ZonePill abbr="Att" pct={attPct} tone="f" />
              <ZonePill abbr="Cen" pct={cenPct} tone="c" />
              <ZonePill abbr="Def" pct={defPct} tone="b" />
            </div>

            {bibs.length > 0 && (
              <p className="mt-2 font-mono text-micro text-ink-mute">{bibs.join(" · ")}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Chemistry — top pairs ───────────────────────────────────
// Players who have played the same third together for the most
// minutes across the season. Gives the coach a quick read on which
// duos / trios end up together repeatedly — useful counter to the
// teammate-diversity tier in the suggester.
function NetballChemistry({
  pairs,
  playerNames,
  hasData,
}: {
  pairs: NetballChemistryPair[];
  playerNames: Record<string, string>;
  hasData: boolean;
}) {
  if (!hasData || pairs.length === 0) {
    return (
      <EmptyState
        title="No chemistry data yet"
        description="Pairings populate once players have shared a third together for at least a quarter."
      />
    );
  }
  const top = pairs.slice(0, 10);
  return (
    <ul className="space-y-1.5">
      {top.map((p) => (
        <li
          key={`${p.playerAId}:${p.playerBId}`}
          className="flex items-center justify-between gap-2 rounded-md border border-hairline bg-surface px-3 py-2"
        >
          <span className="truncate text-sm font-medium text-ink">
            {playerNames[p.playerAId] ?? "Unknown"}{" "}
            <span className="text-ink-mute">+</span>{" "}
            {playerNames[p.playerBId] ?? "Unknown"}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-ink-dim">
            {Math.round(p.durationMs / MS_PER_MIN)} min
          </span>
        </li>
      ))}
    </ul>
  );
}

// ─── Head-to-head ────────────────────────────────────────────
// Goals-only opponent record. No behinds-equivalent in netball.
function NetballHeadToHead({
  records,
  hasData,
}: {
  records: NetballHeadToHeadRecord[];
  hasData: boolean;
}) {
  if (!hasData || records.length === 0) {
    return (
      <EmptyState
        title="No scoring data yet"
        description="Head-to-head records populate after games with goal events."
      />
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-hairline">
      <table className="w-full text-sm">
        <thead className="bg-surface-alt">
          <tr>
            <th className="px-2 py-2 text-left text-nano font-semibold uppercase tracking-micro text-ink-mute">
              Opponent
            </th>
            <th className="px-2 py-2 text-right text-nano font-semibold uppercase tracking-micro text-ink-mute">
              Played
            </th>
            <th className="px-2 py-2 text-right text-nano font-semibold uppercase tracking-micro text-brand-700">
              W
            </th>
            <th className="px-2 py-2 text-right text-nano font-semibold uppercase tracking-micro text-warn">
              D
            </th>
            <th className="px-2 py-2 text-right text-nano font-semibold uppercase tracking-micro text-danger">
              L
            </th>
            <th className="px-2 py-2 text-right text-nano font-semibold uppercase tracking-micro text-ink-mute">
              For
            </th>
            <th className="px-2 py-2 text-right text-nano font-semibold uppercase tracking-micro text-ink-mute">
              Against
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline bg-surface">
          {records.map((r) => (
            <tr key={r.opponent}>
              <td className="w-full max-w-0 truncate px-2 py-2 font-medium text-ink" title={r.opponent}>
                {r.opponent}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-ink-dim">
                {r.gamesPlayed}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-brand-700">
                {r.wins}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-warn">
                {r.draws}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-danger">
                {r.losses}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-ink-dim">
                {r.goalsFor}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-ink-dim">
                {r.goalsAgainst}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
