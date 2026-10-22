"use client";

// ─── SoccerPlayerTile ────────────────────────────────────────
// A soccer-family player tile (Football (soccer), futsal, hockey).
// Mirrors AFL's PlayerTile (the reference) row for row: the same 68px
// box on the 4px grid, the same lift shadow, rings and state chips, the
// same swap handover. Row 1 is the unit in the sport's own words (GK /
// DEF / MID / ATT; futsal's BACK / WING / FRONT; hockey's STR) and
// #number with any status chip, row 2 the name, row 3 the time bar
// (time in each line and in goal) and the time. It's the family's own
// because AFL's tile is typed to AFL's zones; only the words and the
// bar's units differ.

import { memo, useEffect, useRef, useState } from "react";
import type { Player } from "@/lib/types";
import type { SoccerUnit, SoccerUnitWords } from "@/lib/sports/soccer/types";
import type { SoccerUnitMs } from "@/lib/sports/soccer/replay";
import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { useLongPress } from "@/lib/live/useLongPress";
import { KeepOnMarker } from "@/components/playbook/KeepOnMarker";

// Lines take AFL's three zone colours by place on the field (attack is
// AFL's forward, midfield its centre, defence its back), so the palette
// reads the same in both sports. The keeper is ink: never a line colour.
const UNIT_TEXT: Record<SoccerUnit, string> = {
  gk: "text-ink",
  def: "text-zone-b",
  mid: "text-zone-c",
  att: "text-zone-f",
  field: "text-ink-dim",
};
const UNIT_FILL: Record<SoccerUnit, string> = {
  gk: "bg-ink",
  def: "bg-zone-b-fill",
  mid: "bg-zone-c-fill",
  att: "bg-zone-f-fill",
  field: "bg-zone-c-fill",
};
const UNIT_STRIP: Record<SoccerUnit, string> = {
  gk: "border-ink/30 bg-ink/10 text-ink",
  def: "border-zone-b/40 bg-zone-b/15 text-zone-b",
  mid: "border-zone-c/40 bg-zone-c/15 text-zone-c",
  att: "border-zone-f/40 bg-zone-f/15 text-zone-f",
  field: "border-brand-700 bg-brand-600 text-white",
};

/** The bar's order: attack at the left, as AFL's forward is. */
const BAR_ORDER: SoccerUnit[] = ["att", "mid", "def", "field", "gk"];

export interface SoccerSwapRole {
  role: "off" | "on";
  pair: number;
  /** Where a bench kid is going on. */
  unit?: SoccerUnit;
  totalPairs?: number;
}

export interface SoccerTileCaption {
  text: string;
  tone: "move" | "stay";
}

interface SoccerPlayerTileProps {
  player: Player;
  /** The sport's words for each unit (SoccerFamilyRules.lineLabels). */
  words: Record<SoccerUnit, SoccerUnitWords>;
  /** Where the kid is now; null on the bench. */
  unit?: SoccerUnit | null;
  onClick?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  dimmed?: boolean;
  swap?: SoccerSwapRole | null;
  totalMs?: number;
  /** This game's time in each line and in goal: the bar. */
  unitMs?: SoccerUnitMs;
  injured?: boolean;
  loaned?: boolean;
  /** "field" = Keep on or Keep in goal (never subbed); "zone" = kept in a line. */
  lockMode?: "field" | "zone" | null;
  goals?: number;
  caption?: SoccerTileCaption | null;
  /** Named positions: shown in place of the unit ("CB"). */
  positionLabel?: string | null;
  keepOn?: boolean;
  /** The sub card is in its SUB DUE state (AFL's due ring and tint). */
  swapDue?: boolean;
}

