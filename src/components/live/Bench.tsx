"use client";

import { useLiveGame } from "@/lib/stores/liveGameStore";
import type { Player, Zone } from "@/lib/types";
import type { ZoneMinutes } from "@/lib/fairness";
import { PlayerTile } from "@/components/live/PlayerTile";

interface BenchProps {
  playersById: Map<string, Player>;
  onTapBench: (playerId: string) => void;
  swapOns?: Map<string, { pair: number; zone: Zone }>;
  totalMsByPlayer?: Record<string, number>;
  zoneMsByPlayer?: Record<string, ZoneMinutes>;
  injuredIds?: string[];
  lockedIds?: string[];
  zoneLockedPlayers?: Record<string, Zone>;
  onLongPress?: (playerId: string) => void;
  playerScores?: Record<string, { goals: number; behinds: number }>;
}

export function Bench({
  playersById,
  onTapBench,
  swapOns,
  totalMsByPlayer,
  zoneMsByPlayer,
  injuredIds,
  lockedIds,
  zoneLockedPlayers,
  onLongPress,
  playerScores,
}: BenchProps) {
  const injuredSet = new Set(injuredIds ?? []);
  const lockedSet = new Set(lockedIds ?? []);
  const lineup = useLiveGame((s) => s.lineup);
  const selected = useLiveGame((s) => s.selected);

  const benchActive = selected?.kind === "field";

  return (
    <div className="rounded-md border border-hairline bg-surface p-2 shadow-card">
      <p className="mb-1.5 px-1 font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
        Bench ({lineup.bench.length})
      </p>
      {lineup.bench.length === 0 ? (
        <p className="px-1 py-2 text-xs text-ink-mute">Nobody on the bench</p>
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          {lineup.bench.map((pid) => {
            const p = playersById.get(pid);
            if (!p) return null;
            const isSelected =
              selected?.kind === "bench" && selected.playerId === pid;
            return (
              <PlayerTile
                key={pid}
                player={p}
                currentZone={null}
                onClick={injuredSet.has(pid) ? undefined : () => onTapBench(pid)}
                onLongPress={onLongPress ? () => onLongPress(pid) : undefined}
                selected={isSelected}
                dimmed={!benchActive && selected !== null}
                swap={(() => {
                  const info = swapOns?.get(pid);
                  return info ? { role: "on", pair: info.pair, zone: info.zone } : null;
                })()}
                totalMs={totalMsByPlayer?.[pid]}
                zoneMs={zoneMsByPlayer?.[pid]}
                injured={injuredSet.has(pid)}
                lockMode={lockedSet.has(pid) ? "field" : zoneLockedPlayers?.[pid] ? "zone" : null}
                score={playerScores?.[pid]}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
