"use client";

import { useLiveGame } from "@/lib/stores/liveGameStore";
import type { Lineup, Player, Zone } from "@/lib/types";
import type { ZoneMinutes } from "@/lib/fairness";
import { PlayerTile, type TileCaption } from "@/components/live/PlayerTile";
import type { ChipKey, ChipMode } from "@/lib/chips";

interface BenchProps {
  playersById: Map<string, Player>;
  onTapBench: (playerId: string) => void;
  swapOns?: Map<string, { pair: number; zone: Zone }>;
  totalMsByPlayer?: Record<string, number>;
  zoneMsByPlayer?: Record<string, ZoneMinutes>;
  injuredIds?: string[];
  loanedIds?: string[];
  lockedIds?: string[];
  zoneLockedPlayers?: Record<string, Zone>;
  onLongPress?: (playerId: string) => void;
  playerScores?: Record<string, { goals: number; behinds: number }>;
  totalPairs?: number;
  /** Planning screens pass their draft; omit to read the live store. */
  lineup?: Lineup;
  /** The selected player; omit to read the live store's selection. */
  selectedPlayerId?: string | null;
  /** Dim bench tiles while another is selected (live only). */
  dimUnselected?: boolean;
  captions?: Record<string, TileCaption>;
  chipModeByKey?: Partial<Record<ChipKey, ChipMode>>;
}

export function Bench({
  playersById,
  onTapBench,
  swapOns,
  totalMsByPlayer,
  zoneMsByPlayer,
  injuredIds,
  loanedIds,
  lockedIds,
  zoneLockedPlayers,
  onLongPress,
  playerScores,
  totalPairs,
  lineup: lineupProp,
  selectedPlayerId,
  dimUnselected = true,
  captions,
  chipModeByKey,
}: BenchProps) {
  const injuredSet = new Set(injuredIds ?? []);
  const loanedSet = new Set(loanedIds ?? []);
  const lockedSet = new Set(lockedIds ?? []);
  const storeLineup = useLiveGame((s) => s.lineup);
  const storeSelected = useLiveGame((s) => s.selected);
  const lineup = lineupProp ?? storeLineup;
  const selectedBenchId =
    selectedPlayerId !== undefined
      ? selectedPlayerId
      : storeSelected?.kind === "bench"
        ? storeSelected.playerId
        : null;
  const dimOthers =
    dimUnselected && storeSelected !== null && storeSelected.kind !== "field";

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
            const isSelected = selectedBenchId === pid;
            return (
              <PlayerTile
                key={pid}
                player={p}
                currentZone={null}
                onClick={
                  injuredSet.has(pid) || loanedSet.has(pid)
                    ? // Injured / loaned players can't be subbed in the
                      // normal way, so a tap opens the action sheet —
                      // gives the coach a one-tap route to "Mark
                      // recovered" or "Bring back".
                      onLongPress
                      ? () => onLongPress(pid)
                      : undefined
                    : () => onTapBench(pid)
                }
                onLongPress={onLongPress ? () => onLongPress(pid) : undefined}
                selected={isSelected}
                dimmed={dimOthers && !isSelected}
                swap={(() => {
                  const info = swapOns?.get(pid);
                  return info ? { role: "on", pair: info.pair, zone: info.zone, totalPairs } : null;
                })()}
                totalMs={totalMsByPlayer?.[pid]}
                zoneMs={zoneMsByPlayer?.[pid]}
                injured={injuredSet.has(pid)}
                loaned={loanedSet.has(pid)}
                lockMode={lockedSet.has(pid) ? "field" : zoneLockedPlayers?.[pid] ? "zone" : null}
                score={playerScores?.[pid]}
                caption={captions?.[pid]}
                chipModes={chipModeByKey}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
