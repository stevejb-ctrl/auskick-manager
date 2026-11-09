"use client";

// ─── MixedMark ───────────────────────────────────────────────
// A mixed team's G or B on a kid (touch and Oztag, the boys' cap): a small
// letter in a thin ring, in the tile's own colour, so it reads as chalk on
// the grass and ink on the bench, light or dark. The letter carries it,
// never a colour (Steve, 9 Nov 2026: parents couldn't follow the cap
// without it; the warning alone came too late).
//
// Coach view only. The sports pass a kid's group only on a mixed team, to
// a coach: never on the game-day link, the parent scoreboard or a public
// page (that's the privacy line). Seen only: a tile says "girl" or "boy"
// in its name.

import type { MixedGroup } from "@/lib/types";

export function MixedMark({ group, className = "" }: { group: MixedGroup; className?: string }) {
  return (
    <span
      aria-hidden
      data-testid="mixed-mark"
      data-group={group}
      className={`inline-flex h-[14px] min-w-[14px] flex-none items-center justify-center rounded-[4px] px-[2px] font-display text-[0.5625rem] font-black not-italic leading-none tracking-normal opacity-80 shadow-[inset_0_0_0_1px_currentColor] ${className}`}
    >
      {group === "girl" ? "G" : "B"}
    </span>
  );
}

/** What a tile says for the mark ("girl", "boy"). */
export function mixedMarkSpoken(group: MixedGroup | null | undefined): string | null {
  return group === "girl" ? "girl" : group === "boy" ? "boy" : null;
}
