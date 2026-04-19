"use client";

import { useLiveGame } from "@/lib/stores/liveGameStore";
import type { Player, Zone } from "@/lib/types";
import type { ZoneCaps } from "@/lib/fairness";
import { PlayerTile } from "@/components/live/PlayerTile";

interface FieldProps {
  playersById: Map<string, Player>;
  onTapField: (playerId: string, zone: Zone) => void;
  swapOffs?: Map<string, number>;
  totalMsByPlayer?: Record<string, number>;
  zoneMsByPlayer?: Record<string, { back: number; mid: number; fwd: number }>;
  injuredIds?: string[];
  zoneCaps: ZoneCaps;
}

const ZONES: { key: Zone; label: string; bg: string }[] = [
  { key: "fwd", label: "Forward", bg: "bg-red-50 border-red-100" },
  { key: "mid", label: "Midfield", bg: "bg-yellow-50 border-yellow-100" },
  { key: "back", label: "Back", bg: "bg-blue-50 border-blue-100" },
];

export function Field({ playersById, onTapField, swapOffs, totalMsByPlayer, zoneMsByPlayer, injuredIds, zoneCaps }: FieldProps) {
  const injuredSet = new Set(injuredIds ?? []);
  const lineup = useLiveGame((s) => s.lineup);
  const selected = useLiveGame((s) => s.selected);

  const selectedZone = selected?.kind === "field" ? selected.zone : null;

  return (
    <div className="space-y-2 rounded-lg border-2 border-green-200 bg-green-100/40 p-2">
      {ZONES.map(({ key, label, bg }) => {
        const ids = lineup[key];
        const dimZone = selected?.kind === "bench" ? false : selectedZone !== null && selectedZone !== key;
        return (
          <div
            key={key}
            className={`rounded-md border ${bg} p-2`}
          >
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {label}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: Math.max(zoneCaps[key], ids.length) }).map((_, idx) => {
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
                    selected={isSelected}
                    dimmed={dimZone}
                    swap={swapOffs?.has(pid) ? { role: "off", pair: swapOffs.get(pid)! } : null}
                    totalMs={totalMsByPlayer?.[pid]}
                    zoneMs={zoneMsByPlayer?.[pid]}
                    injured={injuredSet.has(pid)}
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
