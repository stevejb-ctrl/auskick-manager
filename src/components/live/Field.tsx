"use client";

import { useLiveGame } from "@/lib/stores/liveGameStore";
import type { Player, PositionModel, Zone } from "@/lib/types";
import type { ZoneCaps, ZoneMinutes } from "@/lib/fairness";
import { positionsFor, ZONE_LABELS } from "@/lib/ageGroups";
import { PlayerTile } from "@/components/live/PlayerTile";

interface FieldProps {
  playersById: Map<string, Player>;
  onTapField: (playerId: string, zone: Zone) => void;
  swapOffs?: Map<string, number>;
  totalMsByPlayer?: Record<string, number>;
  zoneMsByPlayer?: Record<string, ZoneMinutes>;
  injuredIds?: string[];
  lockedIds?: string[];
  onLongPress?: (playerId: string) => void;
  zoneCaps: ZoneCaps;
  positionModel: PositionModel;
  playerScores?: Record<string, { goals: number; behinds: number }>;
}

const ZONE_BG: Record<Zone, string> = {
  fwd: "bg-red-50 border-red-100",
  hfwd: "bg-orange-50 border-orange-100",
  mid: "bg-yellow-50 border-yellow-100",
  hback: "bg-sky-50 border-sky-100",
  back: "bg-blue-50 border-blue-100",
};

export function Field({
  playersById,
  onTapField,
  swapOffs,
  totalMsByPlayer,
  zoneMsByPlayer,
  injuredIds,
  lockedIds,
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
  // Render fwd → ... → back (attacking up the page).
  const zones = positionsFor(positionModel).slice().reverse();

  return (
    <div className="space-y-2 rounded-lg border-2 border-green-200 bg-green-100/40 p-2">
      {zones.map((key) => {
        const ids = lineup[key];
        const cap = zoneCaps[key] ?? 0;
        if (cap === 0 && ids.length === 0) return null;
        const dimZone = selected?.kind === "bench" ? false : selectedZone !== null && selectedZone !== key;
        return (
          <div
            key={key}
            className={`rounded-md border ${ZONE_BG[key]} p-2`}
          >
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {ZONE_LABELS[key]}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: Math.max(cap, ids.length) }).map((_, idx) => {
                const pid = ids[idx];
                if (!pid) {
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onTapField("", key)}
                      className="rounded-md border border-dashed border-gray-300 bg-white/50 py-3 text-center text-[10px] text-gray-400 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                    >
                      empty
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
                    onClick={injuredSet.has(pid) ? undefined : () => onTapField(pid, key)}
                    onLongPress={onLongPress ? () => onLongPress(pid) : undefined}
                    selected={isSelected}
                    dimmed={dimZone}
                    swap={swapOffs?.has(pid) ? { role: "off", pair: swapOffs.get(pid)! } : null}
                    totalMs={totalMsByPlayer?.[pid]}
                    zoneMs={zoneMsByPlayer?.[pid]}
                    injured={injuredSet.has(pid)}
                    locked={lockedSet.has(pid)}
                    score={playerScores?.[pid]}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
