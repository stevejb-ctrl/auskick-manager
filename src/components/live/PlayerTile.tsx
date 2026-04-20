"use client";

import { useRef } from "react";
import type { Player, Zone } from "@/lib/types";
import type { ZoneMinutes } from "@/lib/fairness";

export type SwapRole = { role: "off" | "on"; pair: number; zone?: Zone };

const ZONE_LABEL: Record<string, string> = {
  back: "Back", hback: "HBack", mid: "Mid", hfwd: "HFwd", fwd: "Fwd",
};

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
  /** "field" = never subbed; "zone" = can sub but only to their locked zone */
  lockMode?: "field" | "zone" | null;
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
  lockMode,
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

  // Field Sunday palette: ochre for "coming off / next", field green for "going on".
  const baseBg = selected
    ? "border-brand-600 bg-brand-50 ring-2 ring-brand-500 shadow-pop"
    : isOff
      ? "border-warn bg-warn-soft shadow-card"
      : isOn
        ? "border-brand-500 bg-brand-50 shadow-card"
        : injured
          ? "border-danger/40 bg-surface"
          : lockMode === "field"
            ? "border-brand-300 bg-surface"
            : lockMode === "zone"
              ? "border-warn/50 bg-surface"
              : "border-hairline bg-surface hover:border-ink-mute";

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={onLongPress ? handlePointerDown : undefined}
      onPointerUp={onLongPress ? cancelLongPress : undefined}
      onPointerCancel={onLongPress ? cancelLongPress : undefined}
      disabled={!onClick && !onLongPress}
      className={[
        "relative flex w-full items-center justify-center rounded-md border text-center transition-all duration-fast ease-out-quart",
        compact ? "gap-1 px-2 py-1.5" : "flex-col gap-0.5 px-1 py-2",
        baseBg,
        dimmed && !selected ? "opacity-40" : "",
        injured ? "grayscale" : "",
        !onClick && !onLongPress ? "cursor-default" : "",
      ].join(" ")}
    >
      {/* "NEXT" chip — dashed ochre, top-left — signals this player is coming off next swap */}
      {isOff && (
        <span
          className="absolute -left-1 -top-1.5 inline-flex items-center gap-0.5 rounded-xs border border-dashed border-warn bg-warn-soft px-1 font-mono text-[9px] font-bold uppercase leading-none tracking-micro text-warn"
          aria-label={`Coming off next, pair ${swap.pair}`}
        >
          <span>NEXT</span>
          <span className="nums">{swap.pair}</span>
        </span>
      )}
      {/* "ON" chip — solid field green, top-right */}
      {isOn && (
        <span
          className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center gap-0.5 rounded-full bg-brand-600 px-1 font-mono text-[10px] font-bold leading-none text-white shadow-card ring-2 ring-surface"
          aria-label={`Going on, pair ${swap.pair}`}
        >
          <span className="text-[11px] leading-none">↑</span>
          <span className="nums">{swap.pair}</span>
        </span>
      )}
      {injured && (
        <span
          className="absolute left-1 top-1 rounded-xs bg-danger px-1 font-mono text-[9px] font-bold uppercase leading-none tracking-micro text-white"
          aria-label="Injured"
        >
          INJ
        </span>
      )}
      {lockMode && !injured && (
        <span
          className={`absolute left-1 top-1 rounded-xs p-0.5 leading-none text-white ${lockMode === "field" ? "bg-brand-600" : "bg-warn"}`}
          aria-label={lockMode === "field" ? "Field locked" : "Zone locked"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-2.5 w-2.5">
            <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z" clipRule="evenodd" />
          </svg>
        </span>
      )}
      {score && (score.goals > 0 || score.behinds > 0) && (
        <span
          className="nums absolute -left-1 -top-1.5 rounded-full bg-ink px-1.5 font-mono text-[10px] font-bold leading-tight text-warm shadow-card ring-2 ring-surface"
          aria-label={`${score.goals} goals, ${score.behinds} behinds`}
        >
          {score.goals}.{score.behinds}
        </span>
      )}
      <span className="nums inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 font-mono text-xs font-bold text-brand-700">
        {player.jersey_number}
      </span>
      <span
        className={
          compact
            ? "text-sm font-medium text-ink"
            : "truncate text-xs font-medium text-ink"
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
        <span className="nums font-mono text-[10px] font-semibold text-ink-dim">
          {formatMinSec(totalMs)}
        </span>
      )}
      {zoneMs && (() => {
        const total = zoneMs.back + zoneMs.hback + zoneMs.mid + zoneMs.hfwd + zoneMs.fwd;
        if (total <= 0) return null;
        const pct = (v: number) => `${(v / total) * 100}%`;
        return (
          <span
            className="mt-0.5 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-alt"
            aria-label={`Back ${formatMinSec(zoneMs.back)}, HBack ${formatMinSec(zoneMs.hback)}, Mid ${formatMinSec(zoneMs.mid)}, HFwd ${formatMinSec(zoneMs.hfwd)}, Fwd ${formatMinSec(zoneMs.fwd)}`}
          >
            <span style={{ width: pct(zoneMs.back) }} className="bg-zone-b" />
            <span style={{ width: pct(zoneMs.hback) }} className="bg-zone-b/70" />
            <span style={{ width: pct(zoneMs.mid) }} className="bg-zone-c" />
            <span style={{ width: pct(zoneMs.hfwd) }} className="bg-zone-f/70" />
            <span style={{ width: pct(zoneMs.fwd) }} className="bg-zone-f" />
          </span>
        );
      })()}
      {isOff && (
        <span className="mt-0.5 inline-block rounded-xs bg-warn px-1.5 font-mono text-[9px] font-bold uppercase tracking-micro text-white">
          OFF → bench
        </span>
      )}
      {isOn && (
        <span className="mt-0.5 inline-block rounded-xs bg-brand-600 px-1.5 font-mono text-[9px] font-bold uppercase tracking-micro text-white">
          ON → {swap?.zone ? ZONE_LABEL[swap.zone] ?? swap.zone : "field"}
        </span>
      )}
    </button>
  );
}
