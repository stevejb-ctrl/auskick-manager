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
}: FieldProps) {
  const injuredSet = new Set(injuredIds ?? []);
  const lockedSet = new Set(lockedIds ?? []);
  const lineup = useLiveGame((s) => s.lineup);
  const selected = useLiveGame((s) => s.selected);

  const selectedZone = selected?.kind === "field" ? selected.zone : null;
  // Render attacking up the page: fwd first → back last.
  const zones = positionsFor(positionModel).slice().reverse();

  // Figure out which side-groups have content for the vertical labels.
  const groupsPresent = new Set(zones.map(sideGroupOf));
  const sideLabels = (["FORWARD", "CENTRE", "BACK"] as const).filter((g) =>
    groupsPresent.has(g)
  );

  return (
    <div className="relative overflow-hidden rounded-xl bg-field shadow-card">
      {/* Soft oval highlight to suggest the pitch shape */}
      <div
        className="pointer-events-none absolute inset-x-6 inset-y-3 rounded-[50%] border border-white/10"
        aria-hidden
      />
      {/* Centre circle */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15"
        aria-hidden
      />

      {/* Vertical side labels — left and right — split evenly by side-group */}
      <div
        className="pointer-events-none absolute inset-y-3 left-1 flex flex-col justify-around"
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
        className="pointer-events-none absolute inset-y-3 right-1 flex flex-col justify-around"
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

      {/* Zone rows */}
      <div className="relative space-y-1.5 px-6 py-3">
        {zones.map((key, idx) => {
          const ids = lineup[key];
          const cap = zoneCaps[key] ?? 0;
          if (cap === 0 && ids.length === 0) return null;
          const dimZone =
            selected?.kind === "bench"
              ? false
              : selectedZone !== null && selectedZone !== key;

          const prevGroup = idx > 0 ? sideGroupOf(zones[idx - 1]) : null;
          const currGroup = sideGroupOf(key);
          const showDivider = prevGroup !== null && prevGroup !== currGroup;

          return (
            <Fragment key={key}>
              {showDivider && (
                <div className="relative -mx-6 h-px bg-white/30" aria-hidden />
              )}
              <div
                className={`grid gap-1.5 ${cap <= 2 ? "grid-cols-2" : "grid-cols-3"}`}
              >
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
                  return (
                    <PlayerTile
                      key={pid}
                      player={player}
                      currentZone={key}
                      onClick={injuredSet.has(pid) ? undefined : () => onTapField(pid, key)}
                      onLongPress={onLongPress ? () => onLongPress(pid) : undefined}
                      selected={isSelected}
                      dimmed={dimZone}
                      swap={
                        swapOffs?.has(pid)
                          ? { role: "off", pair: swapOffs.get(pid)! }
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
