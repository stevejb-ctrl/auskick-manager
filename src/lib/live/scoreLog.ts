// ─── The Fix-scores list ──────────────────────────────────────
// What ScoreReviewPanel lists at a break and at full time: each score
// still standing, grouped by the game's own periods (two halves, four
// quarters), and who it's put down to. Pure, so the panel's words are
// tested here.

/** A score as the game's score log reads it (getGameScoreLog's entries). */
export interface ScoreLogLike {
  id: string;
  type: "goal" | "behind" | "opponent_goal" | "opponent_behind" | "score_undo";
  player_id: string | null;
  quarter: number | null;
  /** A behind deflected through: ours, with no scorer. */
  rushed?: boolean;
  /** A goal the coach didn't see who scored. */
  unattributed?: boolean;
  target_event_id?: string | null;
  created_at: string;
}

/**
 * Who a score is put down to: the kid, "Rushed" for a rushed behind, "No
 * scorer" for one of ours nobody was credited with, "Opposition" for
 * theirs. A kid no longer in the list reads "—".
 */
export function scoreEntryWho(e: ScoreLogLike, nameOf: (playerId: string) => string | undefined): string {
  if (e.type === "opponent_goal" || e.type === "opponent_behind") return "Opposition";
  if (e.player_id) return nameOf(e.player_id) ?? "—";
  return e.rushed ? "Rushed" : "No scorer";
}

/**
 * The scores still standing (undos and what they undid left out), newest
 * first, in one group per period, 1 to `periodCount`, empty ones too. A
 * score booked to no period counts in the first; one booked past the
 * last period gets a group of its own after them.
 */
export function groupScoreLog<T extends ScoreLogLike>(
  log: readonly T[],
  periodCount: number,
): { period: number; entries: T[] }[] {
  const undone = new Set(log.filter((e) => e.type === "score_undo" && e.target_event_id).map((e) => e.target_event_id));
  const byPeriod = new Map<number, T[]>();
  for (let p = 1; p <= periodCount; p++) byPeriod.set(p, []);
  for (const e of log) {
    if (e.type === "score_undo" || undone.has(e.id)) continue;
    const p = e.quarter ?? 1;
    if (!byPeriod.has(p)) byPeriod.set(p, []);
    byPeriod.get(p)!.push(e);
  }
  return Array.from(byPeriod.entries())
    .sort(([a], [b]) => a - b)
    .map(([period, entries]) => ({
      period,
      entries: [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    }));
}
