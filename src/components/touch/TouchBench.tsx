"use client";

// ─── TouchBench ──────────────────────────────────────────────
// The bench under the field. Mirrors AFL's Bench (the reference),
// soccer's and basketball's: a "Bench (n)" card with a four-column grid
// of tiles. A kid who can't come on (hurt, lent) has their tap open
// their actions instead.

import type { Player } from "@/lib/types";
import type { TouchLineMs } from "@/lib/sports/touch/replay";
import type { TouchLine } from "@/lib/sports/touch/types";
import { LinePlayerTile, type LineTileCaption } from "@/components/live/LinePlayerTile";
import { TOUCH_BAR_ORDER, TOUCH_TILE_STYLES, touchTryChip } from "@/components/touch/touchWords";

interface TouchBenchProps {
  bench: string[];
  playersById: Map<string, Player>;
  onTap: (playerId: string) => void;
  onLongPress?: (playerId: string) => void;
  selectedPlayerId?: string | null;
  /** Dim bench tiles while another bench kid is selected (live play). */
  dimUnselected?: boolean;
  /** Kids marked to go on next: pair number and lane. */
  swapOns?: Map<string, { pair: number; line: TouchLine }>;
  totalPairs?: number;
  totalMsByPlayer?: Record<string, number>;
  lineMsByPlayer?: Record<string, TouchLineMs>;
  injuredIds?: string[];
  loanedIds?: string[];
  lockModes?: Record<string, "field" | "zone">;
  /** Tries each kid has scored; omitted when scoring is off. */
  triesByPlayer?: Record<string, number>;
  captions?: Record<string, LineTileCaption>;
}

export function TouchBench({
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
  loanedIds,
  lockModes,
  triesByPlayer,
  captions,
}: TouchBenchProps) {
  const injuredSet = new Set(injuredIds ?? []);
  const loanedSet = new Set(loanedIds ?? []);
  const benchSelected = selectedPlayerId !== null && bench.includes(selectedPlayerId);

  return (
    <div role="group" aria-label="Bench" className="rounded-md border border-hairline bg-surface p-2 shadow-card">
      <p className="mb-1.5 px-1 font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
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
              <LinePlayerTile
                key={pid}
                player={p}
                line={null}
                styles={TOUCH_TILE_STYLES}
                barOrder={TOUCH_BAR_ORDER}
                onClick={out ? (onLongPress ? () => onLongPress(pid) : undefined) : () => onTap(pid)}
                onLongPress={onLongPress ? () => onLongPress(pid) : undefined}
                selected={isSelected}
                dimmed={dimUnselected && benchSelected && !isSelected}
                swap={going ? { role: "on", pair: going.pair, line: going.line, totalPairs } : null}
                totalMs={totalMsByPlayer?.[pid]}
                lineMs={lineMsByPlayer?.[pid]}
                injured={injuredSet.has(pid)}
                loaned={loanedSet.has(pid)}
                lockMode={lockModes?.[pid] ?? null}
                score={triesByPlayer ? touchTryChip(triesByPlayer[pid]) : null}
                caption={captions?.[pid]}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
