"use client";

import { Fragment } from "react";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import type { Lineup, Player, PositionModel, Zone } from "@/lib/types";
import type { ZoneCaps, ZoneMinutes } from "@/lib/fairness";
import { positionsFor, ZONE_LABELS } from "@/lib/ageGroups";
import { PlayerTile, type TileCaption } from "@/components/live/PlayerTile";
import type { ChipKey, ChipMode } from "@/lib/chips";

interface FieldProps {
  playersById: Map<string, Player>;
  onTapField: (playerId: string, zone: Zone) => void;
  swapOffs?: Map<string, number>;
  totalMsByPlayer?: Record<string, number>;
  zoneMsByPlayer?: Record<string, ZoneMinutes>;
  injuredIds?: string[];
  lockedIds?: string[];
  zoneLockedPlayers?: Record<string, Zone>;
  onLongPress?: (playerId: string) => void;
  zoneCaps: ZoneCaps;
  /**
   * Optional display caps (Steve 2026-05-20). When provided, the
   * grid renders slots against THESE caps instead of `zoneCaps`,
   * so reducing on-field size mid-game (e.g. 15→14 at Q-break)
   * still shows empty placeholder tiles for the missing
   * positions instead of silently shrinking the zone. Mirrors the
   * LineupPicker's existing `displayZoneCaps` / `zoneCaps` split.
   * Defaults to `zoneCaps` if omitted (legacy behaviour).
   */
  displayZoneCaps?: ZoneCaps;
  positionModel: PositionModel;
  /**
   * Team-level chip modes. Forwarded to PlayerTile so the inline
   * chip dot reads the same zone-colour palette the rest of the
   * app uses when a chip is position-linked. Steve 2026-05-20.
   */
  chipModeByKey?: Partial<Record<ChipKey, ChipMode>>;
  playerScores?: Record<string, { goals: number; behinds: number }>;
  totalPairs?: number;
  /**
   * Bumped by LiveGame when the game transitions pre-kickoff → Q1
   * running. Fires a one-shot brand halo around the oval pitch
   * perimeter — the "the game is on" ceremony moment. Null until
   * the first transition so freshly-mounted Field instances don't
   * pulse just because they appeared. P1.5-5 in
   * MICRO-INTERACTIONS-PLAN.md.
   */
  wakeUpKey?: number | null;
  /**
   * Planning screens (lineup picker, quarter break) draw their own draft
   * on the same field the live game uses (UX plan principle 2: one
   * lineup, one picture). Omit to read the live store.
   */
  lineup?: Lineup;
  /** The selected player; omit to read the live store's selection. */
  selectedPlayerId?: string | null;
  /** An empty slot the coach aimed at first — its zone's empties glow. */
  primedEmptyZone?: Zone | null;
  /**
   * Dim the other field tiles while one is selected. Live play dims
   * (field → field is a zone swap); planning screens swap freely.
   */
  dimUnselected?: boolean;
  /** Per-player tile captions ("STAYS", "BENCH → FWD"). */
  captions?: Record<string, TileCaption>;
  /** Set positions: playerId → position label shown on the tile. */
  positionLabels?: Record<string, string>;
  /** Kids with a season keep-on role (lineup screens). */
  keepOnIds?: Set<string>;
  /** The sub card is in its SUB DUE state — outgoing tiles go to the due ring + tint. */
  swapDue?: boolean;
}

/** Bucket fine-grained zones into the three side-label groups shown on the pitch. */
function sideGroupOf(zone: Zone): "FORWARD" | "CENTRE" | "BACK" {
  if (zone === "fwd" || zone === "hfwd") return "FORWARD";
  if (zone === "mid") return "CENTRE";
  return "BACK";
}

/** Short label shown on each player tile (FWD / CEN / BCK / H-FWD / H-BCK). */
export const ZONE_SHORT: Record<Zone, string> = {
  fwd: "FWD",
  hfwd: "H-FWD",
  mid: "CEN",
  hback: "H-BCK",
  back: "BCK",
};

