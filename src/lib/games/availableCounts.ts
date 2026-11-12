// ─── Games list: how many are in for each game ───────────────
// The Games list shows "available / squad" per game. The squad is the
// team's active kids, so the count must be too: a kid switched off on
// the Squad page keeps their availability rows (their past games need
// them), and counting those read "16/15" (Stagehand round 7, 28 Oct
// 2026).

export interface AvailabilityRowLike {
  game_id: string;
  player_id: string;
  status: string;
}

/** game id → how many active kids are marked available for it. */
export function availableCountsByGame(
  rows: readonly AvailabilityRowLike[],
  activePlayerIds: Iterable<string>,
): Map<string, number> {
  const active = new Set(activePlayerIds);
  const out = new Map<string, number>();
  for (const row of rows) {
    if (row.status !== "available" || !active.has(row.player_id)) continue;
    out.set(row.game_id, (out.get(row.game_id) ?? 0) + 1);
  }
  return out;
}
