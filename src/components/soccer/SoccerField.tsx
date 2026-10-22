"use client";

// ─── SoccerField ─────────────────────────────────────────────
// The Football (soccer) pitch for the live game, the lineup picker and
// half-time. Mirrors AFL's Field (the reference): the same green, inset
// edge and paint-like markings, lines as rows of a two-column grid with
// an odd tile centred, a hairline between lines, and dashed "Empty"
// placeholders. Attacking up the page: attack, midfield, defence, then
// the keeper alone in the goal mouth. 4 a side has no lines and no
// keeper: one group of kids.

import { Fragment } from "react";
import type { Player } from "@/lib/types";
import type { SoccerLineup } from "@/lib/sports/soccer/lineup";
import type { SoccerUnitMs } from "@/lib/sports/soccer/replay";
import type { SoccerLine, SoccerUnit } from "@/lib/sports/soccer/types";
import {
  SoccerPlayerTile,
  SOCCER_UNIT_LABEL,
} from "@/components/soccer/SoccerPlayerTile";

/** Rows drawn top to bottom when the shape has lines. */
const LINE_ROWS: SoccerLine[] = ["att", "mid", "def"];

interface SoccerFieldProps {
  lineup: SoccerLineup;
  /** Places in each line (the formation), so short lines show empties. */
  lineCaps: Record<SoccerLine, number>;
  /** The shape has a keeper (7 a side and up). */
  hasKeeper: boolean;
  playersById: Map<string, Player>;
  /** A tile or an empty place was tapped: the kid ("" for empty) and where. */
  onTap: (playerId: string, unit: SoccerUnit) => void;
  onLongPress?: (playerId: string) => void;
  selectedPlayerId?: string | null;
  /** Dim the other field tiles while one is selected (live play). */
  dimUnselected?: boolean;
  /** An empty place the coach aimed at first: its unit's empties glow. */
  primedEmptyUnit?: SoccerUnit | null;
  /** Kids marked to come off next: pair numbers. */
  swapOffs?: Map<string, number>;
  totalPairs?: number;
  swapDue?: boolean;
  totalMsByPlayer?: Record<string, number>;
  unitMsByPlayer?: Record<string, SoccerUnitMs>;
  injuredIds?: string[];
  /** Holds: "field" = Keep on / Keep in goal, "zone" = kept in a line. */
  lockModes?: Record<string, "field" | "zone">;
  goalsByPlayer?: Record<string, number>;
  positionLabels?: Record<string, string>;
  keepOnIds?: Set<string>;
  /** Bumped at kick-off: a one-shot halo around the pitch (AFL's wake-up). */
  wakeUpKey?: number | null;
}

const ORPHAN_WRAP = "col-span-2 mx-auto w-[calc(50%-0.25rem)]";

