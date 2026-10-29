"use client";

// ─── Position token ──────────────────────────────────────────
// Rectangular player card rendered inside a third on the Court.
// Visually mirrors AFL's PlayerTile (src/components/live/PlayerTile.tsx)
// so the design language stays consistent across sports — rounded-md,
// hairline border, surface bg, hover state, monospace position chip
// up top with a sky-accent, bold first-name + last-initial below,
// optional INJ / LENT / lock badges floated top-left.
//
// Two interactions:
//   tap        → onTap (open player picker / record goal for GS/GA)
//   long-press → onLongPress (open actions menu — injury / loan / lock)
// Long-press is a 500ms timer started on pointerdown; if it fires, the
// trailing onClick is suppressed via a ref so the same gesture doesn't
// double-fire. Mirrors the AFL PlayerTile implementation.

import { useRef, useState } from "react";
import { netballSport, primaryThirdFor } from "@/lib/sports/netball";
import { formatMinSec, type PlayerThirdMs } from "@/lib/sports/netball/fairness";
import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { hapticTap } from "@/lib/haptics";
import { dispatchLongPressEvent } from "@/components/live/LongPressHint";
import { KeepOnMarker } from "@/components/playbook/KeepOnMarker";
import { useSquadNames } from "@/components/live/SquadNames";

interface PositionTokenProps {
  positionId: string;
  playerName?: string | null;
  /** The kid's id, so a clashing short name is told apart (SquadNames). */
  playerId?: string | null;
  onTap?: () => void;
  /** Triggered after a 500ms hold; suppresses the trailing tap. */
  onLongPress?: () => void;
  selected?: boolean;
  /** Visually greys out the token when the player is ineligible. */
  ineligible?: boolean;
  /** Period-break-only: disabled during live play. */
  disabled?: boolean;
  /**
   * GS/GA only — adds a subtle "tap to score" visual cue. Doesn't change
   * the tap handler itself; the parent decides what tapping does.
   */
  canScore?: boolean;
  /** Player flagged as injured this game — show INJ badge + greyscale. */
  injured?: boolean;
  /** Player lent to opposition this game — show LENT badge + greyscale. */
  loaned?: boolean;
  /** Player locked to this position for the next quarter break. */
  locked?: boolean;
  /** Per-third minutes-played breakdown — drives the colour-coded time bar. */
  stats?: PlayerThirdMs;
  /** Total ms played this game — rendered as mm:ss under the name. */
  totalMs?: number;
  /** Goals scored by this player this game — drives the dark chip in the top-right corner. */
  goalCount?: number;
  /**
   * Pulse trigger — when this changes (e.g. a mid-quarter sub
   * commits at this position), the brand halo fires once on the
   * tile. Passed null/undefined to suppress (every tile that
   * hasn't been touched in this quarter). Mirrors the
   * clockPulseKey pattern on GameHeader / NetballScoreBug.
   */
  pulseKey?: string | number | null;
  /** Season role "Plays every minute" (lineup screens). */
  keepOn?: boolean;
}

// Bar fills: the stepped zone fills AFL uses, so thirds read apart in
// greyscale and glare. Disc fills: the third hues (labels palette).
const THIRD_BAR_COLOR: Record<"attack" | "centre" | "defence", string> = {
  attack: "bg-zone-f-fill",
  centre: "bg-zone-c-fill",
  defence: "bg-zone-b-fill",
};
const THIRD_DISC: Record<"attack" | "centre" | "defence", string> = {
  attack: "bg-zone-f",
  centre: "bg-zone-c",
  defence: "bg-zone-b",
};

