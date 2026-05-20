"use client";

import { memo, useRef, useState } from "react";
import type { Player, Zone } from "@/lib/types";
import type { ZoneMinutes } from "@/lib/fairness";
import { ZONE_SHORT } from "@/components/live/Field";
import { type ChipKey, type ChipMode } from "@/lib/chips";
import { ChipIndicator } from "@/components/squad/ChipIndicator";
import { hapticTap } from "@/lib/haptics";
import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { dispatchLongPressEvent } from "@/components/live/LongPressHint";

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
  /** Currently lent to the opposition. Rendered like an unavailable player. */
  loaned?: boolean;
  /** "field" = never subbed; "zone" = can sub but only to their locked zone */
  lockMode?: "field" | "zone" | null;
  score?: { goals: number; behinds: number };
  /**
   * Per-chip modes from the team row (split / group / forward /
   * centre / back). When the player's chip mode is a zone mode,
   * the inline 6px chip dot uses the zone-colour palette (zone-f
   * / zone-c / zone-b) so it matches the field tile and chip
   * indicators elsewhere. Optional — legacy callers without
   * mode-awareness get the A/B/C brand palette via chipPalette's
   * fallback. Steve 2026-05-20.
   */
  chipModes?: Partial<Record<ChipKey, ChipMode>>;
}

