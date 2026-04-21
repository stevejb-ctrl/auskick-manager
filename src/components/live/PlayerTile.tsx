"use client";

import { useRef } from "react";
import type { Player, Zone } from "@/lib/types";
import type { ZoneMinutes } from "@/lib/fairness";
import { ZONE_SHORT } from "@/components/live/Field";

export type SwapRole = {
  role: "off" | "on";
  pair: number;
  zone?: Zone;
  /** Total number of planned swaps this cycle — used to show/hide pair numbers. */
  totalPairs?: number;
};

interface PlayerTileProps {
  player: Player;
  /** The zone the player is currently in — displayed as "FWD" / "CEN" / "BCK" at the top of the tile. */
  currentZone?: Zone | null;
  onClick?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  dimmed?: boolean;
  swap?: SwapRole | null;
  /** @deprecated kept for compatibility — ignored by the new layout. */
  compact?: boolean;
  totalMs?: number;
  /** Zone-minute distribution for the current game — shown as a mini stacked bar at the tile bottom. */
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
  currentZone,
  onClick,
  onLongPress,
  selected,
  dimmed,
  swap,
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
  const showPairNumber = (swap?.totalPairs ?? 0) > 1;

  // Zone-accent colour for the zone chip and badges.
  const zoneAccent = currentZone
    ? currentZone === "fwd" || currentZone === "hfwd"
      ? "text-zone-f"
      : currentZone === "mid"
        ? "text-zone-c"
        : "text-zone-b"
    : "text-ink-dim";

  // Accent class for the bench "→ ZONE" / "N → ZONE" chip, derived from target zone.
  const swapZoneAccent =
    swap?.zone === "fwd" || swap?.zone === "hfwd"
      ? "border-zone-f/40 bg-zone-f/15 text-zone-f"
      : swap?.zone === "mid"
        ? "border-zone-c/40 bg-zone-c/15 text-zone-c"
        : "border-zone-b/40 bg-zone-b/15 text-zone-b";

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

