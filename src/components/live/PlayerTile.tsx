"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { Player, Zone } from "@/lib/types";
import type { ZoneMinutes } from "@/lib/fairness";
import { ZONE_SHORT } from "@/components/live/Field";
import { type ChipKey, type ChipMode } from "@/lib/chips";
import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { useLongPress } from "@/lib/live/useLongPress";
import { KeepOnMarker } from "@/components/playbook/KeepOnMarker";

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
  /**
   * Header caption for planning screens — the quarter break says where
   * each player is heading ("STAYS", "BENCH → FWD"). Shown when there's
   * no swap header.
   */
  caption?: TileCaption | null;
  /** Set positions: the named position shown instead of the zone ("CHB"). */
  positionLabel?: string | null;
  /** Season role "Plays every minute" (lineup screens). */
  keepOn?: boolean;
  /**
   * The sub card is in its SUB DUE state: an outgoing tile turns from
   * a 1.5px amber ring into a 2px ring on the warm due tint, so the
   * field says "now" in the same voice as the card.
   */
  swapDue?: boolean;
}

export interface TileCaption {
  text: string;
  /** "move" = changing position this break; "stay" = same spot. */
  tone: "move" | "stay";
}

function formatMinSec(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

// Top-row chips share one shape: 16px tall mono caps.
const CHIP = "inline-flex h-4 shrink-0 items-center rounded-xs px-[5px] font-mono text-[10px] font-bold leading-4";

// In-game re-skin (design session 17 Oct 2026, canvas "Siren in-game
// UI"): three left-aligned rows on the 4px grid — 8 + 16 + 20 + 16 + 8
// = 68px. Row 1 carries the labels (zone, #num) and any status chip
// (OFF n, score, INJ / LENT / lock); row 2 the name, the one thing a
// glance needs; row 3 the zone-time bar and the time. A lift shadow
// replaces the hairline border, which vanished on the green.
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
  caption,
  positionLabel,
  keepOn,
  swapDue = false,
}: PlayerTileProps) {
  // P1-9 / P1-10 in MICRO-INTERACTIONS-PLAN.md: the 300ms arming
  // pre-cue ring + 500ms fire + haptic + hint-dismiss all live in the
  // shared useLongPress hook now (reused verbatim by the quarter-break
  // tiles). `longPressArming` drives the soft brand ring below.
  const {
    handlers: longPressHandlers,
    arming: longPressArming,
    consumedLongPress,
  } = useLongPress({ onLongPress });

  function handleClick() {
    // Suppress the click that trails a fired long-press.
    if (consumedLongPress()) return;
    onClick?.();
  }

  const showSwap = swap && !selected && !injured && !loaned;
  const isOff = showSwap && swap.role === "off";
  const isOn = showSwap && swap.role === "on";
  const showPairNumber = (swap?.totalPairs ?? 0) > 1;
  const hasScore = !!score && (score.goals > 0 || score.behinds > 0);

  // Zone-accent colour for the zone label.
  const zoneAccent = currentZone
    ? currentZone === "fwd" || currentZone === "hfwd"
      ? "text-zone-f"
      : currentZone === "mid"
        ? "text-zone-c"
        : "text-zone-b"
    : "text-ink-dim";

  // Accent class for the bench "→ ZONE" strip, derived from target zone.
  const swapZoneAccent =
    swap?.zone === "fwd" || swap?.zone === "hfwd"
      ? "border-zone-f/40 bg-zone-f/15 text-zone-f"
      : swap?.zone === "mid"
        ? "border-zone-c/40 bg-zone-c/15 text-zone-c"
        : "border-zone-b/40 bg-zone-b/15 text-zone-b";

  // Surface + edge per state. Edges are inset rings (not borders) so
  // every state keeps the same 68px box and the lift shadow.
  const baseBg = selected
    ? "bg-brand-50 ring-2 ring-brand-500 shadow-pop"
    : isOff
      ? swapDue
        ? "bg-due-tint shadow-[inset_0_0_0_2px_#A8590F,0_1px_0_rgba(0,0,0,0.12),0_2px_6px_rgba(15,45,25,0.18)]"
        : "bg-surface shadow-[inset_0_0_0_1.5px_#A8590F,0_1px_0_rgba(0,0,0,0.12),0_2px_6px_rgba(15,45,25,0.18)]"
      : isOn
        ? "bg-brand-50 shadow-lift-field ring-1 ring-inset ring-brand-500"
        : injured
          ? "bg-surface shadow-lift-field ring-1 ring-inset ring-danger/40"
          : loaned
            ? "bg-surface shadow-lift-field ring-1 ring-inset ring-warn/40"
            : lockMode === "field"
              ? "bg-surface shadow-lift-field ring-1 ring-inset ring-brand-300"
              : lockMode === "zone"
                ? "bg-surface shadow-lift-field ring-1 ring-inset ring-warn/50"
                : "bg-surface shadow-lift-field";

  const parts = player.full_name.trim().split(/\s+/);
  const firstName = parts[0] ?? "";
  const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] : "";
  const displayName = lastInitial ? `${firstName} ${lastInitial}` : firstName;

  const zoneLabel = positionLabel ?? (currentZone ? ZONE_SHORT[currentZone] : null);

  // Swap commit (design session 17 Oct 2026): the field keys tiles by
  // slot, so when an OFF-marked player is swapped out this same tile
  // receives the incoming player and hands over — the OFF chip pops to
  // a green ✓ (fading at +1.2s) and the old name slides out as the new
  // one rises in. Only a tile that was marked OFF animates, so zone
  // shuffles and lineup edits don't.
  const prevRef = useRef({ id: player.id, name: displayName, wasOff: !!isOff });
  const [handover, setHandover] = useState<{ from: string; key: number } | null>(null);
  const handoverTimer = useRef<number | null>(null);
  useEffect(() => {
    const p = prevRef.current;
    if (p.id !== player.id && p.wasOff) {
      setHandover({ from: p.name, key: Date.now() });
      if (handoverTimer.current !== null) window.clearTimeout(handoverTimer.current);
      handoverTimer.current = window.setTimeout(() => setHandover(null), 1400);
    }
    prevRef.current = { id: player.id, name: displayName, wasOff: !!isOff };
  }, [player.id, displayName, isOff]);
  useEffect(
    () => () => {
      if (handoverTimer.current !== null) window.clearTimeout(handoverTimer.current);
    },
    [],
  );

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
      {...longPressHandlers}
      disabled={!onClick && !onLongPress}
      className={[
        // Press stays crisp (120ms); the OFF ring and due tint fade
        // over 240ms when a swap clears them.
        "relative flex min-h-[68px] w-full flex-col items-stretch rounded-md text-left [transition:transform_120ms_cubic-bezier(0.2,0.8,0.2,1),opacity_120ms_cubic-bezier(0.2,0.8,0.2,1),box-shadow_240ms_cubic-bezier(0.2,0.8,0.2,1),background-color_240ms_cubic-bezier(0.2,0.8,0.2,1)]",
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
      {/* Bench tile going on — target-zone strip (planning, not on the field). */}
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

      {caption && !isOff && !isOn && (
        <div
          className={`flex items-center justify-center rounded-t-[11px] border-b px-1 py-0.5 font-mono text-[10px] font-bold uppercase leading-none tracking-micro ${
            caption.tone === "move"
              ? "border-brand-700 bg-brand-600 text-white"
              : "border-hairline bg-surface-alt text-ink-dim"
          }`}
        >
          {caption.text}
        </div>
      )}

      {keepOn && !injured && !loaned && !hasScore && <KeepOnMarker />}

      <div className="flex flex-1 flex-col px-[10px] py-2">
        {/* Row 1 · labels left, status chip right. */}
        <span className="flex h-4 items-center gap-1.5">
          {zoneLabel && (
            <span className={`font-mono text-[10px] font-bold uppercase leading-4 tracking-micro ${zoneAccent}`}>
              {zoneLabel}
            </span>
          )}
          {player.jersey_number != null && (
            <span className="nums font-mono text-[10px] font-semibold leading-4 text-ink-dim">
              #{player.jersey_number}
            </span>
          )}
          <span className="flex-1" />
          {handover && !isOff && (
            <span key={handover.key} aria-hidden className="motion-safe:animate-chip-out motion-reduce:animate-chip-out">
              <span className="flex h-4 w-4 items-center justify-center rounded-xs bg-brand-600 motion-safe:animate-chip-pop motion-reduce:animate-xfade-in">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M5 12l5 5L20 7" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </span>
          )}
          {isOff && (
            <span
              className={`${CHIP} bg-due tracking-[0.08em] text-white`}
              aria-label={`Coming off next, pair ${swap.pair}`}
            >
              OFF {swap.pair}
            </span>
          )}
          {hasScore && (
            <span
              className={`${CHIP} nums bg-ink text-warm`}
              aria-label={`${score.goals} goals, ${score.behinds} behinds`}
            >
              {score.goals}.{score.behinds}
            </span>
          )}
          {injured && (
            <span className={`${CHIP} bg-danger tracking-micro text-white`} aria-label="Injured">
              INJ
            </span>
          )}
          {loaned && !injured && (
            <span className={`${CHIP} bg-warn tracking-micro text-white`} aria-label="Lent to opposition">
              LENT
            </span>
          )}
          {lockMode && !injured && !loaned && (
            <span
              className={`${CHIP} text-white ${lockMode === "field" ? "bg-brand-600" : "bg-warn"}`}
              aria-label={lockMode === "field" ? "Field locked" : "Zone locked"}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-2.5 w-2.5"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
          )}
        </span>

        {/* Row 2 · the name. (Cohort chips retired with How we play, UX plan 5.8.)
            On a handover the outgoing name slides up and out as the
            incoming one rises into the 20px window. */}
        {handover ? (
          <span key={handover.key} className="grid h-5 [clip-path:inset(0)]">
            <span
              aria-hidden
              style={{ animationDelay: "80ms" }}
              className="block truncate text-[15px] font-semibold leading-5 tracking-[-0.01em] text-ink [grid-area:1/1] motion-safe:animate-roll-out-up motion-reduce:hidden"
            >
              {handover.from}
            </span>
            <span
              style={{ animationDelay: "80ms" }}
              className="block truncate text-[15px] font-semibold leading-5 tracking-[-0.01em] text-ink [grid-area:1/1] motion-safe:animate-roll-in-up motion-reduce:animate-xfade-in"
            >
              {displayName}
            </span>
          </span>
        ) : (
          <span className="block truncate text-[15px] font-semibold leading-5 tracking-[-0.01em] text-ink">
            {displayName}
          </span>
        )}

        {/* Row 3 · zone-time bar, then the time. Solid stepped fills
            with 1px gaps so the zones read apart even in greyscale. */}
        {totalMs !== undefined && (
          <span className="flex h-4 items-center gap-2">
            <span
              className="flex h-1 flex-1 gap-px overflow-hidden rounded-full bg-bar-track"
              aria-label={
                zoneMs
                  ? `Fwd ${formatMinSec(zoneMs.fwd)}, Mid ${formatMinSec(zoneMs.mid)}, Back ${formatMinSec(zoneMs.back)}`
                  : undefined
              }
            >
              {zoneMs && (() => {
                const total = zoneMs.back + zoneMs.hback + zoneMs.mid + zoneMs.hfwd + zoneMs.fwd;
                if (total <= 0) return null;
                const segs: { ms: number; cls: string }[] = [
                  { ms: zoneMs.fwd, cls: "bg-zone-f-fill" },
                  { ms: zoneMs.hfwd, cls: "bg-zone-f-fill" },
                  { ms: zoneMs.mid, cls: "bg-zone-c-fill" },
                  { ms: zoneMs.hback, cls: "bg-zone-b-fill" },
                  { ms: zoneMs.back, cls: "bg-zone-b-fill" },
                ];
                return segs
                  .filter((s) => s.ms > 0)
                  .map((s, i) => (
                    <span key={i} style={{ width: `${(s.ms / total) * 100}%` }} className={`h-full ${s.cls}`} />
                  ));
              })()}
            </span>
            <span className="nums font-mono text-xs font-semibold tabular-nums text-ink">
              {formatMinSec(totalMs)}
            </span>
          </span>
        )}
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
  if (a.chipModes !== b.chipModes) return false;
  if (a.caption?.text !== b.caption?.text || a.caption?.tone !== b.caption?.tone) return false;
  if (a.positionLabel !== b.positionLabel) return false;
  if (a.keepOn !== b.keepOn) return false;
  if (a.swapDue !== b.swapDue) return false;

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
