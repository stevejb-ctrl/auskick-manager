"use client";

// ─── LeaguePlayerTile ────────────────────────────────────────
// Player chip for the rugby-league live view. Mirrors AFL's
// `PlayerTile.tsx` shape exactly — vertical card, big bold name,
// `#7 · 8:42` time readout underneath, corner badges for state.
//
// Sport-specific differences vs AFL:
//   * No zone label at the top (RL is positionless at junior age).
//   * No zone-minute stacked bar at the bottom (RL fairness is
//     "unbroken periods", not zone-minute distribution).
//   * Score chip surfaces tries (RL) instead of goals.behinds (AFL).
//   * FR / DH vest badge floats in the same position AFL uses for
//     its lock badge.
//   * Boot badge (`conversion`) and kick badge (`kickedOff`) appear
//     alongside the name when relevant.
//
// Long-press behaviour is identical to AFL — same 300ms arming
// pre-cue and 500ms fire window, same haptic + LongPressHint
// dispatch. The lookups and styling tokens are copy-faithful so
// coaches who switch between AFL and RL teams get muscle-memory UX.

import { memo, useRef, useState } from "react";
import { hapticTap } from "@/lib/haptics";
import { dispatchLongPressEvent } from "@/components/live/LongPressHint";
import { type ChipKey, type ChipMode } from "@/lib/chips";
import { ChipIndicator } from "@/components/squad/ChipIndicator";
import type { Player } from "@/lib/types";
import type { VestType } from "@/lib/sports/rugby_league/vests";
import type { PlayerConversionStatus } from "@/lib/sports/rugby_league/kicks";
import { PlayerVestBadge } from "./PlayerVestBadge";
import { PlayerKickBadge } from "./PlayerKickBadge";

interface LeaguePlayerTileProps {
  player: Player;
  /** Visual state. "field" is primary, "bench" is muted. */
  variant: "field" | "bench";
  /** Whether the tile shows the selected ring. */
  selected?: boolean;
  /** Dim the tile when another tile is selected and this one isn't a swap target. */
  dimmed?: boolean;
  /** Tries credited to this player so far this game. */
  tries?: number;
  /** Total time on field this game (ms). Renders as `#7 · 8:42`. */
  totalMs?: number;
  /** Currently-worn vest (FR / DH). */
  vest?: VestType | null;
  conversion?: PlayerConversionStatus | null;
  /** True when the player has taken at least one kickoff this game. */
  kickedOff?: boolean;
  /** Currently injured — same badge as AFL. */
  injured?: boolean;
  /** Currently loaned to the opposition. */
  loaned?: boolean;
  /**
   * Pending-swap visual state. Mirrors AFL `PlayerTile`'s `swap`
   * prop: when this tile is part of a suggested rotation, render
   * amber for "going off" or brand-blue for "coming on". `pair`
   * identifies which swap in a multi-pair rotation (1..N); when
   * `totalPairs > 1` a small number chip is shown so the coach
   * can match an on-target to its off-target across the screen.
   */
  swap?: {
    role: "off" | "on";
    pair: number;
    totalPairs: number;
  } | null;
  /**
   * Per-chip modes from the team row (split / group / forward /
   * back; centre is AFL-only and inert for RL). When the
   * player's chip mode is a zone mode, the inline chip indicator
   * surfaces the F/B letter inside the dot using the zone-colour
   * palette so it reads as the zone they'll be biased to. Steve
   * 2026-05-20.
   *
   * Optional — legacy callers without mode-awareness get the
   * plain coloured dot via chipPalette's fallback.
   */
  chipModes?: Partial<Record<ChipKey, ChipMode>>;
  onClick?: () => void;
  /** Long-press handler — opens per-player action sheet. */
  onLongPress?: () => void;
  /** Optional disable gate during a pending mutation. */
  disabled?: boolean;
}

