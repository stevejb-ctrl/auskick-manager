// Season balance maths (UX plan §7.5) — one formula, every sport.
//
// For player p and unit u:
//   t(p,u)     target share: even across the units p may play, or the
//              player's preferred split
//   owed(p,u)  = t(p,u) × seasonOnField(p) − seasonTime(p,u),
//              in periods (÷ this game's period length), capped at ±2
//   score term = W_season × owed(p,u)
//
// Season balance decides WHERE kids play, never how much: who plays is
// still this game's minutes and the time floor.

import type { SportId } from "@/lib/sports/types";
import type { PlaybookSnapshot } from "./types";
import type { UnitTime } from "./seasonTime";

export type BalanceStrength = "light" | "balanced" | "strong";

export const BALANCE_STRENGTHS: { id: BalanceStrength; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "balanced", label: "Balanced" },
  { id: "strong", label: "Strong" },
];

/**
 * Points per period owed, per engine. AFL: Balanced tops out at 600
 * (2 periods × 300), below in-game variety (+1000) so "every zone this
 * game" still wins at zoned ages, but above same-as-last-quarter
 * (−800 ≈ 2.7 periods at Balanced) only when a kid is well short.
 * Netball: a real tier below "unplayed third this game" (+100,000) and
 * above same-third-as-last-quarter (−10,000).
 * Soccer: periods of this game's time in a line that a period owed is
 * worth. A half already played in a line counts −1, so Balanced tops
 * out at 0.8 (2 × 0.4) and a line not played this game still wins;
 * Strong (1.6) can outweigh it.
 */
export const SEASON_BALANCE_WEIGHT: Record<SportId, Record<BalanceStrength, number>> = {
  afl: { light: 150, balanced: 300, strong: 600 },
  netball: { light: 10_000, balanced: 20_000, strong: 40_000 },
  rugby_league: { light: 150, balanced: 300, strong: 600 },
  rugby_union: { light: 150, balanced: 300, strong: 600 },
  soccer: { light: 0.2, balanced: 0.4, strong: 0.8 },
  // Basketball's suggesters score as soccer's: a period already played
  // in a line (or position) counts −1, season debt is in periods.
  basketball: { light: 0.2, balanced: 0.4, strong: 0.8 },
  // Futsal and hockey run soccer's suggesters; touch and Oztag score
  // the same way (periods of a lane, season debt in periods).
  futsal: { light: 0.2, balanced: 0.4, strong: 0.8 },
  hockey: { light: 0.2, balanced: 0.4, strong: 0.8 },
  touch: { light: 0.2, balanced: 0.4, strong: 0.8 },
  oztag: { light: 0.2, balanced: 0.4, strong: 0.8 },
};

export const OWED_CAP_PERIODS = 2;

export function seasonBalanceWeight(sport: SportId, strength: BalanceStrength | null | undefined): number {
  if (!strength) return 0;
  return SEASON_BALANCE_WEIGHT[sport][strength];
}

/**
 * A game in progress plays the strategy and season balance it kicked
 * off with (games.playbook_snapshot), even if the coach changes How we
 * play mid-game. Roles stay live — they're about the kids. The same
 * rule for every sport's suggester input.
 */
export function withKickoffSnapshot<T extends { strategy: string; seasonWeight: number }>(
  sport: SportId,
  input: T,
  snapshot: Pick<PlaybookSnapshot, "strategy" | "seasonBalance"> | null | undefined,
): T {
  if (!snapshot) return input;
  return {
    ...input,
    strategy: snapshot.strategy,
    seasonWeight: seasonBalanceWeight(sport, snapshot.seasonBalance === "off" ? null : snapshot.seasonBalance),
  };
}

export interface OwedInput {
  /** The player's season ms per unit (from seasonTimeByUnit). */
  byUnit: Record<string, number> | undefined;
  /** Units this player may play (never-rules already removed). */
  units: string[];
  /** This game's period length, in ms. */
  periodMs: number;
  /**
   * Preferred split, e.g. { fwd: 0.6, mid: 0.2, back: 0.2 }. Normalised
   * over `units`; omitted = even.
   */
  target?: Record<string, number>;
}

/** Periods owed per unit: positive = owed time there, negative = over. */
export function periodsOwed({ byUnit, units, periodMs, target }: OwedInput): Record<string, number> {
  const out: Record<string, number> = {};
  if (units.length === 0 || !(periodMs > 0)) return out;
  const time = (u: string) => byUnit?.[u] ?? 0;
  const onField = units.reduce((s, u) => s + time(u), 0);
  const weights = units.map((u) => (target ? Math.max(0, target[u] ?? 0) : 1));
  const weightSum = weights.reduce((s, w) => s + w, 0) || units.length;
  units.forEach((u, i) => {
    const share = (target ? weights[i] : 1) / weightSum;
    const owed = (share * onField - time(u)) / periodMs;
    out[u] = Math.max(-OWED_CAP_PERIODS, Math.min(OWED_CAP_PERIODS, owed));
  });
  return out;
}

export interface SeasonGap {
  playerId: string;
  unit: string;
  /** Periods owed (positive), capped. */
  owed: number;
  /** True when the player has no time in this unit all season. */
  never: boolean;
}

/**
 * The biggest season gaps among the given players, for the rule check
 * ("Mia hasn't played defence this season", "Jack is 2 quarters short
 * at CHB"). Only gaps of at least `minOwed` periods are reported.
 */
export function biggestSeasonGaps(
  season: UnitTime,
  playerIds: string[],
  units: string[],
  periodMs: number,
  { limit = 3, minOwed = 1 }: { limit?: number; minOwed?: number } = {},
): SeasonGap[] {
  const gaps: SeasonGap[] = [];
  for (const pid of playerIds) {
    const owed = periodsOwed({ byUnit: season[pid], units, periodMs });
    for (const u of units) {
      if ((owed[u] ?? 0) >= minOwed) {
        gaps.push({ playerId: pid, unit: u, owed: owed[u], never: !(season[pid]?.[u] > 0) });
      }
    }
  }
  gaps.sort((a, b) => b.owed - a.owed || Number(b.never) - Number(a.never));
  return gaps.slice(0, limit);
}

/** Share of players whose every unit is within one period of even. */
export function playersWithinAPeriod(
  season: UnitTime,
  playerIds: string[],
  units: string[],
  periodMs: number,
): { within: number; total: number } {
  let within = 0;
  for (const pid of playerIds) {
    const owed = periodsOwed({ byUnit: season[pid], units, periodMs });
    if (units.every((u) => Math.abs(owed[u] ?? 0) < 1)) within++;
  }
  return { within, total: playerIds.length };
}