export function Field({
  playersById,
  onTapField,
  swapOffs,
  totalMsByPlayer,
  zoneMsByPlayer,
  injuredIds,
  lockedIds,
  zoneLockedPlayers,
  onLongPress,
  zoneCaps,
  displayZoneCaps,
  positionModel,
  chipModeByKey,
  playerScores,
  totalPairs,
  wakeUpKey = null,
  lineup: lineupProp,
  selectedPlayerId,
  primedEmptyZone = null,
  dimUnselected = true,
  captions,
  positionLabels,
  keepOnIds,
  swapDue = false,
}: FieldProps) {
  // displayCaps drives the rendered slot count; zoneCaps drives the
  // suggester / placement rules. They diverge only when on-field
  // size has been reduced below the age-group default — at which
  // point we want to render the missing positions as "Empty"
  // placeholders rather than silently shrinking the zone.
  const displayCaps = displayZoneCaps ?? zoneCaps;
  const injuredSet = new Set(injuredIds ?? []);
  const lockedSet = new Set(lockedIds ?? []);
  const storeLineup = useLiveGame((s) => s.lineup);
  const storeSelected = useLiveGame((s) => s.selected);
  const lineup = lineupProp ?? storeLineup;
  const selectedFieldId =
    selectedPlayerId !== undefined
      ? selectedPlayerId
      : storeSelected?.kind === "field"
        ? storeSelected.playerId
        : null;
  const anySelected =
    selectedPlayerId !== undefined ? selectedPlayerId !== null : storeSelected !== null;

  // Render attacking up the page: fwd first → back last.
  const zones = positionsFor(positionModel).slice().reverse();

  // In-game re-skin (design session 17 Oct 2026): a flatter 12% oval
  // with a hairline inset edge instead of a drop shadow, a boundary
  // and centre circle drawn like paint, tighter padding (tiles 135 →
  // 151px wide at 390), and no vertical side rails — every tile names
  // its zone and the dividers split the lines.
  return (
    <div
      className="relative bg-field shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]"
      style={{ borderRadius: "50% / 12%" }}
    >
      {/* Q1-kickoff wake-up halo. Fires a one-shot brand pulse
          around the field's oval perimeter when `wakeUpKey`
          changes (LiveGame bumps it on pre-game → Q1 transition).
          The re-keyed span unmounts + remounts on each new
          wakeUpKey, restarting the `siren-pulse-once` keyframe
          from frame 0. `--siren-pulse-r` is bumped to 40px so the
          halo radiates further than the standard wordmark/clock
          beat — the field is a larger surface, deserves a more
          dramatic beat. Brand-aware automatically via the [data-
          brand] cascade in globals.css.

          The halo sits OUTSIDE the overflow-hidden inner div so
          its expanding box-shadow isn't clipped at the field
          edge. The outer div is `relative` (not `overflow-hidden`)
          to let the halo escape; clipping is moved to an inner
          wrapper around the pitch contents.

          P1.5-5 in MICRO-INTERACTIONS-PLAN.md. */}
      {wakeUpKey !== null && (
        <span
          key={wakeUpKey}
          aria-hidden="true"
          className="siren-pulse-once pointer-events-none absolute inset-0"
          style={
            {
              borderRadius: "50% / 12%",
              "--siren-pulse-r": "40px",
            } as React.CSSProperties
          }
        />
      )}
      <div
        className="relative overflow-hidden"
        style={{ borderRadius: "50% / 12%" }}
      >
      {/* Oval pitch boundary marking. */}
      <div
        className="pointer-events-none absolute inset-x-3 inset-y-2.5 border-[1.5px] border-white/[0.22]"
        style={{ borderRadius: "50%" }}
        aria-hidden
      />
      {/* Centre circle */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-white/[0.16]"
        aria-hidden
      />

      {/* Zone rows. Chips live inside the tiles now (no overhangs),
          so 24px sides clear the oval; 32px top/bottom clear the arcs. */}
      <div className="relative space-y-2 px-6 py-8">
        {zones.map((key, idx) => {
          const ids = lineup[key];
          const cap = zoneCaps[key] ?? 0;
          const displayCap = displayCaps[key] ?? cap;
          // Hide an entirely-empty zone only if BOTH the active cap
          // and the display cap are 0 — otherwise we'd lose empty
          // placeholders for a zone that's currently unfilled but
          // still has display slots reserved (e.g. forward zone
          // when the coach has reduced on-field count below the
          // forward's contribution).
          if (cap === 0 && displayCap === 0 && ids.length === 0) return null;
          const prevGroup = idx > 0 ? sideGroupOf(zones[idx - 1]) : null;
          const currGroup = sideGroupOf(key);
          const showDivider = prevGroup !== null && prevGroup !== currGroup;
          // Slot count drives both player tiles and empty placeholder
          // tiles in this zone's row of the 2-column grid.
          const slotCount = Math.max(displayCap, ids.length);
          // When the zone has an odd number of tiles, the last one
          // lands alone in the bottom row of a grid-cols-2 grid and
          // sits awkwardly left-aligned (Steve 2026-05-20: surfaced
          // by U13+ zones3 where the default 5-5-5 split puts the
          // 5th player in every zone on its own line). We span the
          // orphan tile across both columns and centre it via
          // mx-auto + a width that matches a normal half-cell, so
          // it visually sits in the centre of the zone rather than
          // left-pinned to column 1.
          const orphanIdx = slotCount > 0 && slotCount % 2 === 1 ? slotCount - 1 : -1;
          // 50% of grid - half of the 0.5rem (8px) gap = 50% - 0.25rem.
          // Matches the width a tile would occupy in a normal grid cell.
          const orphanWrapClass =
            "col-span-2 mx-auto w-[calc(50%-0.25rem)]";

          return (
            <Fragment key={key}>
              {showDivider && (
                <div className="relative -mx-6 h-px bg-white/[0.28]" aria-hidden />
              )}
              {/* Named group per zone so screen readers (and specs)
                  can tell which line a tile is on. */}
              <div role="group" aria-label={ZONE_LABELS[key]} className="grid grid-cols-2 gap-2">
                {Array.from({ length: slotCount }).map((_, slot) => {
                  const isOrphan = slot === orphanIdx;
                  const pid = ids[slot];
                  if (!pid) {
                    const primed = primedEmptyZone === key;
                    const button = (
                      <button
                        type="button"
                        onClick={() => onTapField("", key)}
                        aria-label={`Empty ${ZONE_SHORT[key]} spot`}
                        className={`w-full rounded-md border border-dashed py-3 text-center font-mono text-[10px] font-semibold uppercase tracking-micro transition-colors duration-fast ease-out-quart ${
                          primed
                            ? "border-warn bg-warn/20 text-white"
                            : "border-white/40 bg-white/5 text-white/60 hover:border-white/70 hover:bg-white/15"
                        }`}
                      >
                        {primed ? "Tap a player" : anySelected ? "Move here" : "Empty"}
                      </button>
                    );
                    return isOrphan ? (
                      <div key={slot} className={orphanWrapClass}>
                        {button}
                      </div>
                    ) : (
                      <Fragment key={slot}>{button}</Fragment>
                    );
                  }
                  const player = playersById.get(pid);
                  if (!player) return null;
                  const isSelected = selectedFieldId === pid;
                  const dimmed =
                    dimUnselected && selectedFieldId !== null ? !isSelected : false;
                  const tile = (
                    <PlayerTile
                      player={player}
                      currentZone={key}
                      positionLabel={positionLabels?.[pid]}
                      keepOn={keepOnIds?.has(pid)}
                      onClick={injuredSet.has(pid) ? undefined : () => onTapField(pid, key)}
                      onLongPress={onLongPress ? () => onLongPress(pid) : undefined}
                      selected={isSelected}
                      dimmed={dimmed}
                      swap={
                        swapOffs?.has(pid)
                          ? { role: "off", pair: swapOffs.get(pid)!, totalPairs }
                          : null
                      }
                      totalMs={totalMsByPlayer?.[pid]}
                      zoneMs={zoneMsByPlayer?.[pid]}
                      injured={injuredSet.has(pid)}
                      lockMode={
                        lockedSet.has(pid)
                          ? "field"
                          : zoneLockedPlayers?.[pid]
                            ? "zone"
                            : null
                      }
                      score={playerScores?.[pid]}
                      chipModes={chipModeByKey}
                      caption={captions?.[pid]}
                      swapDue={swapDue}
                    />
                  );
                  return isOrphan ? (
                    // Keyed by slot, not player: on a swap the same tile
                    // stays mounted and hands over (OFF n → ✓, the names
                    // roll) instead of one tile vanishing for another.
                    <div key={`slot-${slot}`} className={orphanWrapClass}>
                      {tile}
                    </div>
                  ) : (
                    <Fragment key={`slot-${slot}`}>{tile}</Fragment>
                  );
                })}
              </div>
            </Fragment>
          );
        })}
      </div>
      </div>
    </div>
  );
}