function formatMinSec(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function LeaguePlayerTileImpl({
  player,
  variant,
  selected = false,
  dimmed = false,
  tries = 0,
  totalMs,
  vest = null,
  conversion = null,
  kickedOff = false,
  injured = false,
  loaned = false,
  swap = null,
  chipModes,
  onClick,
  onLongPress,
  disabled = false,
}: LeaguePlayerTileProps) {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [longPressArming, setLongPressArming] = useState(false);
  const didLongPressRef = useRef(false);

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (!onLongPress) return;
    didLongPressRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    armingTimerRef.current = setTimeout(() => {
      armingTimerRef.current = null;
      setLongPressArming(true);
    }, 300);
    longPressTimerRef.current = setTimeout(() => {
      didLongPressRef.current = true;
      longPressTimerRef.current = null;
      setLongPressArming(false);
      void hapticTap("light");
      dispatchLongPressEvent();
      onLongPress();
    }, 500);
  }

  function cancelLongPress() {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (armingTimerRef.current !== null) {
      clearTimeout(armingTimerRef.current);
      armingTimerRef.current = null;
    }
    setLongPressArming(false);
  }

  function handleClick() {
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return;
    }
    onClick?.();
  }

  // Background — mirrors AFL PlayerTile `baseBg`. Selected wins,
  // then swap pending (off = amber, on = brand-blue) so the coach
  // can spot the next rotation at a glance, then injury / loan
  // dim, then variant-specific defaults.
  const showSwap = swap && !selected && !injured && !loaned;
  const isOff = showSwap && swap.role === "off";
  const isOn = showSwap && swap.role === "on";
  const baseBg = selected
    ? "border-brand-600 bg-brand-50 ring-2 ring-brand-500 shadow-pop"
    : isOff
      ? "border-warn bg-warn-soft shadow-card"
      : isOn
        ? "border-brand-500 bg-brand-50 shadow-card"
        : injured
          ? "border-danger/40 bg-surface"
          : loaned
            ? "border-warn/40 bg-surface"
            : variant === "field"
              ? "border-hairline bg-surface hover:border-ink-mute"
              : "border-hairline bg-surface-alt hover:border-ink-mute";
  const showPairNumber = showSwap && swap.totalPairs > 1;

  const parts = player.full_name.trim().split(/\s+/);
  const firstName = parts[0] ?? "";
  const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] : "";

  return (
    <button
      type="button"
      data-testid={`league-player-tile-${player.id}`}
      onClick={handleClick}
      onPointerDown={onLongPress ? handlePointerDown : undefined}
      onPointerUp={onLongPress ? cancelLongPress : undefined}
      onPointerCancel={onLongPress ? cancelLongPress : undefined}
      onPointerLeave={onLongPress ? cancelLongPress : undefined}
      disabled={disabled || (!onClick && !onLongPress)}
      aria-pressed={selected}
      className={[
        "relative flex w-full flex-col items-stretch rounded-md border text-center transition-all duration-fast ease-out-quart",
        baseBg,
        dimmed && !selected ? "opacity-40" : "",
        injured || loaned ? "grayscale" : "",
        !onClick && !onLongPress ? "cursor-default" : "",
        onClick || onLongPress ? "motion-safe:active:scale-[0.97]" : "",
        longPressArming && !selected
          ? "ring-2 ring-brand-300 ring-offset-1"
          : "",
      ].join(" ")}
    >
      {/* Swap badge — floats top-left when this tile is part of a
          suggested rotation. Off-target shows "↓" / "1↓" (going off),
          on-target shows "↑" / "1↑" (coming on). The pair number
          only appears when there's more than one swap pending so the
          coach can match each off-target to its on-target. */}
      {showSwap && (
        <span
          className={`nums absolute -left-1 -top-1.5 z-10 inline-flex items-center gap-0.5 rounded-xs px-1 py-0.5 font-mono text-[9px] font-bold uppercase leading-none tracking-micro shadow-card ${
            isOff ? "bg-warn text-white" : "bg-brand-500 text-white"
          }`}
          aria-label={
            isOff
              ? `Suggested sub off${showPairNumber ? ` (pair ${swap.pair} of ${swap.totalPairs})` : ""}`
              : `Suggested sub on${showPairNumber ? ` (pair ${swap.pair} of ${swap.totalPairs})` : ""}`
          }
        >
          {showPairNumber ? swap.pair : ""}
          {isOff ? "↓" : "↑"}
        </span>
      )}

      {/* Tries chip — floats above top-right corner. Mirrors AFL's
          score chip placement so the visual hierarchy reads the same
          across sports. */}
      {tries > 0 && (
        <span
          className="nums absolute -right-1 -top-1.5 z-10 inline-flex items-center gap-0.5 rounded-xs bg-brand-600 px-1 py-0.5 font-mono text-[9px] font-bold uppercase leading-none tracking-micro text-white shadow-card"
          aria-label={`${tries} ${tries === 1 ? "try" : "tries"}`}
        >
          {tries}T
        </span>
      )}

      <div className="flex flex-1 flex-col items-center justify-center gap-0.5 px-1.5 py-1.5">
        {/* State badges — vest > injury > loan. Inlined above the
            name (previously absolute top-left, which overlapped the
            centered name on narrow tiles). Only one badge shows at
            a time, in priority order. */}
        {(vest || injured || loaned) && (
          <span className="inline-flex h-3.5 items-center">
            {injured ? (
              <span
                className="rounded-xs bg-danger px-1 font-mono text-[9px] font-bold uppercase leading-none tracking-micro text-white"
                aria-label="Injured"
              >
                INJ
              </span>
            ) : loaned ? (
              <span
                className="rounded-xs bg-warn px-1 font-mono text-[9px] font-bold uppercase leading-none tracking-micro text-white"
                aria-label="Lent to opposition"
              >
                LENT
              </span>
            ) : vest ? (
              <PlayerVestBadge vest={vest} dimmed={variant === "bench"} />
            ) : null}
          </span>
        )}

        {/* Name — big and bold, truncated. Mirrors AFL's middle row.
            Leading chip indicator when the player has a cohort tag —
            uses the shared ChipIndicator so zone-mode chips (forward /
            back) surface their F / B letter inside the dot, matching
            the affordance AFL uses for F / C / B. For non-zone modes
            (split / group / undefined) the indicator renders as a
            plain coloured dot — same as the legacy look. Steve
            2026-05-20. */}
        <span className="inline-flex items-center gap-1 truncate text-sm font-bold leading-tight text-ink">
          {player.chip && (
            <ChipIndicator
              chipKey={player.chip as ChipKey}
              mode={chipModes?.[player.chip as ChipKey]}
              size="md"
            />
          )}
          <span className="truncate">
            {lastInitial ? `${firstName} ${lastInitial}` : firstName}
          </span>
        </span>

        {/* Bottom row — kick badge + jersey · minutes, INLINE.
            Earlier draft floated the kick badge bottom-left
            absolute, which collided with the time readout when a
            player had both a conversion + a kickoff (Bryson here).
            Inlining keeps the chrome on one row at the cost of a
            slightly compressed jersey number. */}
        <span className="flex w-full items-center justify-center gap-1 text-[10px]">
          {(conversion || kickedOff) && (
            <PlayerKickBadge
              conversion={conversion}
              kickedOff={kickedOff}
              dimmed={variant === "bench"}
            />
          )}
          {totalMs !== undefined ? (
            <span className="nums font-mono font-semibold text-ink-dim">
              {player.jersey_number != null
                ? `#${player.jersey_number} · `
                : ""}
              {formatMinSec(totalMs)}
            </span>
          ) : player.jersey_number != null ? (
            <span className="nums font-mono font-semibold text-ink-dim">
              #{player.jersey_number}
            </span>
          ) : null}
        </span>
      </div>
    </button>
  );
}

