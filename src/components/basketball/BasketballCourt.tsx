"use client";

// ─── BasketballCourt ─────────────────────────────────────────
// The basketball court for the live game, the lineup picker and the
// breaks. Mirrors soccer's pitch and AFL's Field (the reference): lines
// as rows of a two-column grid with an odd tile centred, a hairline
// between lines, dashed "Empty" placeholders. The floor is netball's
// court blue (both indoor courts, one token). Attacking up the page:
// the forwards by the basket, the guards out at the top of the key.
// Equal minutes has no lines: one group of five.

import { Fragment } from "react";
import type { Player } from "@/lib/types";
import type { BasketballLineup } from "@/lib/sports/basketball/lineup";
import type { BasketballLineMs } from "@/lib/sports/basketball/replay";
import type { BasketballLine } from "@/lib/sports/basketball/types";
import {
  BasketballPlayerTile,
  BASKETBALL_LINE_LABEL,
} from "@/components/basketball/BasketballPlayerTile";

/** Rows drawn top to bottom when the strategy plays lines. */
const LINE_ROWS: BasketballLine[] = ["forward", "guard"];

interface BasketballCourtProps {
  lineup: BasketballLineup;
  /** Places in each line (the shape), so short lines show empties. */
  lineCaps: Record<BasketballLine, number>;
  playersById: Map<string, Player>;
  /** A tile or an empty place was tapped: the kid ("" for empty) and where. */
  onTap: (playerId: string, line: BasketballLine) => void;
  onLongPress?: (playerId: string) => void;
  selectedPlayerId?: string | null;
  /** Dim the other tiles while one is selected (live play). */
  dimUnselected?: boolean;
  /** Kids marked to come off next: pair numbers. */
  swapOffs?: Map<string, number>;
  totalPairs?: number;
  swapDue?: boolean;
  totalMsByPlayer?: Record<string, number>;
  lineMsByPlayer?: Record<string, BasketballLineMs>;
  injuredIds?: string[];
  fouledOutIds?: string[];
  /** Each kid's fouls; omitted when the foul tally is off. */
  foulsByPlayer?: Record<string, number>;
  foulOutAt?: number;
  lockModes?: Record<string, "field" | "zone">;
  pointsByPlayer?: Record<string, number>;
  /** The position strategies: each kid's position label ("PG"). */
  positionLabels?: Record<string, string>;
}

const ORPHAN_WRAP = "col-span-2 mx-auto w-[calc(50%-0.25rem)]";

