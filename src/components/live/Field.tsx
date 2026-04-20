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
  positionModel: PositionModel;
  playerScores?: Record<string, { goals: number; behinds: number }>;
  totalPairs?: number;
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
  positionModel,
  playerScores,
  totalPairs,
}: FieldProps) {
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
      className="relative overflow-hidden bg-field shadow-card"
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
          if (cap === 0 && ids.length === 0) return null;
          const prevGroup = idx > 0 ? sideGroupOf(zones[idx - 1]) : null;
          const currGroup = sideGroupOf(key);
          const showDivider = prevGroup !== null && prevGroup !== currGroup;

          return (
            <Fragment key={key}>
              {showDivider && (
                <div className="relative -mx-10 h-px bg-white/30" aria-hidden />
              )}
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: Math.max(cap, ids.length) }).map((_, slot) => {
                  const pid = ids[slot];
                  if (!pid) {
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => onTapField("", key)}
                        className="rounded-md border border-dashed border-white/40 bg-white/5 py-3 text-center font-mono text-[10px] font-semibold uppercase tracking-micro text-white/60 transition-colors duration-fast ease-out-quart hover:border-white/70 hover:bg-white/15"
                      >
                        Empty
                      </button>
                    );
                  }
                  const player = playersById.get(pid);
                  if (!player) return null;
                  const isSelected =
                    selected?.kind === "field" && selected.playerId === pid;
                  const dimmed =
                    selected?.kind === "field" ? !isSelected : false;
                  return (
                    <PlayerTile
                      key={pid}
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
                })}
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