function formatMinSec(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

const CHIP = "inline-flex h-4 shrink-0 items-center rounded-xs px-[5px] font-mono text-[10px] font-bold leading-4";

function SoccerPlayerTileImpl({
  player,
  words,
  unit,
  onClick,
  onLongPress,
  selected,
  dimmed,
  swap,
  totalMs,
  unitMs,
  injured,
  loaned,
  lockMode,
  goals,
  caption,
  positionLabel,
  keepOn,
  swapDue = false,
}: SoccerPlayerTileProps) {
  const { handlers: longPressHandlers, arming: longPressArming, consumedLongPress } = useLongPress({ onLongPress });

  function handleClick() {
    if (consumedLongPress()) return;
    onClick?.();
  }

  const showSwap = swap && !selected && !injured && !loaned;
  const isOff = showSwap && swap.role === "off";
  const isOn = showSwap && swap.role === "on";
  const showPairNumber = (swap?.totalPairs ?? 0) > 1;
  const hasGoals = (goals ?? 0) > 0;

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

  const unitLabel = positionLabel ?? (unit ? words[unit].short || null : null);

  // The swap handover, as AFL's tile: a tile marked OFF that receives
  // the kid coming on pops a green ✓ and rolls the names.
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
    <SirenPulseHalo triggerKey={swap?.pair ?? null} size="md" display="block" className="rounded-md">
      <button
        type="button"
        data-testid={`player-tile-${player.id}`}
        onClick={handleClick}
        {...longPressHandlers}
        disabled={!onClick && !onLongPress}
        className={[
          "relative flex min-h-[68px] w-full flex-col items-stretch rounded-md text-left [transition:transform_120ms_cubic-bezier(0.2,0.8,0.2,1),opacity_120ms_cubic-bezier(0.2,0.8,0.2,1),box-shadow_240ms_cubic-bezier(0.2,0.8,0.2,1),background-color_240ms_cubic-bezier(0.2,0.8,0.2,1)]",
          baseBg,
          dimmed && !selected ? "opacity-40" : "",
          injured || loaned ? "grayscale" : "",
          !onClick && !onLongPress ? "cursor-default" : "",
          onClick || onLongPress ? "motion-safe:active:scale-[0.97]" : "",
          longPressArming && !selected ? "ring-2 ring-brand-300 ring-offset-1" : "",
        ].join(" ")}
      >
        {isOn && swap?.unit && (
          <div
            className={`flex items-center justify-center gap-1 rounded-t-[11px] border-b px-1 py-0.5 font-mono text-[11px] font-bold uppercase leading-none tracking-micro ${UNIT_STRIP[swap.unit]}`}
            aria-label={`Going on to ${words[swap.unit].label}, pair ${swap.pair}`}
          >
            {showPairNumber && <span className="rounded-xs bg-black/15 px-1 py-0.5 text-[10px]">#{swap.pair}</span>}
            <span>→ {words[swap.unit].short || "ON"}</span>
          </div>
        )}
        {isOn && !swap?.unit && (
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

        {keepOn && !injured && !loaned && !hasGoals && <KeepOnMarker />}

        <div className="flex flex-1 flex-col px-[10px] py-2">
          {/* Row 1 · labels left, status chip right. */}
          <span className="flex h-4 items-center gap-1.5">
            {unitLabel && (
              <span
                className={`font-mono text-[10px] font-bold uppercase leading-4 tracking-micro ${unit ? UNIT_TEXT[unit] : "text-ink-dim"}`}
              >
                {unitLabel}
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
              <span className={`${CHIP} bg-due tracking-[0.08em] text-white`} aria-label={`Coming off next, pair ${swap.pair}`}>
                OFF {swap.pair}
              </span>
            )}
            {hasGoals && (
              <span className={`${CHIP} nums bg-ink text-warm`} aria-label={`${goals} ${goals === 1 ? "goal" : "goals"}`}>
                {goals}G
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
                aria-label={lockMode === "field" ? "Field locked" : "Line locked"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-2.5 w-2.5" aria-hidden>
                  <path
                    fillRule="evenodd"
                    d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
            )}
          </span>

          {/* Row 2 · the name (rolling on a handover). */}
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

          {/* Row 3 · time in each line and in goal, then the time. */}
          {totalMs !== undefined && (
            <span className="flex h-4 items-center gap-2">
              <span
                className="flex h-1 flex-1 gap-px overflow-hidden rounded-full bg-bar-track"
                aria-label={
                  unitMs
                    ? BAR_ORDER.filter((u) => (unitMs[u] ?? 0) > 0)
                        .map((u) => `${words[u].label} ${formatMinSec(unitMs[u] ?? 0)}`)
                        .join(", ") || undefined
                    : undefined
                }
              >
                {unitMs &&
                  (() => {
                    const total = BAR_ORDER.reduce((s, u) => s + (unitMs[u] ?? 0), 0);
                    if (total <= 0) return null;
                    return BAR_ORDER.filter((u) => (unitMs[u] ?? 0) > 0).map((u) => (
                      <span key={u} style={{ width: `${((unitMs[u] ?? 0) / total) * 100}%` }} className={`h-full ${UNIT_FILL[u]}`} />
                    ));
                  })()}
              </span>
              <span className="nums font-mono text-xs font-semibold tabular-nums text-ink">{formatMinSec(totalMs)}</span>
            </span>
          )}
        </div>
      </button>
    </SirenPulseHalo>
  );
}

// Memoised as AFL's tile is: time props quantised to whole seconds so a
// clock tick that doesn't cross a second is a cache hit.
const SECOND_MS = 1000;
const quantize = (ms: number | undefined) => (ms === undefined ? -1 : Math.floor(ms / SECOND_MS));

function areEqual(a: SoccerPlayerTileProps, b: SoccerPlayerTileProps): boolean {
  if (
    a.player !== b.player ||
    a.words !== b.words ||
    a.unit !== b.unit ||
    a.onClick !== b.onClick ||
    a.onLongPress !== b.onLongPress ||
    a.selected !== b.selected ||
    a.dimmed !== b.dimmed ||
    a.injured !== b.injured ||
    a.loaned !== b.loaned ||
    a.lockMode !== b.lockMode ||
    a.goals !== b.goals ||
    a.positionLabel !== b.positionLabel ||
    a.keepOn !== b.keepOn ||
    a.swapDue !== b.swapDue ||
    a.caption?.text !== b.caption?.text ||
    a.caption?.tone !== b.caption?.tone
  ) {
    return false;
  }
  if (a.swap !== b.swap) {
    if (!a.swap || !b.swap) return false;
    if (a.swap.role !== b.swap.role || a.swap.pair !== b.swap.pair || a.swap.unit !== b.swap.unit || a.swap.totalPairs !== b.swap.totalPairs) {
      return false;
    }
  }
  if (quantize(a.totalMs) !== quantize(b.totalMs)) return false;
  if (a.unitMs !== b.unitMs) {
    if (!a.unitMs || !b.unitMs) return false;
    for (const u of BAR_ORDER) if (quantize(a.unitMs[u]) !== quantize(b.unitMs[u])) return false;
  }
  return true;
}

export const SoccerPlayerTile = memo(SoccerPlayerTileImpl, areEqual);
