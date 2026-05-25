"use client";

// ─── PlayerVestBadge ─────────────────────────────────────────
// Small chip overlay that sits next to a player's name/tile to
// signal that they're currently wearing the FR or DH vest. Junior
// rugby-league only; the colour ladder mirrors the real-world
// vest colours referenced in the laws (FR = yellow per §12;
// DH = pink per §12).
//
// Stays decorative — the picker (VestAssignmentCard) owns the
// state changes. This badge is read-only.

import type { VestType } from "@/lib/sports/rugby_league/vests";

interface PlayerVestBadgeProps {
  vest: VestType;
  /** Render a faded variant for tiles outside the current period
   *  (e.g. dimmed history on the bench after a sub-off). */
  dimmed?: boolean;
}

const styles: Record<VestType, string> = {
  // FR — yellow ladder. Junior laws §12: yellow vest.
  fr: "bg-warn-soft text-warn",
  // DH — pink ladder. Junior laws §12: pink vest. Tailwind doesn't
  // ship a pink-soft alias by default in this project, so the
  // explicit rgb() value keeps the colour stable across themes.
  dh: "bg-[#FCE4EC] text-[#AD1457]",
};

const labels: Record<VestType, string> = {
  fr: "FR",
  dh: "DH",
};

export function PlayerVestBadge({ vest, dimmed = false }: PlayerVestBadgeProps) {
  return (
    <span
      aria-label={
        vest === "fr" ? "First Receiver vest" : "Dummy Half vest"
      }
      className={[
        "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        styles[vest],
        dimmed ? "opacity-50" : "",
      ]
        .join(" ")
        .trim()}
    >
      {labels[vest]}
    </span>
  );
}
