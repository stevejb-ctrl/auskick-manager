// Basketball's score events, as recordBasketballScore writes them and
// replayBasketballGame reads them (migration 0069): a free throw, a two
// or a three, ours or theirs. One list for the server action and the
// live screen's optimistic baskets.

export type BasketballPoints = 1 | 2 | 3;

export const BASKETBALL_OWN_SCORE = { 1: "free_throw", 2: "two_pointer", 3: "three_pointer" } as const;
export const BASKETBALL_OPPONENT_SCORE = {
  1: "opponent_free_throw",
  2: "opponent_two_pointer",
  3: "opponent_three_pointer",
} as const;

export const BASKETBALL_SCORE_EVENT_TYPES: ReadonlySet<string> = new Set([
  ...Object.values(BASKETBALL_OWN_SCORE),
  ...Object.values(BASKETBALL_OPPONENT_SCORE),
]);

export function basketballScoreEventType(side: "ours" | "theirs", points: BasketballPoints): string {
  return side === "ours" ? BASKETBALL_OWN_SCORE[points] : BASKETBALL_OPPONENT_SCORE[points];
}

/** "1 point", "2 points": what a basket was worth, in the coach's words. */
export function basketballPointsWords(points: number): string {
  return `${points} ${points === 1 ? "point" : "points"}`;
}
