// ─── Period break config ─────────────────────────────────────
// What the one break screen says about a sport, resolved for a game:
// the period's name ("Q3", "2nd half"), the break's ("Q2 break",
// "Half-time"), the zones in display order with their slots, whether
// tiles show jumper numbers, how the score reads, and when a kid's game
// time turns orange. Built from the sport's own config (`periodBreak`,
// `periodLabel`, `jerseyNumbers`, `scoreTypes`); the screen reads only
// this, never the sport id (docs/handoffs/siren-footy-break-redesign-
// HANDOFF.md, section 1).

import type { AgeGroupConfig, BreakZoneDef, SportId } from "@/lib/sports/types";
import { getSportConfig, periodLabels } from "@/lib/sports";

export interface BreakScoreInput {
  /** Our tally per own score type id, e.g. AFL { goal: 2, behind: 0 }. */
  us: Readonly<Record<string, number>>;
  /** Theirs, keyed by the same (own) score type ids. */
  them: Readonly<Record<string, number>>;
  /**
   * Points already added up, for a sport whose live state keeps points
   * rather than a tally per score type (basketball, rugby). Wins over
   * the tallies for the main line and the margin.
   */
  points?: { us: number; them: number };
}

export interface BreakScoreLine {
  /** "12 – 0" (points for every sport). */
  main: string;
  /** "2.0 v 0.0" for AFL; "Goals" or "Points" elsewhere. */
  detail: string;
  /** Our points minus theirs. */
  margin: number;
}

export interface SportBreakConfig {
  /** The period's name: "Q3", "2nd half". */
  periodName: (n: number) => string;
  /** The break after period `n`: "Q2 break", "Half-time". */
  breakName: (n: number) => string;
  /** The field's zones, attack first; the bench follows. */
  zones: BreakZoneDef[];
  showJumperNumbers: boolean;
  formatScore: (score: BreakScoreInput) => BreakScoreLine;
  /** Game time turns orange this far under the team average. */
  lowTimeMs: number;
}

type PeriodWord = "quarter" | "half" | "period";

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** "Q3", "2nd half", "Period 3". */
export function periodName(word: PeriodWord, n: number): string {
  if (word === "quarter") return `Q${n}`;
  if (word === "half") return `${ordinal(n)} half`;
  return `Period ${n}`;
}

/** The break after period `n`: "Q2 break", "Half-time", "Period 2 break". */
export function breakName(word: PeriodWord, n: number): string {
  if (word === "quarter") return `Q${n} break`;
  if (word === "half") return n === 1 ? "Half-time" : `${ordinal(n)} half break`;
  return `Period ${n} break`;
}

/**
 * The line under "Quarter 2 complete" when a period ends: "That's the
 * final siren!" after the last (the sport's own end cue), "Half-time —
 * Q3 is next." at the middle of a quarters game, else the break's name.
 */
export function periodEndLine(sport: SportId, word: PeriodWord, n: number, periodCount: number): string {
  if (n >= periodCount) return `That's the final ${getSportConfig(sport).words.endCue}!`;
  const brk =
    word === "quarter" ? (n * 2 === periodCount ? "Half-time" : "Quarter break") : breakName(word, n);
  return `${brk} — ${periodName(word, n + 1)} is next.`;
}

export function breakConfigFor(
  sport: SportId,
  ageGroup: AgeGroupConfig,
  game: { onFieldSize: number; shape?: Readonly<Record<string, number>> },
): SportBreakConfig {
  const cfg = getSportConfig(sport);
  const { label } = periodLabels(sport, ageGroup);
  const own = cfg.scoreTypes.filter((t) => !t.opponent);
  const points = (tally: Readonly<Record<string, number>>) =>
    own.reduce((sum, t) => sum + (tally[t.id] ?? 0) * t.points, 0);
  const { scoreDetail } = cfg.periodBreak;

  return {
    periodName: (n) => periodName(label, n),
    breakName: (n) => breakName(label, n),
    zones: cfg.periodBreak.zones({ ageGroup, onFieldSize: game.onFieldSize, shape: game.shape }),
    showJumperNumbers: cfg.jerseyNumbers,
    formatScore: ({ us, them, points: given }) => {
      const ours = given?.us ?? points(us);
      const theirs = given?.them ?? points(them);
      const tallyOf = (t: Readonly<Record<string, number>>) => own.map((s) => t[s.id] ?? 0).join(".");
      return {
        main: `${ours} – ${theirs}`,
        detail:
          scoreDetail === "goals-behinds"
            ? `${tallyOf(us)} v ${tallyOf(them)}`
            : scoreDetail === "goals"
              ? "Goals"
              : "Points",
        margin: ours - theirs,
      };
    },
    lowTimeMs: cfg.periodBreak.lowTimeMs,
  };
}
