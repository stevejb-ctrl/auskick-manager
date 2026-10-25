"use client";

// ─── BasketballPlayerTile ────────────────────────────────────
// A basketball player tile. Mirrors AFL's PlayerTile (the reference) and
// soccer's tile row for row: the same 68px box, lift shadow, rings and
// state chips, the same swap handover. Row 1 is the line or position
// (G / F, or PG … C) and #number with any status chip, row 2 the name,
// row 3 the time bar (time at guard and forward) and the time. What's
// basketball's own: the foul chip (nF, amber two and one short of
// fouling out; none at no fouls), OUT for a foul-out, points as "n PTS",
// and a sit-out's countdown.

import { memo, useEffect, useId, useRef, useState } from "react";
import { tileName } from "@/components/live/tileName";
import type { Player } from "@/lib/types";
import type { BasketballLine } from "@/lib/sports/basketball/types";
import { BASKETBALL_LINE_ZONE } from "@/lib/sports/basketball";
import type { BasketballLineMs } from "@/lib/sports/basketball/replay";
import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { useLongPress } from "@/lib/live/useLongPress";
import { ZONE_STRIP } from "@/components/live/zoneStrip";
import { useSquadNames } from "@/components/live/SquadNames";

/** Each line's short label, as the tile and the swap strip print it. */
export const BASKETBALL_LINE_SHORT: Record<BasketballLine, string> = {
  guard: "G",
  forward: "F",
  court: "",
};

/** Each line's name, for screen readers and sheets. */
export const BASKETBALL_LINE_LABEL: Record<BasketballLine, string> = {
  guard: "Guards",
  forward: "Forwards",
  court: "Court",
};

// Each line's colour is the one token the break uses too
// (BASKETBALL_LINE_ZONE): guards AFL's centre colour, forwards its
// forward colour. The court (no positions) prints in ink.
const ZONE_CLASSES: Record<"zone1" | "zone2", { text: string; fill: string; strip: string }> = {
  zone1: { text: "text-zone-f", fill: "bg-zone-f-fill", strip: ZONE_STRIP.f },
  zone2: { text: "text-zone-c", fill: "bg-zone-c-fill", strip: ZONE_STRIP.c },
};
const zoneOf = (line: BasketballLine) => ZONE_CLASSES[BASKETBALL_LINE_ZONE[line] as "zone1" | "zone2"];
const LINE_TEXT: Record<BasketballLine, string> = {
  guard: zoneOf("guard").text,
  forward: zoneOf("forward").text,
  court: "text-ink-dim",
};
const LINE_FILL: Record<BasketballLine, string> = {
  guard: zoneOf("guard").fill,
  forward: zoneOf("forward").fill,
  court: zoneOf("court").fill,
};
const LINE_STRIP: Record<BasketballLine, string> = {
  guard: zoneOf("guard").strip,
  forward: zoneOf("forward").strip,
  court: "border-brand-700 bg-brand-600 text-white",
};

/** The bar's order: guards at the left. */
const BAR_ORDER: BasketballLine[] = ["guard", "forward", "court"];

export interface BasketballSwapRole {
  role: "off" | "on";
  pair: number;
  /** Where a bench kid is going on. */
  line?: BasketballLine;
  /** The position they're taking, under the position strategies ("PG"). */
  positionLabel?: string | null;
  totalPairs?: number;
}

