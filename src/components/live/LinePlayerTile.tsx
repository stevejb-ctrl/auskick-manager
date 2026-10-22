"use client";

// ─── LinePlayerTile ──────────────────────────────────────────
// A player tile for the sports that play in lines or lanes with rolling
// subs. Mirrors AFL's PlayerTile (the reference) row for row: the same
// 68px box, lift shadow, rings and state chips, and the same swap
// handover. Row 1 is the line's short label and #number with any status
// chip, row 2 the name, row 3 the time bar (time in each line) and the
// time.
//
// Soccer's and basketball's tiles are line-for-line copies of this shape
// in their own words (CLAUDE.md: the seam was wide enough to be
// re-violated). This one takes its words and colours as props, so a
// sport supplies only its lines. Touch and Oztag are its first users;
// moving soccer's and basketball's onto it is a follow-up, as with
// lib/live/rollingSubs.ts.

import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import type { Player } from "@/lib/types";
import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { useLongPress } from "@/lib/live/useLongPress";

/** How a sport draws one of its lines on a tile. */
export interface TileLineStyle {
  /** Short label in row 1 and on the swap strip ("M"); empty for none. */
  short: string;
  /** Its name, for screen readers ("Middles"). */
  label: string;
  /** Row 1's label colour ("text-zone-c"). */
  textClass: string;
  /** Its share of the time bar ("bg-zone-c-fill"). */
  fillClass: string;
  /** The "→ M" strip on a kid going on there. */
  stripClass: string;
}

export interface LineTileSwap {
  role: "off" | "on";
  pair: number;
  /** Where a bench kid is going on (a line key the style map knows). */
  line?: string;
  totalPairs?: number;
}

export interface LineTileCaption {
  text: string;
  tone: "move" | "stay";
}

export interface LinePlayerTileProps {
  player: Player;
  /** Where the kid is now (a key of `styles`); null on the bench. */
  line?: string | null;
  /** The sport's lines, keyed as `line` and the time bar are. */
  styles: Record<string, TileLineStyle>;
  /** The time bar's lines, left to right. */
  barOrder: readonly string[];
  onClick?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  dimmed?: boolean;
  swap?: LineTileSwap | null;
  totalMs?: number;
  /** This game's time in each line: the bar. */
  lineMs?: Partial<Record<string, number>>;
  injured?: boolean;
  loaned?: boolean;
  /** "field" = Keep on (never subbed); "zone" = kept in a line. */
  lockMode?: "field" | "zone" | null;
  /** The scoring chip ("2T"), with its spoken label; omitted for none. */
  score?: { text: string; label: string } | null;
  caption?: LineTileCaption | null;
  /** The sub card is in its SUB DUE state (AFL's due ring and tint). */
  swapDue?: boolean;
  /** A sport's own status chip after the score (basketball's fouls). */
  extraChip?: ReactNode;
}

