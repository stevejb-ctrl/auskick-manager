// ─── The keeper kit-up heads-up ───────────────────────────────
// Where keeper kit takes minutes to put on (hockey's
// SoccerFamilyRules.keeperKitUpSeconds), the live screen names next
// period's keeper a little before the break ("Mia's in goal next half:
// start kitting up"). The break then starts with that kid in goal, since
// they've been getting ready since. The name is kept per game and period
// in session storage: losing it only means the break suggests afresh.

import { soccerUnitOf, type SoccerLineup } from "@/lib/sports/soccer/lineup";
import { placeInSoccerLineup, swapInSoccerLineup } from "@/lib/sports/soccer/live";

export function kitUpKey(gameId: string, period: number): string {
  return `soccer-kitup:${gameId}:${period}`;
}

/** The keeper named in the kit-up heads-up for a period, if one was. */
export function readKitUp(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key) || null;
  } catch {
    return null;
  }
}

export function writeKitUp(key: string, playerId: string) {
  try {
    window.sessionStorage.setItem(key, playerId);
  } catch {
    // Storage blocked: the break suggests afresh, which is all that's lost.
  }
}

/**
 * The break's plan with the keeper the kit-up heads-up named in goal,
 * when they can still play. The planned keeper takes their place.
 */
export function withAnnouncedKeeper(
  plan: SoccerLineup | null,
  playerId: string | null,
  away: ReadonlySet<string>,
): SoccerLineup | null {
  if (!plan || !playerId || plan.keeper === playerId || away.has(playerId)) return plan;
  if (soccerUnitOf(plan, playerId) === null && !plan.bench.includes(playerId)) return plan;
  return plan.keeper ? swapInSoccerLineup(plan, plan.keeper, playerId) : placeInSoccerLineup(plan, playerId, "gk");
}
