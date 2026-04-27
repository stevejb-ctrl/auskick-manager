"use client";

// ─── Position token ──────────────────────────────────────────
// Circular pill rendered inside a third on the Court. Shows the
// position short label + player name (or "—" if empty).
//
// Two interactions:
//   tap        → onTap (open player picker / record goal for GS/GA)
//   long-press → onLongPress (open actions menu — injury / loan / lock)
// Long-press is a 500ms timer started on pointerdown; if it fires, the
// trailing onClick is suppressed via a ref so the same gesture doesn't
// double-fire. Mirrors the AFL PlayerTile implementation.

import { useRef } from "react";
import { netballSport } from "@/lib/sports/netball";

interface PositionTokenProps {
  positionId: string;
  playerName?: string | null;
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
}

export function PositionToken({
  positionId,
  playerName,
  onTap,
  onLongPress,
  selected,
  ineligible,
  disabled,
  canScore,
}: PositionTokenProps) {
  const pos = netballSport.allPositions.find((p) => p.id === positionId);
  const short = pos?.shortLabel ?? positionId.toUpperCase();

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
    // If the long-press fired, swallow the trailing click — otherwise the
    // user gets both menus stacked.
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return;
    }
    onTap?.();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={onLongPress ? handlePointerDown : undefined}
      onPointerUp={onLongPress ? cancelLongPress : undefined}
      onPointerCancel={onLongPress ? cancelLongPress : undefined}
      disabled={disabled}
      className={[
        "relative flex min-w-20 max-w-28 flex-col items-center justify-center gap-0.5 rounded-full border-2 px-2 py-1.5 text-center shadow-sm transition",
        selected
          ? "border-brand-600 bg-brand-50 ring-2 ring-brand-400"
          : ineligible
          ? "border-neutral-300 bg-neutral-100 opacity-60"
          : canScore
          // Score-eligible tokens get a faint amber halo to read as
          // "tap to record a goal" without shouting. Distinct from the
          // selected state (brand-green) so coaches don't confuse the
          // two states.
          ? "border-sky-700 bg-white ring-1 ring-amber-300/70 hover:bg-amber-50"
          : "border-sky-700 bg-white hover:bg-sky-50",
        disabled ? "cursor-not-allowed opacity-70" : "",
      ].join(" ")}
      aria-label={`${pos?.label ?? positionId}${playerName ? `, ${playerName}` : ", empty"}`}
    >
      <span className="text-[11px] font-bold uppercase tracking-wide text-sky-900">
        {short}
      </span>
      <span className="max-w-[7rem] truncate text-xs font-medium text-neutral-800">
        {playerName ?? "—"}
      </span>
    </button>
  );
}
