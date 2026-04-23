"use client";

// ─── Position token ──────────────────────────────────────────
// Circular pill rendered inside a third on the Court. Shows the
// position short label + player name (or "—" if empty). Tapping
// opens a player picker in the parent component.

import { netballSport } from "@/lib/sports/netball";

interface PositionTokenProps {
  positionId: string;
  playerName?: string | null;
  onTap?: () => void;
  selected?: boolean;
  /** Visually greys out the token when the player is ineligible. */
  ineligible?: boolean;
  /** Period-break-only: disabled during live play. */
  disabled?: boolean;
}

export function PositionToken({
  positionId,
  playerName,
  onTap,
  selected,
  ineligible,
  disabled,
}: PositionTokenProps) {
  const pos = netballSport.allPositions.find((p) => p.id === positionId);
  const short = pos?.shortLabel ?? positionId.toUpperCase();

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      className={[
        "relative flex min-w-20 max-w-28 flex-col items-center justify-center gap-0.5 rounded-full border-2 px-2 py-1.5 text-center shadow-sm transition",
        selected
          ? "border-brand-600 bg-brand-50 ring-2 ring-brand-400"
          : ineligible
          ? "border-neutral-300 bg-neutral-100 opacity-60"
          : "border-amber-700 bg-white hover:bg-amber-50",
        disabled ? "cursor-not-allowed opacity-70" : "",
      ].join(" ")}
      aria-label={`${pos?.label ?? positionId}${playerName ? `, ${playerName}` : ", empty"}`}
    >
      <span className="text-[11px] font-bold uppercase tracking-wide text-amber-900">
        {short}
      </span>
      <span className="max-w-[7rem] truncate text-xs font-medium text-neutral-800">
        {playerName ?? "—"}
      </span>
    </button>
  );
}
