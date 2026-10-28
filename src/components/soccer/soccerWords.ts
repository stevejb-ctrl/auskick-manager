// ─── The soccer family's words ───────────────────────────────
// Lines of copy the soccer-family screens share, from the sport's own
// rules.

import type { SoccerKeeperStrategy, SoccerSubMode } from "@/lib/sports/soccer/types";

/** How the keeper is chosen, in a line. */
export function soccerKeeperNote(strategy: SoccerKeeperStrategy, namedKeepers = 1): string {
  if (strategy === "turns") return "Everyone has a turn: the fewest keeper minutes go in next.";
  // "Keepers" with nobody marked yet: the keeper stays in goal, and the
  // coach is told where to name them (Stagehand round 7, 28 Oct 2026).
  if (strategy === "keepers" && namedKeepers === 0) {
    return "No keepers named yet, so your keeper stays in goal. Mark your keepers (Keen keeper, under Role) in How we play.";
  }
  if (strategy === "keepers") return "Your named keepers take turns.";
  return "";
}

/**
 * When subs happen, in a line ("3 sub windows a half, none in the last
 * 2 min"). `periodWord` is the age group's ("half", or hockey's
 * "quarter"); `rolling` is the sport's name for subs on the run
 * (`rules.rollingSubs.label`: futsal's "Flying subs").
 */
export function soccerSubModeNote(
  mode: SoccerSubMode,
  subIntervalSeconds: number | null,
  periodWord: string,
  rolling: string,
): string {
  if (mode.kind === "windows") {
    const cutoff = Math.round(mode.cutoffSeconds / 60);
    return `${mode.perPeriod} sub windows a ${periodWord}${cutoff > 0 ? `, none in the last ${cutoff} min` : ""}`;
  }
  return subIntervalSeconds ? `${rolling} every ${Math.round((subIntervalSeconds / 60) * 10) / 10} min` : rolling;
}
