"use client";

import { Fragment } from "react";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import type { Player, PositionModel, Zone } from "@/lib/types";
import type { ZoneCaps, ZoneMinutes } from "@/lib/fairness";
import { positionsFor } from "@/lib/ageGroups";
import { PlayerTile } from "@/components/live/PlayerTile";

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
  playerScores,
  totalPairs,
  wakeUpKey = null,
}: FieldProps) {
  // displayCaps drives the rendered slot count; zoneCaps drives the
  // suggester / placement rules. They diverge only when on-field
  // size has been reduced below the age-group default — at which
  // point we want to render the missing positions as "Empty"
  // placeholders rather than silently shrinking the zone.
  const displayCaps = displayZoneCaps ?? zoneCaps;
  const injuredSet = new Set(injuredIds ?? []);
  const lockedSet = new Set(lockedIds ?? []);
  const lineup = useLiveGame((s) => s.lineup);
  const selected = useLiveGame((s) => s.selected);

  // Render attacking up the page: fwd first → back last.
  const zones = positionsFor(positionModel).slice().reverse();

  // Figure out which side-groups have content for the vertical labels.
  const groupsPresent = new Set(zones.map(sideGroupOf));
  const sideLabels = (["FORWARD", "CENTRE", "BACK"] as const).filter((g) =>
    groupsPresent.has(g)
  );

  return (
    <div
      className="relative bg-field shadow-card"
      style={{ borderRadius: "50% / 15%" }}
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
              borderRadius: "50% / 15%",
              "--siren-pulse-r": "40px",
            } as React.CSSProperties
          }
        />
      )}
      <div
        className="relative overflow-hidden"
        style={{ borderRadius: "50% / 15%" }}
      >
      {/* Oval pitch boundary marking */}
      <div
        className="pointer-events-none absolute inset-x-5 inset-y-3 border border-white/10"
        style={{ borderRadius: "50%" }}
        aria-hidden
      />
      {/* Centre circle */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15"
        aria-hidden
      />

      {/* Vertical side labels — left and right — split evenly by side-group */}
      <div
        className="pointer-events-none absolute inset-y-6 left-1 flex flex-col justify-around"
        aria-hidden
      >
        {sideLabels.map((label) => (
          <span
            key={`l-${label}`}
            className="font-mono text-[9px] font-bold uppercase tracking-micro text-white/50"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            {label}
          </span>
        ))}
      </div>
      <div
        className="pointer-events-none absolute inset-y-6 right-1 flex flex-col justify-around"
        aria-hidden
      >
        {sideLabels.map((label) => (
          <span
            key={`r-${label}`}
            className="font-mono text-[9px] font-bold uppercase tracking-micro text-white/50"
            style={{ writingMode: "vertical-rl" }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* Zone rows — generous horizontal padding pulls corner tiles away
          from the oval's inward curve so floating badges (score chip,
          swap header) never get clipped. Vertical padding clears the
          top/bottom arcs as well. */}
      <div className="relative space-y-2 px-10 py-9">
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
                <div className="relative -mx-10 h-px bg-white/30" aria-hidden />
              )}
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: slotCount }).map((_, slot) => {
                  const isOrphan = slot === orphanIdx;
                  const pid = ids[slot];
                  if (!pid) {
                    const button = (
                      <button
                        type="button"
                        onClick={() => onTapField("", key)}
                        className="w-full rounded-md border border-dashed border-white/40 bg-white/5 py-3 text-center font-mono text-[10px] font-semibold uppercase tracking-micro text-white/60 transition-colors duration-fast ease-out-quart hover:border-white/70 hover:bg-white/15"
                      >
                        Empty
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
                  const isSelected =
                    selected?.kind === "field" && selected.playerId === pid;
                  const dimmed =
                    selected?.kind === "field" ? !isSelected : false;
                  const tile = (
                    <PlayerTile
                      player={player}
                      currentZone={key}
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
                    />
                  );
                  return isOrphan ? (
                    <div key={pid} className={orphanWrapClass}>
                      {tile}
                    </div>
                  ) : (
                    <Fragment key={pid}>{tile}</Fragment>
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