interface BasketballPlayerTileProps {
  player: Player;
  /** Where the kid is now; null on the bench. */
  line?: BasketballLine | null;
  onClick?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  dimmed?: boolean;
  swap?: BasketballSwapRole | null;
  totalMs?: number;
  /** This game's time at guard and forward: the bar. */
  lineMs?: BasketballLineMs;
  injured?: boolean;
  loaned?: boolean;
  /** Fouled out: out for the game. */
  fouledOut?: boolean;
  /** Fouls so far; shown when the tally is on (null hides it). */
  fouls?: number | null;
  /** Fouls that foul a kid out (the age group's). */
  foulOutAt?: number;
  /** A sit-out's time left, in game ms (null when not sitting out). */
  sitOutMsLeft?: number | null;
  /** "field" = Keep on (never subbed); "zone" = kept in a line. */
  lockMode?: "field" | "zone" | null;
  points?: number;
  /** The position strategies: shown in place of the line ("PG"). */
  positionLabel?: string | null;
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

function BasketballPlayerTileImpl({
  player,
  line,
  onClick,
  onLongPress,
  selected,
  dimmed,
  swap,
  totalMs,
  lineMs,
  injured,
  loaned,
  fouledOut,
  fouls = null,
  foulOutAt = 5,
  sitOutMsLeft = null,
  lockMode,
  points,
  positionLabel,
  swapDue = false,
}: BasketballPlayerTileProps) {
  const { handlers: longPressHandlers, arming: longPressArming, consumedLongPress } = useLongPress({ onLongPress });

  function handleClick() {
    if (consumedLongPress()) return;
    onClick?.();
  }

  const sittingOut = sitOutMsLeft !== null && sitOutMsLeft > 0;
  const away = injured || loaned || fouledOut || sittingOut;
  const showSwap = swap && !selected && !away;
  const isOff = showSwap && swap.role === "off";
  const isOn = showSwap && swap.role === "on";
  const showPairNumber = (swap?.totalPairs ?? 0) > 1;
  const hasPoints = (points ?? 0) > 0;
  const foulCount = fouls ?? 0;
  // The foul chip (Steve 2026-10-21: "show a chip … how many fouls a
  // player has"): muted while it's early, amber two short of fouling out,
  // solid one short, red at the limit (FOUL OUT once it's recorded).
  const foulTone =
    foulCount >= foulOutAt
      ? "bg-surface text-danger ring-1 ring-inset ring-danger"
      : foulOutAt > 1 && foulCount >= foulOutAt - 1
        ? "bg-due text-white"
        : foulOutAt > 2 && foulCount >= foulOutAt - 2
          ? "bg-due-tint text-due"
          : "bg-well text-ink-dim";

  const baseBg = selected
    ? "bg-brand-50 ring-2 ring-brand-500 shadow-pop"
    : isOff
      ? swapDue
        ? "bg-due-tint shadow-[inset_0_0_0_2px_rgb(var(--l-due)),0_1px_0_rgba(0,0,0,0.12),0_2px_6px_rgba(15,45,25,0.18)]"
        : "bg-surface shadow-[inset_0_0_0_1.5px_rgb(var(--l-due)),0_1px_0_rgba(0,0,0,0.12),0_2px_6px_rgba(15,45,25,0.18)]"
      : isOn
        ? "bg-brand-50 shadow-lift-field ring-1 ring-inset ring-brand-500"
        : injured || fouledOut
          ? "bg-surface shadow-lift-field ring-1 ring-inset ring-danger/40"
          : loaned || sittingOut
            ? "bg-surface shadow-lift-field ring-1 ring-inset ring-warn/40"
            : lockMode === "field"
              ? "bg-surface shadow-lift-field ring-1 ring-inset ring-brand-300"
              : lockMode === "zone"
                ? "bg-surface shadow-lift-field ring-1 ring-inset ring-warn/50"
                : "bg-surface shadow-lift-field";

  // "First L", told apart from a squad-mate with the same (SquadNames).
  const displayName = useSquadNames().tile(player);

  const lineLabel = positionLabel ?? (line ? BASKETBALL_LINE_SHORT[line] || null : null);

  // One accessible name, read once: kid, line or position, number,
  // time, chips (tileName). The time at guard and forward is the description.
  const splitId = useId();
  const lineSplit =
    totalMs !== undefined && lineMs
      ? BAR_ORDER.filter((u) => (lineMs[u] ?? 0) > 0)
          .map((u) => `${BASKETBALL_LINE_LABEL[u]} ${formatMinSec(lineMs[u] ?? 0)}`)
          .join(", ") || null
      : null;
  const spokenName = tileName({
    name: player.full_name,
    place: positionLabel ?? (line && BASKETBALL_LINE_SHORT[line] ? BASKETBALL_LINE_LABEL[line] : null),
    number: player.jersey_number,
    time: totalMs !== undefined ? formatMinSec(totalMs) : null,
    states: [
      isOn && `Going on${swap?.line && swap.line !== "court" ? ` to ${BASKETBALL_LINE_LABEL[swap.line]}` : ""}, pair ${swap?.pair}`,
      isOff && `Coming off next, pair ${swap?.pair}`,
      fouledOut ? "Fouled out" : injured && "Injured",
      loaned && !injured && !fouledOut && "Lent to opposition",
      sittingOut && !injured && !fouledOut && `Sitting out, ${formatMinSec(sitOutMsLeft ?? 0)} left`,
      fouls !== null && foulCount > 0 && !fouledOut && `${foulCount} ${foulCount === 1 ? "foul" : "fouls"}`,
      !!lockMode && !away && (lockMode === "field" ? "Kept on" : "Line locked"),
      hasPoints && !isOff && `${points} ${points === 1 ? "point" : "points"}`,
    ],
  });

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

  const swapLabel = swap?.positionLabel || (swap?.line ? BASKETBALL_LINE_SHORT[swap.line] : "") || "ON";

  return (
    <SirenPulseHalo triggerKey={swap?.pair ?? null} size="md" display="block" className="rounded-md">
      <button
        type="button"
        data-testid={`player-tile-${player.id}`}
        aria-label={spokenName}
        aria-describedby={lineSplit ? splitId : undefined}
        onClick={handleClick}
        {...longPressHandlers}
        disabled={!onClick && !onLongPress}
        className={[
          "relative flex min-h-[68px] w-full flex-col items-stretch rounded-md text-left [transition:transform_120ms_cubic-bezier(0.2,0.8,0.2,1),opacity_120ms_cubic-bezier(0.2,0.8,0.2,1),box-shadow_240ms_cubic-bezier(0.2,0.8,0.2,1),background-color_240ms_cubic-bezier(0.2,0.8,0.2,1)]",
          baseBg,
          dimmed && !selected ? "opacity-40" : "",
          injured || loaned || fouledOut ? "grayscale" : "",
          !onClick && !onLongPress ? "cursor-default" : "",
          onClick || onLongPress ? "motion-safe:active:scale-[0.97]" : "",
          longPressArming && !selected ? "ring-2 ring-brand-300 ring-offset-1" : "",
        ].join(" ")}
      >
        {isOn && (
          <div
            className={`flex items-center justify-center gap-1 rounded-t-[11px] border-b px-1 py-0.5 font-mono text-[11px] font-bold uppercase leading-none tracking-micro ${
              swap?.line ? LINE_STRIP[swap.line] : LINE_STRIP.court
            }`}
            aria-label={`Going on${swap?.line && swap.line !== "court" ? ` to ${BASKETBALL_LINE_LABEL[swap.line]}` : ""}, pair ${swap.pair}`}
          >
            {showPairNumber && <span className="rounded-xs bg-black/15 px-1 py-0.5 text-[10px]">#{swap.pair}</span>}
            <span>→ {swapLabel}</span>
          </div>
        )}


        <div className="flex flex-1 flex-col px-[10px] py-2">
          {/* Row 1 · labels left, status chip right. */}
          <span className="flex h-4 items-center gap-1.5">
            {lineLabel && (
              <span
                className={`font-mono text-[10px] font-bold uppercase leading-4 tracking-micro ${line ? LINE_TEXT[line] : "text-ink-dim"}`}
              >
                {lineLabel}
              </span>
            )}
            {player.jersey_number != null && (
              <span className="nums font-mono text-[10px] font-semibold leading-4 text-ink-dim">
                #{player.jersey_number}
              </span>
            )}
            {/* The chips, most important first. Row-reverse lays them out
                from the right, and a chip that doesn't fit wraps onto a
                hidden second line whole, so a narrow bench tile shows OUT
                rather than "FOU" (UX audit 23 Oct 2026); points go first. */}
            <span className="flex h-4 min-w-0 flex-1 flex-row-reverse flex-wrap content-start items-center gap-x-1.5 overflow-hidden">
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
              {fouledOut ? (
                <span className={`${CHIP} bg-danger tracking-micro text-white`} aria-label="Fouled out">
                  OUT
                </span>
              ) : injured ? (
                <span className={`${CHIP} bg-danger tracking-micro text-white`} aria-label="Injured">
                  INJ
                </span>
              ) : null}
              {loaned && !injured && !fouledOut && (
                <span className={`${CHIP} bg-warn tracking-micro text-white`} aria-label="Lent to opposition">
                  LENT
                </span>
              )}
              {sittingOut && !injured && !fouledOut && (
                <span className={`${CHIP} nums bg-warn tracking-micro text-white`} aria-label={`Sitting out, ${formatMinSec(sitOutMsLeft!)} left`}>
                  SIT {formatMinSec(sitOutMsLeft!)}
                </span>
              )}
              {/* No chip at no fouls: a "0F" on every tile was clutter. */}
              {fouls !== null && foulCount > 0 && !fouledOut && (
                <span
                  data-testid={`fouls-${player.id}`}
                  className={`${CHIP} nums ${foulTone}`}
                  aria-label={`${foulCount} ${foulCount === 1 ? "foul" : "fouls"}`}
                >
                  {foulCount}F
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
              {/* Points say so: "2P" read like a position. */}
              {hasPoints && !isOff && (
                <span className={`${CHIP} nums bg-ink text-warm`} aria-label={`${points} ${points === 1 ? "point" : "points"}`}>
                  {points} PTS
                </span>
              )}
            </span>
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

          {/* Row 3 · time at guard and forward, then the time. */}
          {totalMs !== undefined && (
            <span className="flex h-4 items-center gap-2">
              <span
                className="flex h-1 flex-1 gap-px overflow-hidden rounded-full bg-bar-track"
                aria-label={
                  lineMs
                    ? BAR_ORDER.filter((u) => (lineMs[u] ?? 0) > 0)
                        .map((u) => `${BASKETBALL_LINE_LABEL[u]} ${formatMinSec(lineMs[u] ?? 0)}`)
                        .join(", ") || undefined
                    : undefined
                }
              >
                {lineMs &&
                  (() => {
                    const total = BAR_ORDER.reduce((s, u) => s + (lineMs[u] ?? 0), 0);
                    if (total <= 0) return null;
                    return BAR_ORDER.filter((u) => (lineMs[u] ?? 0) > 0).map((u) => (
                      <span key={u} style={{ width: `${((lineMs[u] ?? 0) / total) * 100}%` }} className={`h-full ${LINE_FILL[u]}`} />
                    ));
                  })()}
              </span>
              <span className="nums font-mono text-xs font-semibold tabular-nums text-ink">{formatMinSec(totalMs)}</span>
            </span>
          )}
        </div>
      </button>
      {/* The time at guard and forward, outside the tile so it isn't the tile's text. */}
      {lineSplit && (
        <span id={splitId} hidden>
          {lineSplit}
        </span>
      )}
    </SirenPulseHalo>
  );
}

// Memoised as AFL's tile is: time props quantised to whole seconds so a
// clock tick that doesn't cross a second is a cache hit.
const SECOND_MS = 1000;
const quantize = (ms: number | undefined | null) => (ms === undefined || ms === null ? -1 : Math.floor(ms / SECOND_MS));

function areEqual(a: BasketballPlayerTileProps, b: BasketballPlayerTileProps): boolean {
  if (
    a.player !== b.player ||
    a.line !== b.line ||
    a.onClick !== b.onClick ||
    a.onLongPress !== b.onLongPress ||
    a.selected !== b.selected ||
    a.dimmed !== b.dimmed ||
    a.injured !== b.injured ||
    a.loaned !== b.loaned ||
    a.fouledOut !== b.fouledOut ||
    a.fouls !== b.fouls ||
    a.foulOutAt !== b.foulOutAt ||
    a.lockMode !== b.lockMode ||
    a.points !== b.points ||
    a.positionLabel !== b.positionLabel ||
    a.swapDue !== b.swapDue
  ) {
    return false;
  }
  if (a.swap !== b.swap) {
    if (!a.swap || !b.swap) return false;
    if (
      a.swap.role !== b.swap.role ||
      a.swap.pair !== b.swap.pair ||
      a.swap.line !== b.swap.line ||
      a.swap.positionLabel !== b.swap.positionLabel ||
      a.swap.totalPairs !== b.swap.totalPairs
    ) {
      return false;
    }
  }
  if (quantize(a.totalMs) !== quantize(b.totalMs)) return false;
  if (quantize(a.sitOutMsLeft) !== quantize(b.sitOutMsLeft)) return false;
  if (a.lineMs !== b.lineMs) {
    if (!a.lineMs || !b.lineMs) return false;
    for (const u of BAR_ORDER) if (quantize(a.lineMs[u]) !== quantize(b.lineMs[u])) return false;
  }
  return true;
}

export const BasketballPlayerTile = memo(BasketballPlayerTileImpl, areEqual);