function formatMinSec(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function PlayerTileImpl({
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
  loaned,
  lockMode,
  score,
  chipModes,
}: PlayerTileProps) {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // P1-9 in MICRO-INTERACTIONS-PLAN.md: at 300ms into a long-press
  // (60% of the way to the 500ms fire), the tile starts a soft
  // brand ring so the user knows the press is registering. Without
  // this, the 500ms total feels unresponsive — Stagehand testers
  // released too early and never discovered the long-press flow.
  const armingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [longPressArming, setLongPressArming] = useState(false);
  const didLongPressRef = useRef(false);

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (!onLongPress) return;
    didLongPressRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    // 300ms pre-cue: shows the user "I'm registering this press".
    armingTimerRef.current = setTimeout(() => {
      armingTimerRef.current = null;
      setLongPressArming(true);
    }, 300);
    longPressTimerRef.current = setTimeout(() => {
      didLongPressRef.current = true;
      longPressTimerRef.current = null;
      setLongPressArming(false);
      // Light haptic tap so the user gets a tactile "picked up"
      // confirmation when the long-press fires. P1-10 in
      // MICRO-INTERACTIONS-PLAN.md. Fires before the onLongPress
      // callback so the buzz lands BEFORE any UI change (modal
      // open, sheet rise) that the callback might trigger.
      void hapticTap("light");
      // Tells LongPressHint (P1.5-3) the user discovered the
      // gesture, so the hint chip self-dismisses + sets its
      // localStorage flag. Window CustomEvent so the hint
      // doesn't need any prop wiring.
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

  const showSwap = swap && !selected && !injured && !loaned;
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
          : loaned
            ? "border-warn/40 bg-surface"
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
    // P1-7 in MICRO-INTERACTIONS-PLAN.md: when this tile is part of
    // a pending swap pair (set by QuarterEndModal's plan), the
    // SirenPulseHalo fires a one-shot brand halo each time the
    // `pair` number changes. Tells the coach "this player is one of
    // the people about to move". `display="block"` so the wrapper
    // doesn't collapse the tile's grid cell width; `rounded-md`
    // matches the tile's corner radius so the halo lines up with
    // the visible edge. triggerKey is null when no swap is set →
    // SirenPulseHalo skips the halo entirely.
    <SirenPulseHalo
      triggerKey={swap?.pair ?? null}
      size="md"
      display="block"
      className="rounded-md"
    >
    <button
      type="button"
      data-testid={`player-tile-${player.id}`}
      onClick={handleClick}
      onPointerDown={onLongPress ? handlePointerDown : undefined}
      onPointerUp={onLongPress ? cancelLongPress : undefined}
      onPointerCancel={onLongPress ? cancelLongPress : undefined}
      disabled={!onClick && !onLongPress}
      className={[
        "relative flex w-full flex-col items-stretch rounded-md border text-center transition-all duration-fast ease-out-quart",
        baseBg,
        dimmed && !selected ? "opacity-40" : "",
        injured || loaned ? "grayscale" : "",
        !onClick && !onLongPress ? "cursor-default" : "",
        // Pointer-down shrinks the tile to 97% so the tap registers
        // visually before the click resolves. `transition-all` above
        // animates the spring-back to 100% on release. Skipped when
        // the tile is non-interactive (no onClick/onLongPress) so
        // disabled tiles don't tease a tap response.
        onClick || onLongPress ? "motion-safe:active:scale-[0.97]" : "",
        // Long-press pre-cue ring. Fires at 300ms of an in-flight
        // long-press to confirm the press is registering — without
        // it the 500ms total feels unresponsive. Gated on `!selected`
        // so it doesn't fight with the brand-500 ring the selected
        // state already shows.
        longPressArming && !selected
          ? "ring-2 ring-brand-300 ring-offset-1"
          : "",
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

      {/* Loan badge — lent to opposition */}
      {loaned && !injured && (
        <span
          className="absolute left-1 top-1 rounded-xs bg-warn px-1 font-mono text-[9px] font-bold uppercase leading-none tracking-micro text-white"
          aria-label="Lent to opposition"
        >
          LENT
        </span>
      )}

      {/* Lock badge */}
      {lockMode && !injured && !loaned && (
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

      {/* Name (with leading chip indicator if the player has a cohort chip).
          Uses the shared ChipIndicator at md size so zone-mode chips
          (forward / centre / back) surface their F / C / B letter
          inside the dot — same affordance the lineup picker and
          squad rows already use. Steve 2026-05-20. */}
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

      {/* Jersey + time */}
      {totalMs !== undefined ? (
        <span className="nums font-mono text-[10px] font-semibold text-ink-dim">
          {player.jersey_number != null ? `#${player.jersey_number} · ` : ""}{formatMinSec(totalMs)}
        </span>
      ) : player.jersey_number != null ? (
        <span className="nums font-mono text-[10px] font-semibold text-ink-dim">
          #{player.jersey_number}
        </span>
      ) : null}

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
    </SirenPulseHalo>
  );
}

// ─── React.memo wrapper (perf phase 7b) ──────────────────────
// LiveGame re-renders every 500ms while the clock runs. Without
// memoization, every PlayerTile re-renders alongside — for 15+
// tiles that's a chunk of main-thread work per tick, much of it
// wasted because the visible state changes only once per second
// (whole-minute:second format).
//
// `areEqual` quantizes time-related props to whole-second
// resolution so a 500ms tick that doesn't cross a second boundary
// is a cache hit. Other props (player, currentZone, swap, etc.)
// fall back to strict equality.
//
// Limitation: function-prop identity (onClick, onLongPress) is
// also compared strictly. LiveGame currently re-creates these on
// every render, so this memo is a no-op for LiveGame-hosted
// tiles until those handlers are stabilized via useCallback or a
// ref-dispatcher pattern. Memo still wins for PlayerTile callers
// in QuarterBreak / NetballLineupPicker / etc. that don't re-mint
// handlers per tick.

const SECOND_MS = 1000;
function quantize(ms: number | undefined): number {
  return ms === undefined ? -1 : Math.floor(ms / SECOND_MS);
}

function areEqual(a: PlayerTileProps, b: PlayerTileProps): boolean {
  // Stable identity props — strict equality is what we want.
  if (a.player !== b.player) return false;
  if (a.currentZone !== b.currentZone) return false;
  if (a.onClick !== b.onClick) return false;
  if (a.onLongPress !== b.onLongPress) return false;
  if (a.selected !== b.selected) return false;
  if (a.dimmed !== b.dimmed) return false;
  if (a.injured !== b.injured) return false;
  if (a.loaned !== b.loaned) return false;
  if (a.lockMode !== b.lockMode) return false;
  if (a.compact !== b.compact) return false;

  // swap is an object that LiveGame creates per render. Compare
  // shallowly so a deep-equal swap doesn't trigger re-render.
  if (a.swap !== b.swap) {
    if (!a.swap || !b.swap) return false;
    if (
      a.swap.role !== b.swap.role ||
      a.swap.pair !== b.swap.pair ||
      a.swap.zone !== b.swap.zone ||
      a.swap.totalPairs !== b.swap.totalPairs
    ) {
      return false;
    }
  }

  // Time props — quantize to whole seconds. A 500ms tick that
  // doesn't cross a second boundary is a cache hit.
  if (quantize(a.totalMs) !== quantize(b.totalMs)) return false;

  // zoneMs is keyed by Zone; compare each field at whole-second
  // resolution. If one is undefined and the other isn't, no hit.
  if (a.zoneMs !== b.zoneMs) {
    if (!a.zoneMs || !b.zoneMs) return false;
    if (
      quantize(a.zoneMs.back) !== quantize(b.zoneMs.back) ||
      quantize(a.zoneMs.hback) !== quantize(b.zoneMs.hback) ||
      quantize(a.zoneMs.mid) !== quantize(b.zoneMs.mid) ||
      quantize(a.zoneMs.hfwd) !== quantize(b.zoneMs.hfwd) ||
      quantize(a.zoneMs.fwd) !== quantize(b.zoneMs.fwd)
    ) {
      return false;
    }
  }

  // Score is goals + behinds — discrete integers that only
  // change on an actual score event.
  if (a.score !== b.score) {
    if (!a.score || !b.score) return false;
    if (a.score.goals !== b.score.goals || a.score.behinds !== b.score.behinds) {
      return false;
    }
  }

  return true;
}

export const PlayerTile = memo(PlayerTileImpl, areEqual);
