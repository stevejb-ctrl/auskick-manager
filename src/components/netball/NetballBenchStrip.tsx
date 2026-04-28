"use client";

// ─── Netball Bench Strip ─────────────────────────────────────
// Horizontal strip rendered below the live court showing every
// available player who isn't currently in a position — bench, injured,
// or lent to opposition. Lets the coach see at a glance who's off, who
// might come on, and who's been ruled out.
//
// Visual language tracks the AFL Bench component (small tiles with
// name + time bar + badges) but trimmed: netball doesn't have jersey
// numbers, and there's no swap-tap interaction during live play, so
// tiles are tap-to-no-op + long-press for the actions menu (so you
// can mark a sidelined player recovered, or pre-place them via
// lock-for-next-break flow if they had a position context).

import { useRef } from "react";
import {
  formatMinSec,
  type PlayerThirdMs,
} from "@/lib/sports/netball/fairness";
import type { Player } from "@/lib/types";

const THIRD_BAR_COLOR = {
  attack: "bg-zone-f",
  centre: "bg-zone-c",
  defence: "bg-zone-b",
} as const;

export type OffCourtStatus = "bench" | "injured" | "loaned";

export interface OffCourtEntry {
  player: Player;
  status: OffCourtStatus;
}

interface Props {
  entries: OffCourtEntry[];
  /** Per-player time accumulated this game; drives the bar + total under each tile. */
  playerStats?: Map<string, PlayerThirdMs>;
  /** Per-player goals scored; drives the dark chip in each tile's top-right corner. */
  playerGoals?: Record<string, number>;
  /** Long-press fires the actions modal for that player (positionId stays null for bench targets). */
  onTileLongPress?: (playerId: string) => void;
}

export function NetballBenchStrip({
  entries,
  playerStats,
  playerGoals,
  onTileLongPress,
}: Props) {
  if (entries.length === 0) return null;
  return (
    <section className="rounded-md border border-hairline bg-surface p-3 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
          Bench
        </h3>
        <span className="text-[10px] tabular-nums text-ink-mute">
          {entries.length}
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {entries.map((e) => (
          <BenchTile
            key={e.player.id}
            entry={e}
            stats={playerStats?.get(e.player.id)}
            goalCount={playerGoals?.[e.player.id]}
            onLongPress={
              onTileLongPress ? () => onTileLongPress(e.player.id) : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}

// ─── Tile ────────────────────────────────────────────────────
function BenchTile({
  entry,
  stats,
  goalCount,
  onLongPress,
}: {
  entry: OffCourtEntry;
  stats?: PlayerThirdMs;
  goalCount?: number;
  onLongPress?: () => void;
}) {
  const { player, status } = entry;
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPressRef = useRef(false);

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (!onLongPress) return;
    didLongPressRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    longPressTimerRef.current = setTimeout(() => {
      didLongPressRef.current = true;
      longPressTimerRef.current = null;
      onLongPress();
    }, 500);
  }

  function cancelLongPress() {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  // Tile bg + border vary by status. Sidelined entries get a muted
  // surface-alt + grayscale to read as "not in the rotation".
  const baseBg =
    status === "injured"
      ? "border-danger/40 bg-surface"
      : status === "loaned"
      ? "border-warn/40 bg-surface"
      : "border-hairline bg-white";

  const total = stats ? stats.attack + stats.centre + stats.defence : 0;
  const pct = (v: number) => `${(v / (total || 1)) * 100}%`;

  // Pull "First L" display name like the on-court token.
  const parts = player.full_name.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? player.full_name;
  const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] : "";
  const display = lastInitial ? `${firstName} ${lastInitial}` : firstName;

  return (
    <button
      type="button"
      onPointerDown={onLongPress ? handlePointerDown : undefined}
      onPointerUp={onLongPress ? cancelLongPress : undefined}
      onPointerCancel={onLongPress ? cancelLongPress : undefined}
      className={[
        "relative flex w-24 flex-shrink-0 flex-col items-stretch rounded-md border px-2 py-1.5 text-center shadow-card transition-all duration-fast ease-out-quart",
        baseBg,
        status !== "bench" ? "grayscale" : "",
      ].join(" ")}
      aria-label={`${player.full_name} (${status})`}
    >
      {/* Goal-count chip — top-right, mirrors the court token. */}
      {goalCount !== undefined && goalCount > 0 && (
        <span
          className="nums absolute -right-1 -top-1.5 z-10 inline-flex items-center gap-0.5 rounded-xs bg-ink px-1 py-0.5 font-mono text-[9px] font-bold uppercase leading-none tracking-micro text-warm shadow-card"
          aria-label={`${goalCount} goal${goalCount === 1 ? "" : "s"}`}
        >
          {goalCount}
        </span>
      )}

      {/* Status chip — top-left, mirrors the court token's INJ / LENT badges. */}
      {status === "injured" && (
        <span
          className="absolute left-1 top-1 rounded-xs bg-danger px-1 font-mono text-[9px] font-bold uppercase leading-none tracking-micro text-white"
          aria-label="Injured"
        >
          INJ
        </span>
      )}
      {status === "loaned" && (
        <span
          className="absolute left-1 top-1 rounded-xs bg-warn px-1 font-mono text-[9px] font-bold uppercase leading-none tracking-micro text-white"
          aria-label="Lent to opposition"
        >
          LENT
        </span>
      )}

      {/* Status label (small) above the name — "BENCH", "INJURED", "LENT". */}
      <span className="font-mono text-[9px] font-bold uppercase leading-none tracking-micro text-ink-mute">
        {status === "bench" ? "Bench" : status === "injured" ? "Injured" : "On loan"}
      </span>
      <span className="mt-0.5 truncate text-sm font-bold leading-tight text-ink">
        {display}
      </span>

      {/* Total minutes — small monospace under the name. */}
      {total > 0 && (
        <span className="nums mt-0.5 font-mono text-[10px] font-semibold leading-none text-ink-dim">
          {formatMinSec(total)}
        </span>
      )}

      {/* Stacked time bar — same palette as the court token bars. */}
      {stats && total > 0 && (
        <span
          className="mt-0.5 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-alt"
          aria-label={`Attack ${formatMinSec(stats.attack)}, Centre ${formatMinSec(stats.centre)}, Defence ${formatMinSec(stats.defence)}`}
        >
          <span style={{ width: pct(stats.attack) }} className={THIRD_BAR_COLOR.attack} />
          <span style={{ width: pct(stats.centre) }} className={THIRD_BAR_COLOR.centre} />
          <span style={{ width: pct(stats.defence) }} className={THIRD_BAR_COLOR.defence} />
        </span>
      )}
    </button>
  );
}
