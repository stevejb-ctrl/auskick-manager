// Touch's and Oztag's try events, as recordTouchScore writes them and
// replayTouchGame reads them: a try, or on a team whose girl's try counts
// 2 (Oztag mixed) a girl's try, ours or theirs. One rule for the server
// action and the live screen's optimistic tries (basketball's
// scoreEvents.ts is the same for its baskets).

import type { MixedGroup } from "@/lib/types";
import { TOUCH_SCORE_EVENTS } from "@/lib/sports/touch/replay";

export const TOUCH_SCORE_EVENT_TYPES: ReadonlySet<string> = new Set(TOUCH_SCORE_EVENTS);

export function touchTryEventType(side: "ours" | "theirs", girlsTry: boolean): string {
  if (side === "ours") return girlsTry ? "girls_try" : "try";
  return girlsTry ? "opponent_girls_try" : "opponent_try";
}

/**
 * Whether a try is a girl's try: only where a girl's try counts double.
 * Ours is the scorer's group; with no scorer (or theirs, whose scorer we
 * never know) it's what the coach tapped (`girl`).
 */
export function isGirlsTry(input: {
  girlsTryDouble: boolean;
  side: "ours" | "theirs";
  playerId: string | null;
  girl?: boolean;
  groupOf: (playerId: string) => MixedGroup | null | undefined;
}): boolean {
  if (!input.girlsTryDouble) return false;
  if (input.side === "theirs" || !input.playerId) return input.girl === true;
  return input.groupOf(input.playerId) === "girl";
}

/** What the undo strip says was scored ("try", "girl's try"). */
export function touchTryWhat(girlsTry: boolean): string {
  return girlsTry ? "girl's try" : "try";
}
