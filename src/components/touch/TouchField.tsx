"use client";

// ─── TouchField ──────────────────────────────────────────────
// The touch and Oztag field for the live game, the lineup picker and
// half-time. Mirrors AFL's Field (the reference) and soccer's pitch: the
// same green, inset edge and paint-like markings, lanes as rows of a
// two-column grid with an odd tile centred, a hairline between lanes,
// and dashed "Empty" placeholders. The three lanes read centre out —
// middles, links, wings — as AFL reads back to front. Minutes only has
// no lanes: one group of kids.

import { Fragment } from "react";
import { sportSurface } from "@/components/live/sportSurface";
import type { Player } from "@/lib/types";
import type { TouchLineup } from "@/lib/sports/touch/lineup";
import type { TouchLineMs } from "@/lib/sports/touch/replay";
import { TOUCH_LANES, type TouchLine } from "@/lib/sports/touch/types";
import { LinePlayerTile } from "@/components/live/LinePlayerTile";
import {
  TOUCH_BAR_ORDER,
  TOUCH_LINE_LABEL,
  TOUCH_LINE_ONE,
  TOUCH_TILE_STYLES,
  touchTryChip,
} from "@/components/touch/touchWords";

interface TouchFieldProps {
  lineup: TouchLineup;
  /** Places in each lane (the shape), so short lanes show empties. */
  lineCaps: Record<TouchLine, number>;
  playersById: Map<string, Player>;
  /** A tile or an empty place was tapped: the kid ("" for empty) and where. */
  onTap: (playerId: string, line: TouchLine) => void;
  onLongPress?: (playerId: string) => void;
  selectedPlayerId?: string | null;
  /** Dim the other tiles while one is selected (live play). */
  dimUnselected?: boolean;
  /** Kids marked to come off next: pair numbers. */
  swapOffs?: Map<string, number>;
  totalPairs?: number;
  swapDue?: boolean;
  totalMsByPlayer?: Record<string, number>;
  lineMsByPlayer?: Record<string, TouchLineMs>;
  injuredIds?: string[];
  lockModes?: Record<string, "field" | "zone">;
  /** Tries each kid has scored; omitted when scoring is off. */
  triesByPlayer?: Record<string, number>;
  /** Kids a swap with the selected kid would break a rule for, and why: their tiles dim. */
  ruleNotes?: Record<string, string>;
}

const ORPHAN_WRAP = "col-span-2 mx-auto w-[calc(50%-0.25rem)]";

export function TouchField({
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
  lockModes,
  triesByPlayer,
  ruleNotes,
}: TouchFieldProps) {
  const injuredSet = new Set(injuredIds ?? []);
  const anySelected = selectedPlayerId !== null;
  const usesLanes = lineup.lines.field.length === 0 && (lineCaps.field ?? 0) === 0;

  function emptyButton(line: TouchLine, key: string | number) {
    return (
      <button
        key={key}
        type="button"
        onClick={() => onTap("", line)}
        aria-label={`Empty ${line === "field" ? "spot" : `${TOUCH_LINE_ONE[line]} spot`}`}
        className="w-full rounded-md border border-dashed border-white/40 bg-white/5 py-3 text-center font-mono text-nano font-semibold uppercase tracking-micro text-white/70 transition-colors duration-fast ease-out-quart hover:border-white/70 hover:bg-white/15"
      >
        {anySelected ? "Move here" : "Empty"}
      </button>
    );
  }

  function tile(pid: string, line: TouchLine) {
    const player = playersById.get(pid);
    if (!player) return null;
    const isSelected = selectedPlayerId === pid;
    return (
      <LinePlayerTile
        player={player}
        line={line}
        styles={TOUCH_TILE_STYLES}
        barOrder={TOUCH_BAR_ORDER}
        onClick={injuredSet.has(pid) ? undefined : () => onTap(pid, line)}
        onLongPress={onLongPress ? () => onLongPress(pid) : undefined}
        selected={isSelected}
        dimmed={dimUnselected && anySelected ? !isSelected : false}
        swap={swapOffs?.has(pid) ? { role: "off", pair: swapOffs.get(pid)!, totalPairs } : null}
        totalMs={totalMsByPlayer?.[pid]}
        lineMs={lineMsByPlayer?.[pid]}
        injured={injuredSet.has(pid)}
        lockMode={lockModes?.[pid] ?? null}
        score={triesByPlayer ? touchTryChip(triesByPlayer[pid]) : null}
        swapDue={swapDue}
        ruleNote={ruleNotes?.[pid] ?? null}
      />
    );
  }

  /** One lane: its kids then its empty places, two to a row, an odd one centred. */
  function laneGrid(line: TouchLine, ids: string[], cap: number) {
    const slotCount = Math.max(cap, ids.length);
    if (slotCount === 0) return null;
    const orphanIdx = slotCount % 2 === 1 ? slotCount - 1 : -1;
    return (
      <div role="group" aria-label={TOUCH_LINE_LABEL[line]} className="grid grid-cols-2 gap-2">
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

  const rows = usesLanes ? TOUCH_LANES.filter((line) => Math.max(lineCaps[line] ?? 0, lineup.lines[line].length) > 0) : [];

  return (
    <div role="region" aria-label="On field" className={`relative rounded-[18px] ${sportSurface("field")}`}>
      <div className="relative overflow-hidden rounded-[18px]">
        <FieldMarkings />
        <div className="relative space-y-2 px-5 pb-8 pt-8">
          {usesLanes
            ? rows.map((line, idx) => (
                <Fragment key={line}>
                  {idx > 0 && <div className="relative -mx-5 h-px bg-white/[0.28]" aria-hidden />}
                  {laneGrid(line, lineup.lines[line], lineCaps[line] ?? 0)}
                </Fragment>
              ))
            : laneGrid("field", lineup.lines.field, lineCaps.field ?? 0)}
        </div>
      </div>
    </div>
  );
}

/**
 * Paint on the grass: the sidelines, a try line and its in-goal at each
 * end, the halfway line, and the dashed 10 m lines either side of it.
 * Decoration only.
 */
function FieldMarkings() {
  const line = "border-white/[0.22]";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className={`absolute inset-x-2.5 inset-y-2.5 rounded-[10px] border-[1.5px] ${line}`} />
      {/* Try lines, with the in-goal beyond. */}
      <div className={`absolute inset-x-2.5 top-6 h-0 border-t-[1.5px] ${line}`} />
      <div className={`absolute inset-x-2.5 bottom-6 h-0 border-t-[1.5px] ${line}`} />
      <div className="absolute inset-x-2.5 top-2.5 h-3.5 bg-white/[0.04]" />
      <div className="absolute inset-x-2.5 bottom-2.5 h-3.5 bg-white/[0.04]" />
      {/* Halfway and the 10 m lines. */}
      <div className="absolute inset-x-2.5 top-1/2 h-0 border-t-[1.5px] border-white/[0.18]" />
      <div className="absolute inset-x-2.5 top-[36%] h-0 border-t-[1.5px] border-dashed border-white/[0.12]" />
      <div className="absolute inset-x-2.5 top-[64%] h-0 border-t-[1.5px] border-dashed border-white/[0.12]" />
    </div>
  );
}