// ─── Memo wrapper ────────────────────────────────────────────
// LeagueLiveGame re-renders every clock tick (1s cadence). Memo
// keeps the tiles cheap by quantizing time-related props to whole-
// second resolution so a tick that doesn't cross a second is a
// cache hit. Mirrors AFL `PlayerTile`'s `areEqual` pattern.

const SECOND_MS = 1000;
function quantize(ms: number | undefined): number {
  return ms === undefined ? -1 : Math.floor(ms / SECOND_MS);
}

function areEqual(a: LeaguePlayerTileProps, b: LeaguePlayerTileProps): boolean {
  if (a.player !== b.player) return false;
  if (a.variant !== b.variant) return false;
  if (a.selected !== b.selected) return false;
  if (a.dimmed !== b.dimmed) return false;
  if (a.tries !== b.tries) return false;
  if (a.vest !== b.vest) return false;
  if (a.kickedOff !== b.kickedOff) return false;
  if (a.injured !== b.injured) return false;
  if (a.loaned !== b.loaned) return false;
  // `swap` is an object — shallow compare the fields. Without this
  // the memo would never invalidate when the next-sub suggestion
  // moves on or off this tile.
  if (a.swap !== b.swap) {
    if (!a.swap || !b.swap) return false;
    if (
      a.swap.role !== b.swap.role
      || a.swap.pair !== b.swap.pair
      || a.swap.totalPairs !== b.swap.totalPairs
    ) {
      return false;
    }
  }
  if (a.onClick !== b.onClick) return false;
  if (a.onLongPress !== b.onLongPress) return false;
  if (a.disabled !== b.disabled) return false;
  // chipModes is a small record — compare the three keys directly so a
  // settings change (split → forward) invalidates the cached tile and
  // the F/B letter overlay updates without a full remount.
  if (a.chipModes !== b.chipModes) {
    if (
      a.chipModes?.a !== b.chipModes?.a
      || a.chipModes?.b !== b.chipModes?.b
      || a.chipModes?.c !== b.chipModes?.c
    ) {
      return false;
    }
  }
  if (quantize(a.totalMs) !== quantize(b.totalMs)) return false;
  // conversion is an object — shallow compare its fields.
  if (a.conversion !== b.conversion) {
    if (!a.conversion || !b.conversion) return false;
    if (
      a.conversion.attemptsInCycle !== b.conversion.attemptsInCycle
      || a.conversion.madeInCycle !== b.conversion.madeInCycle
      || a.conversion.hasForceInCycle !== b.conversion.hasForceInCycle
    ) {
      return false;
    }
  }
  return true;
}

export const LeaguePlayerTile = memo(LeaguePlayerTileImpl, areEqual);
