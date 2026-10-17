// ─── Football (soccer)'s words ───────────────────────────────
// Lines of copy the soccer screens share, from soccer's own rules.

import type { SoccerKeeperStrategy, SoccerSubMode } from "@/lib/sports/soccer/types";

/** How the keeper is chosen, in a line. */
export function soccerKeeperNote(strategy: SoccerKeeperStrategy): string {
  if (strategy === "turns") return "Everyone has a turn: the fewest keeper minutes go in next.";
  if (strategy === "keepers") return "Your named keepers take turns.";
  return "";
}

/** When subs happen, in a line ("3 windows a half, none in the last 2 min"). */
export function soccerSubModeNote(mode: SoccerSubMode, subIntervalSeconds: number | null): string {
  if (mode.kind === "windows") {
    const cutoff = Math.round(mode.cutoffSeconds / 60);
    return `${mode.perHalf} sub windows a half${cutoff > 0 ? `, none in the last ${cutoff} min` : ""}`;
  }
  return subIntervalSeconds ? `Rolling subs every ${Math.round((subIntervalSeconds / 60) * 10) / 10} min` : "Rolling subs";
}
