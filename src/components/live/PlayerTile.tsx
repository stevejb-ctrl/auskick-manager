"use client";

import { useRef } from "react";
import type { Player, Zone } from "@/lib/types";
import type { ZoneMinutes } from "@/lib/fairness";
import { ZONE_SHORT } from "@/components/live/Field";

export type SwapRole = { role: "off" | "on"; pair: number; zone?: Zone };

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
  /** @deprecated kept for compatibility — the new design replaces the bar with a score chip. */
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

/**
 * Player tile — new Field Sunday layout:
 *
 *   [NEXT]                       [+]
 *         FWD              ← small zone chip, brand colour
 *        Indy              ← bold name
 *      #8 • 6:00           ← jersey + elapsed
 *       [2G · 1B]          ← dark score chip (only if scored)
 *
 * NEXT badge (dashed ochre, top-left) appears when the player is in the
 * "off" role of an engine-suggested swap. The + pill (top-right) is purely
 * a visual affordance hinting that the tile is tappable.
 */
export function PlayerTile({
  player,
  currentZone,
  onClick,
  onLongPress,
  selected,
  dimmed,
  swap,
  totalMs,
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

  // Zone-accent colour for the tiny zone chip at the top of the tile.
  const zoneAccent = currentZone
    ? currentZone === "fwd" || currentZone === "hfwd"
      ? "text-zone-f"
      : currentZone === "mid"
        ? "text-zone-c"
        : "text-zone-b"
    : "text-ink-dim";

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

  // Display name: "First L" (e.g. "Indy M")
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
        "relative flex w-full flex-col items-center justify-center gap-0.5 rounded-md border px-1.5 py-2 text-center transition-all duration-fast ease-out-quart",
        baseBg,
        dimmed && !selected ? "opacity-40" : "",
        injured ? "grayscale" : "",
        !onClick && !onLongPress ? "cursor-default" : "",
      ].join(" ")}
    >
      {/* NEXT chip — dashed ochre, top-left — means "coming off next swap" */}
      {isOff && (
        <span
          className="absolute -left-1 -top-1.5 inline-flex items-center rounded-xs border border-dashed border-warn bg-warn-soft px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase leading-none tracking-micro text-warn"
          aria-label={`Coming off next, pair ${swap.pair}`}
        >
          NEXT
        </span>
      )}
      {/* ON chip — solid field green, top-left when not OFF */}
      {isOn && (
        <span
          className="absolute -left-1 -top-1.5 inline-flex items-center gap-0.5 rounded-full bg-brand-600 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase leading-none text-white shadow-card"
          aria-label={`Going on, pair ${swap.pair}`}
        >
          ON
        </span>
      )}

      {/* Top-right + chip — decorative affordance that the tile is interactive */}
      {onClick && !injured && (
        <span
          className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-sm font-bold leading-none text-warm shadow-card ring-2 ring-surface"
          aria-hidden
        >
          +
        </span>
      )}

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

      {/* Name — biggest text in the tile */}
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

      {/* Score chip — only shown if the player has scored */}
      {score && (score.goals > 0 || score.behinds > 0) && (
        <span
          className="nums mt-0.5 inline-flex items-center gap-1 rounded-xs bg-ink px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-micro text-warm"
          aria-label={`${score.goals} goals, ${score.behinds} behinds`}
        >
          <span>{score.goals}G</span>
          <span className="text-warm/40">·</span>
          <span>{score.behinds}B</span>
        </span>
      )}
    </button>
  );
}
