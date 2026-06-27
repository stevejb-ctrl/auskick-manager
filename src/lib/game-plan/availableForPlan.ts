// ─── available-players-for-plan ───────────────────────────────────
// The Game Plan / next-period planner must only offer players who can
// actually take the field next period:
//   • PRESENT — in the current lineup (field/court + bench), so squad
//     members who didn't attend ("away") are excluded, and
//   • HEALTHY — not injured and not loaned out.
//
// Shared across AFL, netball and rugby league so the rule can't drift
// between sports (Steve 2026-06-15: a short-squad AFL game's next-quarter
// planner showed the FULL season squad, including injured + away players).
//
// Pure: no React, no DOM. Caller builds `inGameIds` from its own lineup
// shape (AFL zones / netball positions / RL forwards-backs) and passes
// the injured / loaned id sets.

export function availablePlayersForPlan<T extends { id: string }>(
  players: readonly T[],
  inGameIds: ReadonlySet<string>,
  injuredIds: ReadonlySet<string>,
  loanedIds: ReadonlySet<string>,
): T[] {
  return players.filter(
    (p) => inGameIds.has(p.id) && !injuredIds.has(p.id) && !loanedIds.has(p.id),
  );
}
