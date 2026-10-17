// ─── Football (soccer) — who goes in goal ────────────────────
// The goalkeeper section of .planning/SOCCER-PLAN.md (decided 17 Oct
// 2026):
//   - U8–U11, "Everyone has a turn": one keeper a half, changed at
//     half-time. The kid with the fewest keeper minutes goes in, never a
//     kid marked "not in goal", and last half's keeper plays out in the
//     field.
//   - U12 up, "Keepers": the coach names one or more keepers and the
//     suggester rotates among them.
// Pure: the caller says who is here and their keeper minutes.

import type { SoccerKeeperStrategy } from "@/lib/sports/soccer/types";

/** A team's keeper prefs (How we play's role sheet, `player_position_prefs`). */
export interface SoccerKeeperPrefs {
  /** Marked "not in goal" (a `never` pref on gk): never suggested. */
  notInGoal?: readonly string[];
  /** Marked "keen keeper" (a `home` pref on gk): first among equals. */
  keenKeepers?: readonly string[];
  /** "Keepers": the kids the coach names, in rotation order. */
  namedKeepers?: readonly string[];
}

export interface PickSoccerKeeperInput {
  strategy: SoccerKeeperStrategy;
  /** Kids who could go in goal now (here, fit, not lent), in squad order. */
  candidates: readonly string[];
  prefs?: SoccerKeeperPrefs;
  /** Each kid's keeper ms so far: this season plus this game. */
  keeperMs?: Readonly<Record<string, number>>;
  /**
   * Each kid's time this game. The keeper plays the whole half, so among
   * equals the kid who has played least goes in: it evens game time.
   */
  gameMs?: Readonly<Record<string, number>>;
  /** Last half's keeper, at half-time. */
  lastKeeper?: string | null;
}

/**
 * The next keeper, or null when nobody should be suggested (no keeper at
 * this age, or every kid here is marked "not in goal": the coach picks).
 *
 * Turns: the fewest keeper minutes first; among equals keen keepers,
 * then the least time this game, then squad order; never a "not in
 * goal" kid; last half's keeper only when nobody else can go in.
 *
 * Keepers: the named keeper with the fewest keeper minutes, in named
 * order on a tie, moving on from last half's keeper when another named
 * keeper is here (one named keeper keeps goal). With none of them here,
 * everyone has a turn, as above.
 */
export function pickSoccerKeeper(input: PickSoccerKeeperInput): string | null {
  const { strategy, candidates, prefs = {}, keeperMs = {}, gameMs = {}, lastKeeper = null } = input;
  if (strategy === "none") return null;
  const ms = (pid: string) => keeperMs[pid] ?? 0;
  const here = new Set(candidates);
  const notLast = (pool: string[]) => {
    const others = pool.filter((p) => p !== lastKeeper);
    return others.length > 0 ? others : pool;
  };
  // The fewest keeper minutes; ties by `rank` (each part in turn).
  const fewest = (pool: string[], rank: (pid: string) => number[]) =>
    pool.reduce<string | null>((best, pid) => {
      if (best === null) return pid;
      const a = [ms(pid), ...rank(pid)];
      const b = [ms(best), ...rank(best)];
      const j = a.findIndex((v, i) => v !== b[i]);
      return j >= 0 && a[j] < b[j] ? pid : best;
    }, null);

  if (strategy === "keepers") {
    const named = (prefs.namedKeepers ?? []).filter((p) => here.has(p));
    if (named.length > 0) return fewest(notLast(named), (p) => [named.indexOf(p)]);
  }

  const never = new Set(prefs.notInGoal ?? []);
  const keen = new Set(prefs.keenKeepers ?? []);
  const willing = candidates.filter((p) => !never.has(p));
  if (willing.length === 0) return null;
  return fewest(notLast(willing), (p) => [keen.has(p) ? 0 : 1, gameMs[p] ?? 0, candidates.indexOf(p)]);
}