function formatMinSec(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

const CHIP = "inline-flex h-4 shrink-0 items-center rounded-xs px-[5px] font-mono text-[10px] font-bold leading-4";
const NO_LINE_STRIP = "border-brand-700 bg-brand-600 text-white";

function LinePlayerTileImpl({
  player,
  line,
  styles,
  barOrder,
  onClick,
  onLongPress,
  selected,
  dimmed,
  swap,
  totalMs,
  lineMs,
  injured,
  loaned,
  lockMode,
  score,
  caption,
  swapDue = false,
  extraChip,
}: LinePlayerTileProps) {
  const { handlers: longPressHandlers, arming: longPressArming, consumedLongPress } = useLongPress({ onLongPress });

  function handleClick() {
    if (consumedLongPress()) return;
    onClick?.();
  }

  const away = injured || loaned;
  const showSwap = swap && !selected && !away;
  const isOff = showSwap && swap.role === "off";
  const isOn = showSwap && swap.role === "on";
  const showPairNumber = (swap?.totalPairs ?? 0) > 1;

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

  const style = line ? styles[line] : undefined;
  const lineLabel = style?.short || null;

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

  const swapStyle = swap?.line ? styles[swap.line] : undefined;
  const swapLabel = swapStyle?.short || "ON";

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
          away ? "grayscale" : "",
          !onClick && !onLongPress ? "cursor-default" : "",
          onClick || onLongPress ? "motion-safe:active:scale-[0.97]" : "",
          longPressArming && !selected ? "ring-2 ring-brand-300 ring-offset-1" : "",
        ].join(" ")}
      >
        {isOn && (
          <div
            className={`flex items-center justify-center gap-1 rounded-t-[11px] border-b px-1 py-0.5 font-mono text-[11px] font-bold uppercase leading-none tracking-micro ${
              swapStyle?.stripClass ?? NO_LINE_STRIP
            }`}
            aria-label={`Going on${swapStyle?.short ? ` to ${swapStyle.label}` : ""}, pair ${swap.pair}`}
          >
            {showPairNumber && <span className="rounded-xs bg-black/15 px-1 py-0.5 text-[10px]">#{swap.pair}</span>}
            <span>→ {swapLabel}</span>
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

        <div className="flex flex-1 flex-col px-[10px] py-2">
          {/* Row 1 · labels left, status chip right. */}
          <span className="flex h-4 items-center gap-1.5">
            {lineLabel && (
              <span className={`font-mono text-[10px] font-bold uppercase leading-4 tracking-micro ${style?.textClass ?? "text-ink-dim"}`}>
                {lineLabel}
              </span>
            )}
            {player.jersey_number != null && (
              <span className="nums font-mono text-[10px] font-semibold leading-4 text-ink-dim">#{player.jersey_number}</span>
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
            {score && !isOff && (
              <span className={`${CHIP} nums bg-ink text-warm`} aria-label={score.label}>
                {score.text}
              </span>
            )}
            {extraChip}
            {injured ? (
              <span className={`${CHIP} bg-danger tracking-micro text-white`} aria-label="Injured">
                INJ
              </span>
            ) : null}
            {loaned && !injured && (
              <span className={`${CHIP} bg-warn tracking-micro text-white`} aria-label="Lent to opposition">
                LENT
              </span>
            )}
            {lockMode && !away && (
              <span
                className={`${CHIP} text-white ${lockMode === "field" ? "bg-brand-600" : "bg-warn"}`}
                aria-label={lockMode === "field" ? "Kept on" : "Line locked"}
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
            <span className="block truncate text-[15px] font-semibold leading-5 tracking-[-0.01em] text-ink">{displayName}</span>
          )}

          {/* Row 3 · time in each line, then the time. */}
          {totalMs !== undefined && (
            <span className="flex h-4 items-center gap-2">
              <span
                className="flex h-1 flex-1 gap-px overflow-hidden rounded-full bg-bar-track"
                aria-label={
                  lineMs
                    ? barOrder
                        .filter((u) => (lineMs[u] ?? 0) > 0)
                        .map((u) => `${styles[u]?.label ?? u} ${formatMinSec(lineMs[u] ?? 0)}`)
                        .join(", ") || undefined
                    : undefined
                }
              >
                {lineMs &&
                  (() => {
                    const total = barOrder.reduce((s, u) => s + (lineMs[u] ?? 0), 0);
                    if (total <= 0) return null;
                    return barOrder
                      .filter((u) => (lineMs[u] ?? 0) > 0)
                      .map((u) => (
                        <span
                          key={u}
                          style={{ width: `${((lineMs[u] ?? 0) / total) * 100}%` }}
                          className={`h-full ${styles[u]?.fillClass ?? "bg-zone-c-fill"}`}
                        />
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
const quantize = (ms: number | undefined | null) => (ms === undefined || ms === null ? -1 : Math.floor(ms / SECOND_MS));

function areEqual(a: LinePlayerTileProps, b: LinePlayerTileProps): boolean {
  if (
    a.player !== b.player ||
    a.line !== b.line ||
    a.styles !== b.styles ||
    a.barOrder !== b.barOrder ||
    a.onClick !== b.onClick ||
    a.onLongPress !== b.onLongPress ||
    a.selected !== b.selected ||
    a.dimmed !== b.dimmed ||
    a.injured !== b.injured ||
    a.loaned !== b.loaned ||
    a.lockMode !== b.lockMode ||
    a.score?.text !== b.score?.text ||
    a.swapDue !== b.swapDue ||
    a.extraChip !== b.extraChip ||
    a.caption?.text !== b.caption?.text ||
    a.caption?.tone !== b.caption?.tone
  ) {
    return false;
  }
  if (a.swap !== b.swap) {
    if (!a.swap || !b.swap) return false;
    if (a.swap.role !== b.swap.role || a.swap.pair !== b.swap.pair || a.swap.line !== b.swap.line || a.swap.totalPairs !== b.swap.totalPairs) {
      return false;
    }
  }
  if (quantize(a.totalMs) !== quantize(b.totalMs)) return false;
  if (a.lineMs !== b.lineMs) {
    if (!a.lineMs || !b.lineMs) return false;
    for (const u of a.barOrder) if (quantize(a.lineMs[u]) !== quantize(b.lineMs[u])) return false;
  }
  return true;
}

export const LinePlayerTile = memo(LinePlayerTileImpl, areEqual);
