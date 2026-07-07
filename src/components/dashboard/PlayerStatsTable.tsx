"use client";

import { useState } from "react";
import type { PlayerSeasonStats } from "@/lib/dashboard/types";
import { EmptyState } from "./EmptyState";
import { CopyableTextBlock } from "@/components/ui/CopyableTextBlock";
import { buildChatText } from "@/lib/dashboard/playerStatsChat";

const MS_PER_MIN = 60_000;
const fmt = (ms: number) => Math.round(ms / MS_PER_MIN);

type SortKey =
  | "totalMs"
  | "avgMsPerGame"
  | "teamGameTimePct"
  | "gamesPlayed"
  | "goals"
  | "loanMs";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "totalMs", label: "Total minutes" },
  { value: "avgMsPerGame", label: "Avg min / game" },
  { value: "teamGameTimePct", label: "% of available time" },
  { value: "gamesPlayed", label: "Games played" },
  { value: "goals", label: "Goals" },
  { value: "loanMs", label: "Loaned minutes" },
];

interface Props {
  stats: PlayerSeasonStats[];
  hasData: boolean;
}

export function PlayerStatsTable({ stats, hasData }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("totalMs");
  const [showChat, setShowChat] = useState(false);

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
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
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
        <button
          type="button"
          onClick={() => setShowChat((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-2.5 py-1 font-medium text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
          aria-expanded={showChat}
        >
          {showChat ? "Hide chat text" : "Text for group chat"}
        </button>
      </div>

      {showChat && (
        <div className="rounded-lg border border-hairline bg-surface p-3">
          <CopyableTextBlock title="Player stats" text={buildChatText(sorted)} />
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {sorted.map((p) => {
          // Zone split as a % of the player's own on-field time (sums to
          // ~100%) — "where do they play", independent of how much they
          // bench. Mirrors the netball third breakdown. Steve 2026-07-07.
          const onFieldMs =
            p.zoneMs.back +
            p.zoneMs.hback +
            p.zoneMs.mid +
            p.zoneMs.hfwd +
            p.zoneMs.fwd;
          const zonePct = (ms: number) =>
            onFieldMs > 0 ? Math.round((ms / onFieldMs) * 100) : 0;
          const backPct = zonePct(p.zoneMs.back + p.zoneMs.hback);
          const midPct = zonePct(p.zoneMs.mid);
          const fwdPct = zonePct(p.zoneMs.fwd + p.zoneMs.hfwd);
          return (
            <div
              key={p.playerId}
              className="rounded-lg border border-hairline bg-surface p-3 shadow-card"
            >
              {/* Header: jersey + name + headline total */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {p.jerseyNumber != null && (
                    <span className="text-[10px] font-semibold uppercase tracking-micro text-ink-mute">
                      #{p.jerseyNumber}
                    </span>
                  )}
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

              {/* Zone breakdown — Forward → Centre → Back to match the
                  in-game order + wording. */}
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium">
                <ZonePill abbr="Fwd" pct={fwdPct} tone="f" />
                <ZonePill abbr="Cen" pct={midPct} tone="c" />
                <ZonePill abbr="Back" pct={backPct} tone="b" />
              </div>

              {/* Footer: behinds + loaned, only if non-zero */}
              {(p.behinds > 0 || p.loanMs > 0) && (
                <p className="mt-2 text-[11px] text-ink-mute">
                  {p.behinds > 0 && <>Behinds {p.behinds}</>}
                  {p.behinds > 0 && p.loanMs > 0 && <> · </>}
                  {p.loanMs > 0 && (
                    <span className="text-warn">Lent {fmt(p.loanMs)}m</span>
                  )}
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
  pct,
  tone,
}: {
  abbr: string;
  pct: number;
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
      {abbr} {pct}%
    </span>
  );
}
