"use client";

// ─── KidBench ────────────────────────────────────────────────
// Live v3's bench (Steve, 8 Nov 2026): the same kid as on the field,
// ink on the chalk page, three across, under a small dim "BENCH 3" set
// sideways in the margin (the field's line labels do the same). Kids
// who are out (hurt, home, lent) sit at the end in their out look, and
// "+ Late" (a late arrival) is a small text button after them.
//
// Sport-agnostic: a sport passes its tiles (KidTile place="bench") and,
// where late arrivals are added from here, the late menu.

import type { ReactNode } from "react";

export interface KidBenchProps {
  /**
   * How many are on the bench, for the margin label: a number, or the
   * break's "3 + 1 injured".
   */
  count: number | string;
  /** The kids: bench tiles, then the out tiles. */
  tiles: ReactNode[];
  /** "+ Late" (LateArrivalMenu look="text"); hides itself with nobody to add. */
  late?: ReactNode;
  /** Said when there's nobody on the bench. */
  emptyText?: string;
  /** Big squads: shorter rows (44 px). */
  dense?: boolean;
}

export function KidBench({ count, tiles, late, emptyText = "Nobody on the bench", dense = false }: KidBenchProps) {
  return (
    <div role="group" aria-label="Bench" className="grid grid-cols-[minmax(14px,auto)_minmax(0,1fr)] items-center gap-[6px] px-[4px]">
      <span
        aria-hidden
        className="self-center justify-self-center whitespace-nowrap font-display text-[0.53125rem] font-bold uppercase leading-none tracking-[0.16em] text-ink-mute [transform:rotate(180deg)] [writing-mode:vertical-rl]"
      >
        Bench {count}
      </span>
      {tiles.length === 0 ? (
        <div className="flex min-h-[44px] items-center justify-between gap-2">
          <p className="text-[0.8125rem] text-ink-mute">{emptyText}</p>
          {late}
        </div>
      ) : (
        <div
          className="grid grid-cols-3 gap-[8px] bigtext:grid-cols-2"
          style={{ gridAutoRows: `minmax(${dense ? 44 : 48}px, auto)` }}
        >
          {tiles}
          {late && <div className="flex min-w-0 items-center">{late}</div>}
        </div>
      )}
    </div>
  );
}