  const parts = player.full_name.trim().split(/\s+/);
  const firstName = parts[0] ?? "";
  const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] : "";

  const zoneLabel = currentZone ? ZONE_SHORT[currentZone] : null;

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={onLongPress ? handlePointerDown : undefined}
      onPointerUp={onLongPress ? cancelLongPress : undefined}
      onPointerCancel={onLongPress ? cancelLongPress : undefined}
      disabled={!onClick && !onLongPress}
      className={[
        "relative flex w-full flex-col items-stretch rounded-md border text-center transition-all duration-fast ease-out-quart",
        baseBg,
        dimmed && !selected ? "opacity-40" : "",
        injured ? "grayscale" : "",
        !onClick && !onLongPress ? "cursor-default" : "",
      ].join(" ")}
    >
      {/* Swap header bar — prominent, full-width, top of tile. Shows pair order + target zone. */}
      {isOff && (
        <div
          className="flex items-center justify-center gap-1 rounded-t-[11px] border-b border-warn/40 bg-warn px-1 py-0.5 font-mono text-[11px] font-bold uppercase leading-none tracking-micro text-white"
          aria-label={`Coming off next, pair ${swap.pair}`}
        >
          {showPairNumber && <span className="rounded-xs bg-white/25 px-1 py-0.5 text-[10px]">#{swap.pair}</span>}
          <span>↑ OFF NEXT</span>
        </div>
      )}
      {isOn && swap?.zone && (
        <div
          className={`flex items-center justify-center gap-1 rounded-t-[11px] border-b px-1 py-0.5 font-mono text-[11px] font-bold uppercase leading-none tracking-micro ${swapZoneAccent}`}
          aria-label={`Going on to ${ZONE_SHORT[swap.zone]}, pair ${swap.pair}`}
        >
          {showPairNumber && <span className="rounded-xs bg-black/15 px-1 py-0.5 text-[10px]">#{swap.pair}</span>}
          <span>→ {ZONE_SHORT[swap.zone]}</span>
        </div>
      )}
      {isOn && !swap?.zone && (
        <div
          className="flex items-center justify-center gap-1 rounded-t-[11px] border-b border-brand-700 bg-brand-600 px-1 py-0.5 font-mono text-[11px] font-bold uppercase leading-none tracking-micro text-white"
          aria-label={`Going on, pair ${swap.pair}`}
        >
          {showPairNumber && <span className="rounded-xs bg-white/25 px-1 py-0.5 text-[10px]">#{swap.pair}</span>}
          <span>→ ON</span>
        </div>
      )}

      {/* Score chip — floats above top-right corner so it never eats tile height */}
      {score && (score.goals > 0 || score.behinds > 0) && (
        <span
          className="nums absolute -right-1 -top-1.5 z-10 inline-flex items-center gap-0.5 rounded-xs bg-ink px-1 py-0.5 font-mono text-[9px] font-bold uppercase leading-none tracking-micro text-warm shadow-card"
          aria-label={`${score.goals} goals, ${score.behinds} behinds`}
        >
          <span>{score.goals}.{score.behinds}</span>
        </span>
      )}

      <div className="flex flex-1 flex-col items-center justify-center gap-0.5 px-1.5 py-1.5">

      {/* Injury badge */}
      {injured && (
        <span
          className="absolute left-1 top-1 rounded-xs bg-danger px-1 font-mono text-[9px] font-bold uppercase leading-none tracking-micro text-white"
          aria-label="Injured"
        >
          INJ
        </span>
      )}

      {/* Lock badge */}
      {lockMode && !injured && (
        <span
          className={`absolute left-1 top-1 rounded-xs p-0.5 leading-none text-white ${
            lockMode === "field" ? "bg-brand-600" : "bg-warn"
          }`}
          aria-label={lockMode === "field" ? "Field locked" : "Zone locked"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-2.5 w-2.5"
          >
            <path
              fillRule="evenodd"
              d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      )}

      {/* Zone label */}
      {zoneLabel && (
        <span
          className={`font-mono text-[9px] font-bold uppercase leading-none tracking-micro ${zoneAccent}`}
        >
          {zoneLabel}
        </span>
      )}

      {/* Name */}
      <span className="truncate text-sm font-bold leading-tight text-ink">
        {lastInitial ? `${firstName} ${lastInitial}` : firstName}
      </span>

      {/* Jersey + time */}
      {totalMs !== undefined ? (
        <span className="nums font-mono text-[10px] font-semibold text-ink-dim">
          #{player.jersey_number} · {formatMinSec(totalMs)}
        </span>
      ) : (
        <span className="nums font-mono text-[10px] font-semibold text-ink-dim">
          #{player.jersey_number}
        </span>
      )}

      {/* Zone-minute stacked bar — shows current-game time distribution */}
      {zoneMs && (() => {
        const total = zoneMs.back + zoneMs.hback + zoneMs.mid + zoneMs.hfwd + zoneMs.fwd;
        if (total <= 0) return null;
        const pct = (v: number) => `${(v / total) * 100}%`;
        return (
          <span
            className="mt-0.5 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-alt"
            aria-label={`Back ${formatMinSec(zoneMs.back)}, Mid ${formatMinSec(zoneMs.mid)}, Fwd ${formatMinSec(zoneMs.fwd)}`}
          >
            <span style={{ width: pct(zoneMs.back) }} className="bg-zone-b" />
            <span style={{ width: pct(zoneMs.hback) }} className="bg-zone-b/70" />
            <span style={{ width: pct(zoneMs.mid) }} className="bg-zone-c" />
            <span style={{ width: pct(zoneMs.hfwd) }} className="bg-zone-f/70" />
            <span style={{ width: pct(zoneMs.fwd) }} className="bg-zone-f" />
          </span>
        );
      })()}
      </div>
    </button>
  );
}
