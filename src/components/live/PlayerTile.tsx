"use client";

import type { Player } from "@/lib/types";

export type SwapRole = { role: "off" | "on"; pair: number };

interface PlayerTileProps {
  player: Player;
  onClick?: () => void;
  selected?: boolean;
  dimmed?: boolean;
  swap?: SwapRole | null;
  compact?: boolean;
  totalMs?: number;
  zoneMs?: { back: number; mid: number; fwd: number };
  injured?: boolean;
}

function formatMinSec(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function PlayerTile({
  player,
  onClick,
  selected,
  dimmed,
  swap,
  compact,
  totalMs,
  zoneMs,
  injured,
}: PlayerTileProps) {
  const showSwap = swap && !selected && !injured;
  const isOff = showSwap && swap.role === "off";
  const isOn = showSwap && swap.role === "on";

  const ringColor = isOff
    ? "ring-amber-400"
    : isOn
      ? "ring-emerald-400"
      : "ring-brand-400";

  const baseBg = selected
    ? `border-transparent bg-brand-50 ring-2 ${ringColor} shadow-md`
    : isOff
      ? "border-amber-400 bg-amber-50 ring-2 ring-amber-300 shadow-sm"
      : isOn
        ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-300 shadow-sm"
        : injured
          ? "border-rose-300 bg-rose-50"
          : "border-gray-200 bg-white hover:border-gray-300";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={[
        "relative flex w-full items-center justify-center rounded-md border text-center transition-all",
        compact ? "gap-1 px-2 py-1.5" : "flex-col gap-0.5 px-1 py-2",
        baseBg,
        dimmed && !selected ? "opacity-40" : "",
        injured ? "grayscale" : "",
        !onClick ? "cursor-default" : "",
      ].join(" ")}
    >
      {isOff && (
        <span
          className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center gap-0.5 rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-none text-white shadow ring-2 ring-white"
          aria-label={`Coming off, pair ${swap.pair}`}
        >
          <span className="text-[11px] leading-none">↓</span>
          <span className="tabular-nums">{swap.pair}</span>
        </span>
      )}
      {isOn && (
        <span
          className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center gap-0.5 rounded-full bg-emerald-500 px-1 text-[10px] font-bold leading-none text-white shadow ring-2 ring-white"
          aria-label={`Going on, pair ${swap.pair}`}
        >
          <span className="text-[11px] leading-none">↑</span>
          <span className="tabular-nums">{swap.pair}</span>
        </span>
      )}
      {injured && (
        <span
          className="absolute left-1 top-1 rounded-sm bg-rose-500 px-1 text-[9px] font-bold uppercase leading-none text-white"
          aria-label="Injured"
        >
          INJ
        </span>
      )}
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 tabular-nums">
        {player.jersey_number}
      </span>
      <span
        className={
          compact
            ? "text-sm font-medium text-gray-800"
            : "truncate text-xs font-medium text-gray-800"
        }
      >
        {(() => {
          const parts = player.full_name.trim().split(/\s+/);
          const first = parts[0] ?? "";
          const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] : "";
          return lastInitial ? `${first} ${lastInitial}` : first;
        })()}
      </span>
      {totalMs !== undefined && (
        <span className="text-[10px] font-semibold tabular-nums text-gray-500">
          {formatMinSec(totalMs)}
        </span>
      )}
      {zoneMs && (zoneMs.back + zoneMs.mid + zoneMs.fwd > 0) && (() => {
        const total = zoneMs.back + zoneMs.mid + zoneMs.fwd;
        const pct = (v: number) => `${(v / total) * 100}%`;
        return (
          <span
            className="mt-0.5 flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100"
            aria-label={`Back ${formatMinSec(zoneMs.back)}, Mid ${formatMinSec(zoneMs.mid)}, Fwd ${formatMinSec(zoneMs.fwd)}`}
          >
            <span style={{ width: pct(zoneMs.back) }} className="bg-blue-400" />
            <span style={{ width: pct(zoneMs.mid) }} className="bg-yellow-400" />
            <span style={{ width: pct(zoneMs.fwd) }} className="bg-red-400" />
          </span>
        );
      })()}
      {isOff && (
        <span className="mt-0.5 inline-block rounded-sm bg-amber-500 px-1.5 text-[9px] font-bold uppercase tracking-wide text-white">
          OFF → bench
        </span>
      )}
      {isOn && (
        <span className="mt-0.5 inline-block rounded-sm bg-emerald-500 px-1.5 text-[9px] font-bold uppercase tracking-wide text-white">
          ON → field
        </span>
      )}
    </button>
  );
}
