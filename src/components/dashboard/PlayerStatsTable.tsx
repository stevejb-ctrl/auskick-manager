"use client";

import { useState } from "react";
import type { PlayerSeasonStats } from "@/lib/dashboard/types";
import { EmptyState } from "./EmptyState";

const MS_PER_MIN = 60_000;
const fmt = (ms: number) => Math.round(ms / MS_PER_MIN);

type SortKey =
  | "totalMs"
  | "avgMsPerGame"
  | "teamGameTimePct"
  | "gamesPlayed"
  | "goals";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "totalMs", label: "Total minutes" },
  { value: "avgMsPerGame", label: "Avg min / game" },
  { value: "teamGameTimePct", label: "% of team time" },
  { value: "gamesPlayed", label: "Games played" },
  { value: "goals", label: "Goals" },
];

interface Props {
  stats: PlayerSeasonStats[];
  hasData: boolean;
}

export function PlayerStatsTable({ stats, hasData }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("totalMs");

  if (!hasData || stats.length === 0) {
    return (
      <EmptyState
        title="No data yet — will populate once games are played"
        description="Player statistics appear here after the first game event log is recorded."
      />
    );
  }

  const sorted = [...stats].sort(
    (a, b) => (b[sortKey] as number) - (a[sortKey] as number)
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <label htmlFor="player-sort" className="text-ink-dim">
          Sort by
        </label>
        <select
          id="player-sort"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-md border border-hairline bg-surface px-2 py-1 font-medium text-ink focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {sorted.map((p) => {
          const backMin = fmt(p.zoneMs.back + p.zoneMs.hback);
          const midMin = fmt(p.zoneMs.mid);
          const fwdMin = fmt(p.zoneMs.fwd + p.zoneMs.hfwd);
          return (
            <div
              key={p.playerId}
              className="rounded-lg border border-hairline bg-surface p-3 shadow-card"
            >
              {/* Header: jersey + name + headline total */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] font-semibold uppercase tracking-micro text-ink-mute">
                    #{p.jerseyNumber}
                  </span>
                  <p className="truncate font-semibold text-ink">
                    {p.playerName}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xl font-bold leading-none tabular-nums text-brand-600">
                    {fmt(p.totalMs)}
                  </p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-micro text-ink-mute">
                    total min
                  </p>
                </div>
              </div>

              {/* Stats grid */}
              <div className="mt-3 grid grid-cols-4 gap-2">
                <Metric label="GP" value={p.gamesPlayed} />
                <Metric label="Avg/G" value={`${fmt(p.avgMsPerGame)}m`} />
                <Metric label="% Time" value={`${p.teamGameTimePct}%`} />
                <Metric
                  label="Goals"
                  value={p.goals}
                  accent={p.goals > 0 ? "brand" : undefined}
                />
              </div>

              {/* Zone breakdown */}
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium">
                <ZonePill abbr="B" min={backMin} tone="b" />
                <ZonePill abbr="M" min={midMin} tone="c" />
                <ZonePill abbr="F" min={fwdMin} tone="f" />
              </div>

              {/* Footer: behinds + subs, only if non-zero */}
              {(p.behinds > 0 || p.subsIn > 0 || p.subsOut > 0) && (
                <p className="mt-2 text-[11px] text-ink-mute">
                  {p.behinds > 0 && <>Behinds {p.behinds} · </>}
                  Subs {p.subsIn}/{p.subsOut}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "brand";
}) {
  return (
    <div>
      <p
        className={`text-sm font-semibold tabular-nums ${
          accent === "brand" ? "text-brand-600" : "text-ink"
        }`}
      >
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-micro text-ink-mute">
        {label}
      </p>
    </div>
  );
}

function ZonePill({
  abbr,
  min,
  tone,
}: {
  abbr: string;
  min: number;
  tone: "b" | "c" | "f";
}) {
  const bg =
    tone === "b"
      ? "bg-zone-b/10 text-zone-b"
      : tone === "c"
      ? "bg-zone-c/10 text-zone-c"
      : "bg-zone-f/10 text-zone-f";
  return (
    <span
      className={`flex-1 rounded px-1.5 py-0.5 text-center tabular-nums ${bg}`}
    >
      {abbr} {min}m
    </span>
  );
}
