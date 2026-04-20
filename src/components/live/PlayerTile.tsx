"use client";

import { useRef } from "react";
import type { Player } from "@/lib/types";
import type { ZoneMinutes } from "@/lib/fairness";

export type SwapRole = { role: "off" | "on"; pair: number };

interface PlayerTileProps {
  player: Player;
  onClick?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  dimmed?: boolean;
  swap?: SwapRole | null;
  compact?: boolean;
  totalMs?: number;
  zoneMs?: ZoneMinutes;
  injured?: boolean;
  locked?: boolean;
  score?: { goals: number; behinds: number };
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
  onLongPress,
  selected,
  dimmed,
  swap,
  compact,
  totalMs,
  zoneMs,
  injured,
  locked,
  score,
}: PlayerTileProps) {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPressRef = useRef(false);

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (!onLongPress) return;
    didLongPressRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    longPressTimerRef.current = setTimeout(() => {
      didLongPressRef.current = true;
      longPressTimerRef.current = null;
      onLongPress();
    }, 500);
  }

  function cancelLongPress() {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function handleClick() {
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return;
    }
    onClick?.();
  }

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
          : locked
            ? "border-indigo-300 bg-indigo-50"
            : "border-gray-200 bg-white hover:border-gray-300";

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={onLongPress ? handlePointerDown : undefined}
      onPointerUp={onLongPress ? cancelLongPress : undefined}
      onPointerCancel={onLongPress ? cancelLongPress : undefined}
      disabled={!onClick && !onLongPress}
      className={[
        "relative flex w-full items-center justify-center rounded-md border text-center transition-all",
        compact ? "gap-1 px-2 py-1.5" : "flex-col gap-0.5 px-1 py-2",
        baseBg,
        dimmed && !selected ? "opacity-40" : "",
        injured ? "grayscale" : "",
        !onClick && !onLongPress ? "cursor-default" : "",
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
      {locked && !injured && (
        <span
          className="absolute left-1 top-1 rounded-sm bg-indigo-500 p-0.5 leading-none text-white"
          aria-label="Locked"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-2.5 w-2.5">
            <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z" clipRule="evenodd" />
          </svg>
        </span>
      )}
      {score && (score.goals > 0 || score.behinds > 0) && (
        <span
          className="absolute -left-1 -top-1.5 rounded-full bg-gray-900 px-1.5 text-[10px] font-bold leading-tight text-white shadow ring-2 ring-white"
          aria-label={`${score.goals} goals, ${score.behinds} behinds`}
        >
          {score.goals}.{score.behinds}
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
      {zoneMs && (() => {
        const total = zoneMs.back + zoneMs.hback + zoneMs.mid + zoneMs.hfwd + zoneMs.fwd;
        if (total <= 0) return null;
        const pct = (v: number) => `${(v / total) * 100}%`;
        return (
          <span
            className="mt-0.5 flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100"
            aria-label={`Back ${formatMinSec(zoneMs.back)}, HBack ${formatMinSec(zoneMs.hback)}, Mid ${formatMinSec(zoneMs.mid)}, HFwd ${formatMinSec(zoneMs.hfwd)}, Fwd ${formatMinSec(zoneMs.fwd)}`}
          >
            <span style={{ width: pct(zoneMs.back) }} className="bg-blue-400" />
            <span style={{ width: pct(zoneMs.hback) }} className="bg-sky-400" />
            <span style={{ width: pct(zoneMs.mid) }} className="bg-yellow-400" />
            <span style={{ width: pct(zoneMs.hfwd) }} className="bg-orange-400" />
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
