"use client";

// ─── Netball Bench ───────────────────────────────────────────
// The bench under the live court: every available kid who isn't in a
// bib — on the bench, injured, or lent to the opposition. AFL's Bench
// (the reference), as touch's and soccer's are: a "Bench (n)" card of
// tiles in a four-column grid, each the shared LinePlayerTile with the
// kid's thirds as its time bar and everyone's time, 0:00 included.
//
// UX audit 23 Oct 2026: this used to be a sideways-scrolling strip of
// its own tiles with a "BENCH" eyebrow on each, an INJ chip drawn over
// the "INJURED" label ("INJ NJURED"), and no time on a healthy kid.
//
// Netball has no swaps during play (subs are at the breaks), so a tap
// or a long-press opens the kid's actions: mark recovered, bring back,
// injure, lend.

import type { PlayerThirdMs } from "@/lib/sports/netball/fairness";
import type { Player } from "@/lib/types";
import { LinePlayerTile, type TileLineStyle } from "@/components/live/LinePlayerTile";

export type OffCourtStatus = "bench" | "injured" | "loaned";

export interface OffCourtEntry {
  player: Player;
  status: OffCourtStatus;
}

// The court's thirds in the court's colours (attack orange, centre
// green, defence blue). Bench tiles have no line, so only the bar uses
// them.
const NETBALL_THIRD_STYLES: Record<keyof PlayerThirdMs, TileLineStyle> = {
  attack: { short: "", label: "Attack", textClass: "text-zone-f", fillClass: "bg-zone-f-fill", stripClass: "border-zone-f/40 bg-zone-f/15 text-zone-f" },
  centre: { short: "", label: "Centre", textClass: "text-zone-c", fillClass: "bg-zone-c-fill", stripClass: "border-zone-c/40 bg-zone-c/15 text-zone-c" },
  defence: { short: "", label: "Defence", textClass: "text-zone-b", fillClass: "bg-zone-b-fill", stripClass: "border-zone-b/40 bg-zone-b/15 text-zone-b" },
};
const NETBALL_BAR_ORDER = ["attack", "centre", "defence"] as const;

interface Props {
  entries: OffCourtEntry[];
  /** Per-player time this game by third: the bar and the time. */
  playerStats?: Map<string, PlayerThirdMs>;
  /** Per-player goals: the dark chip on a scorer's tile. */
  playerGoals?: Record<string, number>;
  /** Opens the kid's actions (a tap or a long-press). */
  onTileLongPress?: (playerId: string) => void;
}

export function NetballBenchStrip({ entries, playerStats, playerGoals, onTileLongPress }: Props) {
  if (entries.length === 0) return null;
  return (
    <div role="group" aria-label="Bench" className="rounded-md border border-hairline bg-surface p-2 shadow-card">
      <p className="mb-1.5 px-1 font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
        Bench ({entries.length})
      </p>
      <div className="grid grid-cols-4 gap-1.5">
        {entries.map(({ player, status }) => {
          const stats = playerStats?.get(player.id);
          const goals = playerGoals?.[player.id] ?? 0;
          const open = onTileLongPress ? () => onTileLongPress(player.id) : undefined;
          return (
            <LinePlayerTile
              key={player.id}
              // Netball has no jersey numbers on tiles (the bib is the
              // position); a squad carried over from another sport may
              // still have them.
              player={player.jersey_number == null ? player : { ...player, jersey_number: null }}
              line={null}
              styles={NETBALL_THIRD_STYLES}
              barOrder={NETBALL_BAR_ORDER}
              onClick={open}
              onLongPress={open}
              totalMs={stats ? stats.attack + stats.centre + stats.defence : 0}
              lineMs={stats ? { ...stats } : undefined}
              injured={status === "injured"}
              loaned={status === "loaned"}
              score={goals > 0 ? { text: String(goals), label: `${goals} goal${goals === 1 ? "" : "s"}` } : null}
            />
          );
        })}
      </div>
    </div>
  );
}
