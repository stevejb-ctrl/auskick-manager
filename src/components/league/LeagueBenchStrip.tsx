"use client";

// ─── LeagueBenchStrip ────────────────────────────────────────
// Bench player grid for the rugby-league live view. Mirrors AFL's
// `Bench.tsx` layout exactly — `grid-cols-4`, compact tile padding,
// "Bench (N)" eyebrow header — so the two sports read identically
// for coaches who switch between them.
//
// Bench players are tap targets — tapping one in live play
// surfaces "swap on for …" via the orchestrator. Long-press opens
// the per-player action sheet (mark injured, lend out, etc.).

import type { Player } from "@/lib/types";
import type { VestType } from "@/lib/sports/rugby_league/vests";
import type { PlayerConversionStatus } from "@/lib/sports/rugby_league/kicks";
import { LeaguePlayerTile } from "./LeaguePlayerTile";

interface LeagueBenchStripProps {
  players: Player[];
  triesByPlayer?: Record<string, number>;
  totalMsByPlayer?: Record<string, number>;
  vestByPlayer?: Record<string, VestType>;
  conversionByPlayer?: Record<string, PlayerConversionStatus>;
  kickoffTakerIds?: Set<string>;
  injuredIds?: Set<string>;
  loanedIds?: Set<string>;
  selectedPlayerId?: string | null;
  /**
   * Map of bench-player id → pair index (1-based) for suggested
   * subs ON. When a player is in this map their tile renders
   * with the brand-blue "coming on" treatment. Mirrors AFL
   * `Bench.tsx`'s `swapOns` prop.
   */
  swapOns?: Map<string, number>;
  /** Total pairs in the current rotation — drives the per-tile
   *  pair-number badge for multi-swap rotations. */
  totalSwapPairs?: number;
  /** Per-chip modes from the team row. Forwarded to bench tiles
   *  so zone-mode chips render the F/B letter overlay. */
  chipModes?: Partial<
    Record<import("@/lib/chips").ChipKey, import("@/lib/chips").ChipMode>
  >;
  onPlayerClick?: (playerId: string) => void;
  onPlayerLongPress?: (playerId: string) => void;
  disabled?: boolean;
}

export function LeagueBenchStrip({
  players,
  triesByPlayer,
  totalMsByPlayer,
  vestByPlayer,
  conversionByPlayer,
  kickoffTakerIds,
  injuredIds,
  loanedIds,
  selectedPlayerId,
  swapOns,
  totalSwapPairs = 0,
  chipModes,
  onPlayerClick,
  onPlayerLongPress,
  disabled,
}: LeagueBenchStripProps) {
  return (
    <div className="rounded-md border border-hairline bg-surface p-2 shadow-card">
      <p className="mb-1.5 px-1 font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
        Bench ({players.length})
      </p>
      {players.length === 0 ? (
        <p className="px-1 py-2 text-xs text-ink-mute">Nobody on the bench</p>
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          {players.map((p) => (
            <LeaguePlayerTile
              key={p.id}
              player={p}
              variant="bench"
              tries={triesByPlayer?.[p.id] ?? 0}
              totalMs={totalMsByPlayer?.[p.id]}
              vest={vestByPlayer?.[p.id] ?? null}
              conversion={conversionByPlayer?.[p.id] ?? null}
              kickedOff={kickoffTakerIds?.has(p.id) ?? false}
              injured={injuredIds?.has(p.id) ?? false}
              loaned={loanedIds?.has(p.id) ?? false}
              selected={selectedPlayerId === p.id}
              swap={
                swapOns?.has(p.id)
                  ? {
                      role: "on",
                      pair: swapOns.get(p.id)!,
                      totalPairs: totalSwapPairs,
                    }
                  : null
              }
              chipModes={chipModes}
              onClick={onPlayerClick ? () => onPlayerClick(p.id) : undefined}
              onLongPress={
                onPlayerLongPress
                  ? () => onPlayerLongPress(p.id)
                  : undefined
              }
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}
