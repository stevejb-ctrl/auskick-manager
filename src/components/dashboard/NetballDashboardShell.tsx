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
import { EmptyState } from "./EmptyState";

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
      <div className="rounded-lg border border-dashed border-hairline bg-surface-alt px-6 py-16 text-center">
        <p className="text-sm font-medium text-ink-dim">
          No completed games yet
        </p>
        <p className="mt-1 text-xs text-ink-mute">
          Stats will appear here once the first game is played and finalised.
        </p>
      </div>
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

      <div className="grid gap-4 sm:gap-6">
        <Section title="Player statistics">
          <NetballPlayerStatsTable stats={playerStats} hasData={hasPlayData} />
        </Section>

        <Section title="Minutes equity">
          <MinutesEquity stats={minutesEquityRows} hasData={hasPlayData} />
        </Section>

        <Section title="Position rotation">
          <NetballPositionRotation
            stats={playerStats}
            hasData={hasPlayData}
          />
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

// ─── Player statistics table ─────────────────────────────────
// Per-player season summary: name, games, total mins, % per third,
// goals. Sorted by total mins descending (default from the
// aggregator) so the most-used players sit at the top.
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
  return (
    <div className="overflow-hidden rounded-lg border border-hairline">
      <table className="w-full text-sm">
        <thead className="bg-surface-alt">
          <tr>
            <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-micro text-ink-mute">
              Player
            </th>
            <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-micro text-ink-mute">
              Games
            </th>
            <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-micro text-ink-mute">
              Mins
            </th>
            <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-micro text-zone-f">
              Atk
            </th>
            <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-micro text-zone-c">
              Cen
            </th>
            <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-micro text-zone-b">
              Def
            </th>
            <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-micro text-ink-mute">
              Goals
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline bg-surface">
          {stats.map((s) => {
            const total = s.totalMs || 1;
            const pct = (v: number) => Math.round((v / total) * 100);
            return (
              <tr key={s.playerId}>
                <td className="truncate px-2 py-2 font-medium text-ink">
                  {s.playerName}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-ink-dim">
                  {s.gamesPlayed}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-ink">
                  {Math.round(s.totalMs / MS_PER_MIN)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-zone-f">
                  {pct(s.thirdMs.attack)}%
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-zone-c">
                  {pct(s.thirdMs.centre)}%
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-zone-b">
                  {pct(s.thirdMs.defence)}%
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-ink-dim">
                  {s.goals || ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Position rotation ───────────────────────────────────────
// Per-player count of how many quarters they spent at each of the 7
// positions across the season. Visualises whether a player has been
// pigeon-holed into one slot or rotated through the squad. Heatmap
// shading: 0 = neutral, 1 = mild, 2+ = stronger.
function NetballPositionRotation({
  stats,
  hasData,
}: {
  stats: NetballPlayerSeasonStats[];
  hasData: boolean;
}) {
  if (!hasData || stats.length === 0) {
    return (
      <EmptyState
        title="No rotation data yet"
        description="Position-by-position appearance counts populate after the first finalised game."
      />
    );
  }
  const cellClass = (n: number, kind: "attack" | "centre" | "defence") => {
    if (n === 0) return "text-ink-mute";
    const intensity = Math.min(n, 4);
    const base =
      kind === "attack" ? "text-zone-f" : kind === "centre" ? "text-zone-c" : "text-zone-b";
    const weights = ["", "font-semibold", "font-bold", "font-extrabold", "font-black"];
    return `${base} ${weights[intensity]}`;
  };
  const thirdOf = (
    p: (typeof NETBALL_ALL_POSITIONS)[number],
  ): "attack" | "centre" | "defence" =>
    p === "gs" || p === "ga"
      ? "attack"
      : p === "wa" || p === "c" || p === "wd"
      ? "centre"
      : "defence";
  return (
    <div className="overflow-hidden rounded-lg border border-hairline">
      <table className="w-full text-sm">
        <thead className="bg-surface-alt">
          <tr>
            <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-micro text-ink-mute">
              Player
            </th>
            {NETBALL_ALL_POSITIONS.map((p) => (
              <th
                key={p}
                className={`px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-micro ${
                  thirdOf(p) === "attack"
                    ? "text-zone-f"
                    : thirdOf(p) === "centre"
                    ? "text-zone-c"
                    : "text-zone-b"
                }`}
              >
                {netballPositionLabel(p)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline bg-surface">
          {stats.map((s) => (
            <tr key={s.playerId}>
              <td className="truncate px-2 py-2 font-medium text-ink">
                {s.playerName}
              </td>
              {NETBALL_ALL_POSITIONS.map((p) => {
                const n = s.positionCounts[p] ?? 0;
                return (
                  <td
                    key={p}
                    className={`px-2 py-2 text-center tabular-nums ${cellClass(n, thirdOf(p))}`}
                  >
                    {n || "·"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
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
            <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-micro text-ink-mute">
              Opponent
            </th>
            <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-micro text-ink-mute">
              Played
            </th>
            <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-micro text-brand-700">
              W
            </th>
            <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-micro text-warn">
              D
            </th>
            <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-micro text-danger">
              L
            </th>
            <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-micro text-ink-mute">
              For
            </th>
            <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-micro text-ink-mute">
              Against
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline bg-surface">
          {records.map((r) => (
            <tr key={r.opponent}>
              <td className="truncate px-2 py-2 font-medium text-ink">
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
