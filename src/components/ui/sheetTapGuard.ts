// ─── The sheets' tap guard ───────────────────────────────────
// A coach taps + GOAL and the scorer sheet slides up under their
// finger: the next tap, aimed at where Mia's row will be, lands on the
// row above while it's still moving, and the goal goes to the wrong kid
// (Stagehand round 9, 9 Nov 2026: about ten runs, mostly the scorer).
// So a sheet takes no taps until it has settled: its entrance has run
// (animationend on the card), or the longest entrance has passed if the
// event never comes. With reduced motion there's no entrance and no
// wait.
//
// And a sheet that has just closed (a pick, Cancel) leaves a moment's
// shield over the screen, so a quick second tap doesn't land on the kid
// tile that was under the row (round 9: "my click landed on the bench
// card").
//
// Both are elements over what they guard, not swallowed events, so a
// tap does nothing visible and Playwright's own hit test waits them out.
// The pure part is here; useSheetTapGuard wires it to the three sheet
// primitives (Modal, ActionSheet, SlotFillSheet).

/** The longest sheet entrance is 240 ms (SlotFillSheet's rise on a phone); a margin over it. */
export const SHEET_SETTLE_FALLBACK_MS = 360;

/** How long the screen under a sheet that has just closed ignores taps. */
export const SHEET_CLOSE_SHIELD_MS = 280;

export interface SheetEntrance {
  openedAt: number;
  /** The card's entrance has run (or there was none). */
  done: boolean;
}

/** A sheet just put on screen: `animated` false (reduced motion) is settled already. */
export function sheetEntrance(openedAt: number, animated: boolean): SheetEntrance {
  return { openedAt, done: !animated };
}

/**
 * An animation ended in the sheet: only the card's own entrance settles
 * it, not a row's or a number's inside it.
 */
export function entranceEnded(state: SheetEntrance, onCard: boolean): SheetEntrance {
  return onCard && !state.done ? { ...state, done: true } : state;
}

/** When the close shield comes down: a second close in its window extends it. */
export function closeShieldUntil(currentUntil: number, now: number, ms = SHEET_CLOSE_SHIELD_MS): number {
  return Math.max(currentUntil, now + ms);
}