export function BasketballCourt({
  lineup,
  lineCaps,
  playersById,
  onTap,
  onLongPress,
  selectedPlayerId = null,
  dimUnselected = true,
  swapOffs,
  totalPairs,
  swapDue = false,
  totalMsByPlayer,
  lineMsByPlayer,
  injuredIds,
  fouledOutIds,
  foulsByPlayer,
  foulOutAt,
  lockModes,
  pointsByPlayer,
  positionLabels,
}: BasketballCourtProps) {
  const injuredSet = new Set(injuredIds ?? []);
  const fouledOutSet = new Set(fouledOutIds ?? []);
  const anySelected = selectedPlayerId !== null;
  const usesLines = lineup.lines.court.length === 0 && (lineCaps.court ?? 0) === 0;

  function emptyButton(line: BasketballLine, key: string | number) {
    return (
      <button
        key={key}
        type="button"
        onClick={() => onTap("", line)}
        aria-label={`Empty ${line === "court" ? "spot" : `${BASKETBALL_LINE_LABEL[line].toLowerCase().replace(/s$/, "")} spot`}`}
        className="w-full rounded-md border border-dashed border-white/40 bg-white/5 py-3 text-center font-mono text-nano font-semibold uppercase tracking-micro text-white/70 transition-colors duration-fast ease-out-quart hover:border-white/70 hover:bg-white/15"
      >
        {anySelected ? "Move here" : "Empty"}
      </button>
    );
  }

  function tile(pid: string, line: BasketballLine) {
    const player = playersById.get(pid);
    if (!player) return null;
    const isSelected = selectedPlayerId === pid;
    const out = injuredSet.has(pid) || fouledOutSet.has(pid);
    return (
      <BasketballPlayerTile
        player={player}
        line={line}
        positionLabel={positionLabels?.[pid]}
        onClick={out ? undefined : () => onTap(pid, line)}
        onLongPress={onLongPress ? () => onLongPress(pid) : undefined}
        selected={isSelected}
        dimmed={dimUnselected && anySelected ? !isSelected : false}
        swap={swapOffs?.has(pid) ? { role: "off", pair: swapOffs.get(pid)!, totalPairs } : null}
        totalMs={totalMsByPlayer?.[pid]}
        lineMs={lineMsByPlayer?.[pid]}
        injured={injuredSet.has(pid) && !fouledOutSet.has(pid)}
        fouledOut={fouledOutSet.has(pid)}
        fouls={foulsByPlayer ? (foulsByPlayer[pid] ?? 0) : null}
        foulOutAt={foulOutAt}
        lockMode={lockModes?.[pid] ?? null}
        points={pointsByPlayer?.[pid]}
        swapDue={swapDue}
      />
    );
  }

  /** One line: its kids then its empty places, two to a row, an odd one centred. */
  function lineGrid(line: BasketballLine, ids: string[], cap: number) {
    const slotCount = Math.max(cap, ids.length);
    if (slotCount === 0) return null;
    const orphanIdx = slotCount % 2 === 1 ? slotCount - 1 : -1;
    return (
      <div role="group" aria-label={BASKETBALL_LINE_LABEL[line]} className="grid grid-cols-2 gap-2">
        {Array.from({ length: slotCount }).map((_, slot) => {
          const pid = ids[slot];
          const content = pid ? tile(pid, line) : emptyButton(line, `empty-${slot}`);
          // Keyed by slot, not player: a swap hands the same tile over.
          return slot === orphanIdx ? (
            <div key={`slot-${slot}`} className={ORPHAN_WRAP}>
              {content}
            </div>
          ) : (
            <Fragment key={`slot-${slot}`}>{content}</Fragment>
          );
        })}
      </div>
    );
  }

  const rows = usesLines
    ? LINE_ROWS.filter((line) => Math.max(lineCaps[line] ?? 0, lineup.lines[line].length) > 0)
    : [];

  return (
    <div role="region" aria-label="On court" className="relative rounded-[18px] bg-court shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
      <div className="relative overflow-hidden rounded-[18px]">
        <CourtMarkings />
        <div className="relative space-y-2 px-5 pb-8 pt-10">
          {usesLines
            ? rows.map((line, idx) => (
                <Fragment key={line}>
                  {idx > 0 && <div className="relative -mx-5 h-px bg-white/[0.28]" aria-hidden />}
                  {lineGrid(line, lineup.lines[line], lineCaps[line] ?? 0)}
                </Fragment>
              ))
            : lineGrid("court", lineup.lines.court, lineCaps.court ?? 0)}
        </div>
      </div>
    </div>
  );
}

/**
 * Paint on the floor: the sideline, the key and the ring at the top, the
 * 3-point arc, and the halfway line's centre circle at the bottom.
 * Decoration only.
 */
function CourtMarkings() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-2 rounded-[10px] border-2 border-court-line" />
      {/* The key, the free-throw circle and the ring. */}
      <div className="absolute left-1/2 top-2 h-[34%] w-[34%] -translate-x-1/2 border-2 border-t-0 border-court-line bg-white/[0.06]" />
      <div className="absolute left-1/2 top-[calc(34%-36px+0.5rem)] h-[72px] w-[72px] -translate-x-1/2 rounded-full border-2 border-court-line" />
      <div className="absolute left-1/2 top-4 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-court-line" />
      {/* The 3-point arc. */}
      <div className="absolute left-1/2 top-2 h-[62%] w-[86%] -translate-x-1/2 rounded-b-full border-2 border-t-0 border-court-line" />
      {/* Halfway: the centre circle's top half. */}
      <div className="absolute bottom-2 left-1/2 h-9 w-[72px] -translate-x-1/2 rounded-t-full border-2 border-b-0 border-court-line" />
    </div>
  );
}