export function SoccerField({
  lineup,
  lineCaps,
  hasKeeper,
  playersById,
  onTap,
  onLongPress,
  selectedPlayerId = null,
  dimUnselected = true,
  primedEmptyUnit = null,
  swapOffs,
  totalPairs,
  swapDue = false,
  totalMsByPlayer,
  unitMsByPlayer,
  injuredIds,
  lockModes,
  goalsByPlayer,
  positionLabels,
  keepOnIds,
  wakeUpKey = null,
}: SoccerFieldProps) {
  const injuredSet = new Set(injuredIds ?? []);
  const anySelected = selectedPlayerId !== null;

  function emptyButton(unit: SoccerUnit, key: string | number) {
    const primed = primedEmptyUnit === unit;
    return (
      <button
        key={key}
        type="button"
        onClick={() => onTap("", unit)}
        aria-label={`Empty ${SOCCER_UNIT_LABEL[unit].toLowerCase()} spot`}
        className={`w-full rounded-md border border-dashed py-3 text-center font-mono text-[10px] font-semibold uppercase tracking-micro transition-colors duration-fast ease-out-quart ${
          primed
            ? "border-warn bg-warn/20 text-white"
            : "border-white/40 bg-white/5 text-white/60 hover:border-white/70 hover:bg-white/15"
        }`}
      >
        {primed ? "Tap a player" : anySelected ? "Move here" : "Empty"}
      </button>
    );
  }

  function tile(pid: string, unit: SoccerUnit) {
    const player = playersById.get(pid);
    if (!player) return null;
    const isSelected = selectedPlayerId === pid;
    return (
      <SoccerPlayerTile
        player={player}
        unit={unit}
        positionLabel={positionLabels?.[pid]}
        keepOn={keepOnIds?.has(pid)}
        onClick={injuredSet.has(pid) ? undefined : () => onTap(pid, unit)}
        onLongPress={onLongPress ? () => onLongPress(pid) : undefined}
        selected={isSelected}
        dimmed={dimUnselected && anySelected ? !isSelected : false}
        swap={swapOffs?.has(pid) ? { role: "off", pair: swapOffs.get(pid)!, totalPairs } : null}
        totalMs={totalMsByPlayer?.[pid]}
        unitMs={unitMsByPlayer?.[pid]}
        injured={injuredSet.has(pid)}
        lockMode={lockModes?.[pid] ?? null}
        goals={goalsByPlayer?.[pid]}
        swapDue={swapDue}
      />
    );
  }

  /** One line: its kids then its empty places, two to a row, an odd one centred. */
  function lineGrid(unit: SoccerLine, ids: string[], cap: number) {
    const slotCount = Math.max(cap, ids.length);
    if (slotCount === 0) return null;
    const orphanIdx = slotCount % 2 === 1 ? slotCount - 1 : -1;
    return (
      <div role="group" aria-label={SOCCER_UNIT_LABEL[unit]} className="grid grid-cols-2 gap-2">
        {Array.from({ length: slotCount }).map((_, slot) => {
          const pid = ids[slot];
          const content = pid ? tile(pid, unit) : emptyButton(unit, `empty-${slot}`);
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

  const rows = hasKeeper
    ? LINE_ROWS.filter((line) => Math.max(lineCaps[line] ?? 0, lineup.lines[line].length) > 0)
    : [];

  return (
    <div role="region" aria-label="On field" className="relative rounded-[18px] bg-field shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
      {wakeUpKey !== null && (
        <span
          key={wakeUpKey}
          aria-hidden="true"
          className="siren-pulse-once pointer-events-none absolute inset-0 rounded-[18px]"
          style={{ "--siren-pulse-r": "40px" } as React.CSSProperties}
        />
      )}
      <div className="relative overflow-hidden rounded-[18px]">
        <PitchMarkings />
        <div className="relative space-y-2 px-5 pb-6 pt-8">
          {hasKeeper ? (
            <>
              {rows.map((line, idx) => (
                <Fragment key={line}>
                  {idx > 0 && <div className="relative -mx-5 h-px bg-white/[0.28]" aria-hidden />}
                  {lineGrid(line, lineup.lines[line], lineCaps[line] ?? 0)}
                </Fragment>
              ))}
              {/* The keeper, alone in the goal mouth. */}
              <div role="group" aria-label={SOCCER_UNIT_LABEL.gk} className="grid grid-cols-2 gap-2 pt-3">
                <div className={ORPHAN_WRAP}>
                  {lineup.keeper ? tile(lineup.keeper, "gk") : emptyButton("gk", "empty-gk")}
                </div>
              </div>
            </>
          ) : (
            lineGrid("field", lineup.lines.field, lineCaps.field ?? 0)
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Paint on the grass: the touchlines, halfway line and centre circle,
 * and a penalty box and goal at each end. Decoration only.
 */
function PitchMarkings() {
  const line = "border-white/[0.22]";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className={`absolute inset-x-2.5 inset-y-2.5 rounded-[10px] border-[1.5px] ${line}`} />
      <div className="absolute inset-x-2.5 top-1/2 h-0 border-t-[1.5px] border-white/[0.18]" />
      <div className="absolute left-1/2 top-1/2 h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-white/[0.16]" />
      {/* Penalty boxes and goals: attack at the top, our goal at the bottom. */}
      <div className={`absolute left-1/2 top-2.5 h-14 w-[56%] -translate-x-1/2 border-x-[1.5px] border-b-[1.5px] ${line}`} />
      <div className={`absolute left-1/2 top-1 h-1.5 w-[22%] -translate-x-1/2 border-x-[1.5px] border-t-[1.5px] ${line}`} />
      <div className={`absolute bottom-2.5 left-1/2 h-24 w-[62%] -translate-x-1/2 border-x-[1.5px] border-t-[1.5px] ${line}`} />
      <div className={`absolute bottom-1 left-1/2 h-1.5 w-[24%] -translate-x-1/2 border-x-[1.5px] border-b-[1.5px] ${line}`} />
    </div>
  );
}
