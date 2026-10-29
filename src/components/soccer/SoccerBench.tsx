"use client";

// ─── SoccerBench ─────────────────────────────────────────────
// The bench under the pitch. Mirrors AFL's Bench (the reference): a
// "Bench (n)" card with a four-column grid of tiles. An injured or lent
// kid can't be subbed on, so their tap opens their actions instead.

import type { Player } from "@/lib/types";
import type { SoccerUnitMs } from "@/lib/sports/soccer/replay";
import type { SoccerUnit, SoccerUnitWords } from "@/lib/sports/soccer/types";
import { SoccerPlayerTile } from "@/components/soccer/SoccerPlayerTile";

interface SoccerBenchProps {
  /** The sport's words for each unit (SoccerFamilyRules.lineLabels). */
  words: Record<SoccerUnit, SoccerUnitWords>;
  bench: string[];
  playersById: Map<string, Player>;
  onTap: (playerId: string) => void;
  onLongPress?: (playerId: string) => void;
  selectedPlayerId?: string | null;
  /** Dim bench tiles while another bench kid is selected (live play). */
  dimUnselected?: boolean;
  /** Kids marked to go on next: pair number and where. */
  swapOns?: Map<string, { pair: number; unit: SoccerUnit }>;
  totalPairs?: number;
  totalMsByPlayer?: Record<string, number>;
  unitMsByPlayer?: Record<string, SoccerUnitMs>;
  injuredIds?: string[];
  /** Sidelined kids who went home: HOME, not INJ (lib/live/wentHome). */
  wentHomeIds?: ReadonlySet<string>;
  loanedIds?: string[];
  lockModes?: Record<string, "field" | "zone">;
  goalsByPlayer?: Record<string, number>;
  keepOnIds?: Set<string>;
}

export function SoccerBench({
  words,
  bench,
  playersById,
  onTap,
  onLongPress,
  selectedPlayerId = null,
  dimUnselected = true,
  swapOns,
  totalPairs,
  totalMsByPlayer,
  unitMsByPlayer,
  injuredIds,
  wentHomeIds,
  loanedIds,
  lockModes,
  goalsByPlayer,
  keepOnIds,
}: SoccerBenchProps) {
  const injuredSet = new Set(injuredIds ?? []);
  const loanedSet = new Set(loanedIds ?? []);
  const benchSelected = selectedPlayerId !== null && bench.includes(selectedPlayerId);

  return (
    <div role="group" aria-label="Bench" className="rounded-md border border-hairline bg-surface p-2 shadow-card">
      <p className="mb-1.5 px-1 font-mono text-nano font-bold uppercase tracking-micro text-ink-dim">
        Bench ({bench.length})
      </p>
      {bench.length === 0 ? (
        <p className="px-1 py-2 text-xs text-ink-dim">Nobody on the bench</p>
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          {bench.map((pid) => {
            const p = playersById.get(pid);
            if (!p) return null;
            const out = injuredSet.has(pid) || loanedSet.has(pid);
            const isSelected = selectedPlayerId === pid;
            const going = swapOns?.get(pid);
            return (
              <SoccerPlayerTile
                key={pid}
                player={p}
                words={words}
                unit={null}
                onClick={out ? (onLongPress ? () => onLongPress(pid) : undefined) : () => onTap(pid)}
                onLongPress={onLongPress ? () => onLongPress(pid) : undefined}
                selected={isSelected}
                dimmed={dimUnselected && benchSelected && !isSelected}
                swap={going ? { role: "on", pair: going.pair, unit: going.unit, totalPairs } : null}
                totalMs={totalMsByPlayer?.[pid]}
                unitMs={unitMsByPlayer?.[pid]}
                injured={injuredSet.has(pid)}
                wentHome={wentHomeIds?.has(pid) ?? false}
                loaned={loanedSet.has(pid)}
                lockMode={lockModes?.[pid] ?? null}
                goals={goalsByPlayer?.[pid]}
                keepOn={keepOnIds?.has(pid)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
