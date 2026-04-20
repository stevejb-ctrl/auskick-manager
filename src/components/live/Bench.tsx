"use client";

import { useLiveGame } from "@/lib/stores/liveGameStore";
import type { Player } from "@/lib/types";
import type { ZoneMinutes } from "@/lib/fairness";
import { PlayerTile } from "@/components/live/PlayerTile";

interface BenchProps {
  playersById: Map<string, Player>;
  onTapBench: (playerId: string) => void;
  swapOns?: Map<string, number>;
  totalMsByPlayer?: Record<string, number>;
  zoneMsByPlayer?: Record<string, ZoneMinutes>;
  injuredIds?: string[];
  lockedIds?: string[];
  onLongPress?: (playerId: string) => void;
  playerScores?: Record<string, { goals: number; behinds: number }>;
}

export function Bench({ playersById, onTapBench, swapOns, totalMsByPlayer, zoneMsByPlayer, injuredIds, lockedIds, onLongPress, playerScores }: BenchProps) {
  const injuredSet = new Set(injuredIds ?? []);
  const lockedSet = new Set(lockedIds ?? []);
  const lineup = useLiveGame((s) => s.lineup);
  const selected = useLiveGame((s) => s.selected);

  const benchActive = selected?.kind === "field";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
      <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        Bench ({lineup.bench.length})
      </p>
      {lineup.bench.length === 0 ? (
        <p className="px-1 py-2 text-xs text-gray-400">Nobody on the bench</p>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {lineup.bench.map((pid) => {
            const p = playersById.get(pid);
            if (!p) return null;
            const isSelected =
              selected?.kind === "bench" && selected.playerId === pid;
            return (
              <PlayerTile
                key={pid}
                player={p}
                onClick={injuredSet.has(pid) ? undefined : () => onTapBench(pid)}
                onLongPress={onLongPress ? () => onLongPress(pid) : undefined}
                selected={isSelected}
                dimmed={!benchActive && selected !== null}
                swap={swapOns?.has(pid) ? { role: "on", pair: swapOns.get(pid)! } : null}
                totalMs={totalMsByPlayer?.[pid]}
                zoneMs={zoneMsByPlayer?.[pid]}
                injured={injuredSet.has(pid)}
                locked={lockedSet.has(pid)}
                score={playerScores?.[pid]}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
