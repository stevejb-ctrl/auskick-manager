"use client";

import { useState } from "react";
import type { PlayerSeasonStats } from "@/lib/dashboard/types";
import { EmptyState } from "./EmptyState";

const MS_PER_MIN = 60_000;

function fmt(ms: number) {
  return Math.round(ms / MS_PER_MIN);
}

type SortKey = keyof PlayerSeasonStats;

interface Props {
  stats: PlayerSeasonStats[];
  hasData: boolean;
}

export function PlayerStatsTable({ stats, hasData }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("totalMs");
  const [asc, setAsc] = useState(false);

  if (!hasData || stats.length === 0) {
    return (
      <EmptyState
        title="No data yet — will populate once games are played"
        description="Player statistics appear here after the first game event log is recorded."
      />
    );
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setAsc((v) => !v);
    else { setSortKey(key); setAsc(false); }
  }

  const sorted = [...stats].sort((a, b) => {
    const av = a[sortKey] as number;
    const bv = b[sortKey] as number;
    return asc ? av - bv : bv - av;
  });

  function Th({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    return (
      <th
        onClick={() => toggleSort(k)}
        className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide ${
          active ? "text-brand-700" : "text-gray-500 hover:text-gray-700"
        }`}
      >
        {label}
        {active && <span className="ml-1">{asc ? "↑" : "↓"}</span>}
      </th>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">#</th>
            <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Name</th>
            <Th label="GP" k="gamesPlayed" />
            <Th label="Total min" k="totalMs" />
            <Th label="Avg min/G" k="avgMsPerGame" />
            <Th label="Back min" k="totalMs" />
            <Th label="Mid min" k="totalMs" />
            <Th label="Fwd min" k="totalMs" />
            <Th label="Goals" k="goals" />
            <Th label="Bhd" k="behinds" />
            <Th label="Sub in" k="subsIn" />
            <Th label="Sub out" k="subsOut" />
            <Th label="% time" k="teamGameTimePct" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {sorted.map((p) => {
            const backMin = fmt(p.zoneMs.back + p.zoneMs.hback);
            const midMin = fmt(p.zoneMs.mid);
            const fwdMin = fmt(p.zoneMs.fwd + p.zoneMs.hfwd);
            return (
              <tr key={p.playerId} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-400">{p.jerseyNumber}</td>
                <td className="px-3 py-2 font-medium text-gray-900">{p.playerName}</td>
                <td className="px-3 py-2 text-gray-600">{p.gamesPlayed}</td>
                <td className="px-3 py-2 text-gray-600">{fmt(p.totalMs)}</td>
                <td className="px-3 py-2 text-gray-600">{fmt(p.avgMsPerGame)}</td>
                <td className="px-3 py-2 text-gray-600">{backMin}</td>
                <td className="px-3 py-2 text-gray-600">{midMin}</td>
                <td className="px-3 py-2 text-gray-600">{fwdMin}</td>
                <td className="px-3 py-2 font-medium text-gray-900">{p.goals}</td>
                <td className="px-3 py-2 text-gray-600">{p.behinds}</td>
                <td className="px-3 py-2 text-gray-600">{p.subsIn}</td>
                <td className="px-3 py-2 text-gray-600">{p.subsOut}</td>
                <td className="px-3 py-2 text-gray-600">{p.teamGameTimePct}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
