"use client";

// ─── BasketballBench ─────────────────────────────────────────
// The bench under the court. Mirrors AFL's Bench (the reference) and
// soccer's: a "Bench (n)" card with a four-column grid of tiles. A kid
// who can't come on (hurt, lent, fouled out, sitting out) has their tap
// open their actions instead.

import type { Player } from "@/lib/types";
import type { BasketballLineMs } from "@/lib/sports/basketball/replay";
import type { BasketballLine } from "@/lib/sports/basketball/types";
import { BasketballPlayerTile } from "@/components/basketball/BasketballPlayerTile";

interface BasketballBenchProps {
  bench: string[];
  playersById: Map<string, Player>;
  onTap: (playerId: string) => void;
  onLongPress?: (playerId: string) => void;
  selectedPlayerId?: string | null;
  /** Dim bench tiles while another bench kid is selected (live play). */
  dimUnselected?: boolean;
  /** Kids marked to go on next: pair number, line and position. */
  swapOns?: Map<string, { pair: number; line: BasketballLine; positionLabel?: string | null }>;
  totalPairs?: number;
  totalMsByPlayer?: Record<string, number>;
  lineMsByPlayer?: Record<string, BasketballLineMs>;
  injuredIds?: string[];
  /** Sidelined kids who went home: HOME, not INJ (lib/live/wentHome). */
  wentHomeIds?: ReadonlySet<string>;
  loanedIds?: string[];
  fouledOutIds?: string[];
  /** Each kid's sit-out time left, in game ms. */
  sitOutMsLeft?: Record<string, number>;
  /** Each kid's fouls; omitted when the foul tally is off. */
  foulsByPlayer?: Record<string, number>;
  foulOutAt?: number;
  lockModes?: Record<string, "field" | "zone">;
  pointsByPlayer?: Record<string, number>;
}

export function BasketballBench({
  bench,
  playersById,
  onTap,
  onLongPress,
  selectedPlayerId = null,
  dimUnselected = true,
  swapOns,
  totalPairs,
  totalMsByPlayer,
  lineMsByPlayer,
  injuredIds,
  wentHomeIds,
  loanedIds,
  fouledOutIds,
  sitOutMsLeft,
  foulsByPlayer,
  foulOutAt,
  lockModes,
  pointsByPlayer,
}: BasketballBenchProps) {
  const injuredSet = new Set(injuredIds ?? []);
  const loanedSet = new Set(loanedIds ?? []);
  const fouledOutSet = new Set(fouledOutIds ?? []);
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
            const sitting = (sitOutMsLeft?.[pid] ?? 0) > 0;
            const out = injuredSet.has(pid) || loanedSet.has(pid) || fouledOutSet.has(pid) || sitting;
            const isSelected = selectedPlayerId === pid;
            const going = swapOns?.get(pid);
            return (
              <BasketballPlayerTile
                key={pid}
                player={p}
                line={null}
                onClick={out ? (onLongPress ? () => onLongPress(pid) : undefined) : () => onTap(pid)}
                onLongPress={onLongPress ? () => onLongPress(pid) : undefined}
                selected={isSelected}
                dimmed={dimUnselected && benchSelected && !isSelected}
                swap={going ? { role: "on", pair: going.pair, line: going.line, positionLabel: going.positionLabel, totalPairs } : null}
                totalMs={totalMsByPlayer?.[pid]}
                lineMs={lineMsByPlayer?.[pid]}
                injured={injuredSet.has(pid) && !fouledOutSet.has(pid)}
                wentHome={wentHomeIds?.has(pid) ?? false}
                loaned={loanedSet.has(pid)}
                fouledOut={fouledOutSet.has(pid)}
                sitOutMsLeft={sitOutMsLeft?.[pid] ?? null}
                fouls={foulsByPlayer ? (foulsByPlayer[pid] ?? 0) : null}
                foulOutAt={foulOutAt}
                lockMode={lockModes?.[pid] ?? null}
                points={pointsByPlayer?.[pid]}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