export function PositionToken({
  positionId,
  playerName,
  playerId,
  onTap,
  onLongPress,
  selected,
  ineligible,
  disabled,
  canScore,
  injured,
  loaned,
  locked,
  stats,
  totalMs,
  goalCount,
  pulseKey,
  keepOn = false,
}: PositionTokenProps) {
  const pos = netballSport.allPositions.find((p) => p.id === positionId);
  const short = pos?.shortLabel ?? positionId.toUpperCase();

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // P1-9 mirror (commit 7d28f21): at 300ms into a long-press (60%
  // of the way to the 500ms fire), the tile starts a soft brand
  // ring so the user knows the press is registering. Without this
  // the 500ms total reads as unresponsive — users release too
  // early and never discover the long-press menu.
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
      // Mirror AFL PlayerTile (P1-10 + P1.5-3): a light tap haptic
      // before the callback so the buzz lands BEFORE any UI change
      // (actions menu, replacement sheet) the callback triggers,
      // and a window event so LongPressHint self-dismisses now
      // that the user has discovered the gesture. Both are
      // fire-and-forget; we don't await haptics.
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
    onTap?.();
  }

  // "First L" like the AFL tile, told apart from a squad-mate with the
  // same (SquadNames).
  const names = useSquadNames();
  const display = playerName ? names.tile({ id: playerId ?? "", full_name: playerName }) : "—";

  // Re-skin (design session 17 Oct 2026): a white card that sits ON
  // the court — no border, the court lift shadow — laid out as a row:
  // the bib as a 32px disc in its third's colour (it reads as a bib,
  // not a label), then the name over the bar + time. Edges are inset
  // rings so every state keeps the same box. The old GS/GA "shooter"
  // outline is gone; tapping a shooter still records a goal.
  const baseBg = selected
    ? "bg-white ring-2 ring-brand-500 shadow-pop"
    : injured
    ? "bg-white shadow-lift-court ring-1 ring-inset ring-danger/40"
    : loaned
    ? "bg-white shadow-lift-court ring-1 ring-inset ring-warn/40"
    : ineligible
    ? "bg-surface-alt shadow-lift-court"
    : "bg-white shadow-lift-court";

  const third = (() => {
    const t = primaryThirdFor(positionId);
    if (t === "attack-third") return "attack" as const;
    if (t === "centre-third") return "centre" as const;
    if (t === "defence-third") return "defence" as const;
    return null;
  })();

  const goals = goalCount ?? 0;

  // The button is what visually IS the tile. SirenPulseHalo wraps
  // it so a brand halo can fire when this position takes a sub
  // (handled by the parent — passes a fresh pulseKey when the
  // sub commits). When pulseKey is null/undefined the halo
  // wrapper's halo span is omitted entirely — zero DOM cost on
  // tiles that haven't been subbed this quarter.
  return (
    <SirenPulseHalo triggerKey={pulseKey} size="sm" className="rounded-md">
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={onLongPress ? handlePointerDown : undefined}
      onPointerUp={onLongPress ? cancelLongPress : undefined}
      onPointerCancel={onLongPress ? cancelLongPress : undefined}
      disabled={disabled}
      className={[
        "relative flex w-[124px] flex-col rounded-md text-left transition-all duration-fast ease-out-quart",
        baseBg,
        injured || loaned ? "grayscale" : "",
        disabled ? "cursor-not-allowed" : "",
        // P1-1 mirror (PlayerTile parity): subtle press feedback so
        // a tap reads as registered even before the visual state
        // catches up. Only applied when the tile is actually
        // interactive — disabled tiles shouldn't tease a response.
        (onTap || onLongPress) && !disabled
          ? "motion-safe:active:scale-[0.97]"
          : "",
        // P1-9 mirror: at 300ms into a long-press the tile shows a
        // soft brand-300 ring so the press feels registered before
        // the menu opens at 500ms. Gated on !selected so it doesn't
        // fight the brand-500 ring the selected state already owns.
        longPressArming && !selected
          ? "ring-2 ring-brand-300 ring-offset-1"
          : "",
      ].join(" ")}
      aria-label={`${pos?.label ?? positionId}${playerName ? `, ${playerName}` : ", empty"}${
        goals > 0 ? `, ${goals} goal${goals === 1 ? "" : "s"}` : ""
      }`}
    >
      {keepOn && !injured && !loaned && goals === 0 && <KeepOnMarker />}

      {/* Goal count — an 18px ink pill on a white ring, over the
          top-right corner. Hidden at zero so new tokens stay clean. */}
      {goals > 0 && (
        <span
          className="nums absolute -right-1.5 -top-1.5 z-10 h-[18px] min-w-[18px] rounded-full bg-ink px-[5px] text-center font-mono text-nano font-bold leading-[18px] text-warm shadow-[0_0_0_2px_#FFFFFF]"
          aria-hidden
        >
          {goals}
        </span>
      )}

      {/* Status badges floated over the top-left corner. Stacked
          priority: INJ > LENT > LOCK so coaches see the highest-impact
          flag first. */}
      {injured && (
        <span
          className="absolute -left-1 -top-1.5 z-10 rounded-xs bg-danger px-1 font-mono text-nano font-bold uppercase leading-4 tracking-micro text-white"
          aria-label="Injured"
        >
          INJ
        </span>
      )}
      {loaned && !injured && (
        <span
          className="absolute -left-1 -top-1.5 z-10 rounded-xs bg-warn px-1 font-mono text-nano font-bold uppercase leading-4 tracking-micro text-white"
          aria-label="Lent to opposition"
        >
          LENT
        </span>
      )}
      {locked && !injured && !loaned && (
        <span
          className="absolute -left-1 -top-1.5 z-10 rounded-xs bg-brand-600 p-0.5 leading-none text-white"
          aria-label="Locked at this position for the next quarter break"
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


      {/* At large text the name drops under the bib rather than
          shrinking to a letter ("A", "L": Stagehand round 8, #10). The
          disc stays 32 px, so it doesn't grow into the name's room. */}
      <div className="flex min-h-[52px] flex-wrap items-center gap-x-2 gap-y-1 py-2 pl-1.5 pr-2">
        {/* Bib disc — white mono on the third's colour (5.2–6.7:1). */}
        <span
          aria-hidden
          className={`flex h-[32px] w-[32px] flex-shrink-0 items-center justify-center rounded-full font-mono text-micro font-bold tracking-[0.04em] text-white ${
            third ? THIRD_DISC[third] : "bg-ink-dim"
          }`}
        >
          {short}
        </span>

        <span className="flex min-w-[4rem] flex-1 flex-col gap-1">
          {/* Player name — first + last initial, ellipsis. */}
          <span className="truncate text-sm font-semibold leading-[18px] tracking-[-0.01em] text-ink">
            {display}
          </span>

          {/* Bar then time — the same solid stepped fills as AFL's tile. */}
          {stats && totalMs !== undefined && totalMs > 0 && (() => {
            const total = totalMs || 1;
            const segs = [
              { ms: stats.attack, cls: THIRD_BAR_COLOR.attack },
              { ms: stats.centre, cls: THIRD_BAR_COLOR.centre },
              { ms: stats.defence, cls: THIRD_BAR_COLOR.defence },
            ].filter((s) => s.ms > 0);
            return (
              <span className="flex h-3.5 items-center gap-1.5">
                <span
                  className="flex h-[3px] flex-1 gap-px overflow-hidden rounded-full bg-bar-track"
                  aria-label={`Attack ${formatMinSec(stats.attack)}, Centre ${formatMinSec(stats.centre)}, Defence ${formatMinSec(stats.defence)}`}
                >
                  {segs.map((s, i) => (
                    <span key={i} style={{ width: `${(s.ms / total) * 100}%` }} className={`h-full ${s.cls}`} />
                  ))}
                </span>
                <span className="nums font-mono text-micro font-semibold leading-none tabular-nums text-ink">
                  {formatMinSec(totalMs)}
                </span>
              </span>
            );
          })()}
        </span>
      </div>
    </button>
    </SirenPulseHalo>
  );
}
