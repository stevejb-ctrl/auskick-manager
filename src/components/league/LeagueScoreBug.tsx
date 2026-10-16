"use client";

import { rugbyScoreWords, type LeagueScore, type RugbyScoreWords } from "@/lib/sports/rugby_league/fairness";
import type { RugbySport } from "@/lib/sports/registry";
import { SCORE_CHIP } from "@/components/live/scoreChip";

// ─── LeagueScoreBug ──────────────────────────────────────────
// Rugby-league scoreboard contents rendered inside the shared
// LiveStickyScoreBar. Mirrors AFL `GameHeader` (broadcast scorebug)
// layout precisely:
//
//   Left  : team name + total points (big) + small T·C breakdown
//           + +T / +C action chips (own-team scoring); U13+
//           (international laws) adds PG·FG and a +PG / +FG row
//   Centre: dark clock pill — period chip on top, clock readout
//           big and bold below.
//   Right : opponent mirror — +T / +C, total points, T·C.
//
// Own-team +T / +C are wired by the parent to open a player picker
// for the scorer / kicker; the chips themselves don't mutate state
// until the coach picks a player. Mirrors AFL's onTeam(kind) shape.

interface LeagueScoreBugProps {
  /** The team's rugby sport: its goal names (union's drop goal is DG). */
  sport: RugbySport;
  teamName: string;
  opponentName: string;
  teamScore: LeagueScore;
  opponentScore: LeagueScore;
  periodLabel: string;
  periodLabelPlural: string;
  currentPeriod: number;
  periodCount: number;
  clockReadout: string;
  quarterEnded: boolean;
  /** Own-team +T tap — opens a scorer picker. */
  onTeamTry?: () => void;
  /** Own-team +C tap — opens a kicker picker / conversion dialog. */
  onTeamConversion?: () => void;
  /** Opponent +T tap — records an opp try directly. */
  onOpponentTry?: () => void;
  /** Opponent +C tap — records an opp conversion directly. */
  onOpponentConversion?: () => void;
  /** Whether conversion buttons should render (false for U6/U7). */
  kickingAllowed: boolean;
  /**
   * U13+ (international laws): penalty goals and field goals. Own-team
   * chips open the kicker picker; opponent chips record directly.
   */
  onTeamPenaltyGoal?: () => void;
  onTeamFieldGoal?: () => void;
  onOpponentPenaltyGoal?: () => void;
  onOpponentFieldGoal?: () => void;
  /** Track-scoring gate — hides every chip when false (U6 / U7 / scoring off). */
  trackScoring: boolean;
  /** Action in flight — disables tap targets. */
  pending: boolean;
  /** Whether the clock is currently running. Drives the ⏸/▶ icon. */
  running?: boolean;
  /** Tap on the dark clock pill — toggle pause/resume. */
  onClockTap?: () => void;
  /** End-period-early — surfaces below the clock when paused (AFL parity). */
}

/** "2T·1C·1PG" — penalty / field (drop) goals only once there are some. */
function ScoreLine({ score, testId, words }: { score: LeagueScore; testId: string; words: RugbyScoreWords }) {
  const parts = [`${score.tries}T`, `${score.conversions}C`];
  if (score.penaltyGoals > 0) parts.push(`${score.penaltyGoals}${words.penaltyGoal.short}`);
  if (score.fieldGoals > 0) parts.push(`${score.fieldGoals}${words.fieldGoal.short}`);
  return (
    <span className="text-sm font-semibold text-ink-dim" data-testid={testId}>
      {parts.map((p, i) => (
        <span key={p}>
          {i > 0 && <span className="text-ink-mute">·</span>}
          {p}
        </span>
      ))}
    </span>
  );
}


export function LeagueScoreBug({
  sport,
  teamName,
  opponentName,
  teamScore,
  opponentScore,
  periodLabel,
  periodLabelPlural,
  currentPeriod,
  periodCount,
  clockReadout,
  quarterEnded,
  onTeamTry,
  onTeamConversion,
  onOpponentTry,
  onOpponentConversion,
  kickingAllowed,
  onTeamPenaltyGoal,
  onTeamFieldGoal,
  onOpponentPenaltyGoal,
  onOpponentFieldGoal,
  trackScoring,
  pending,
  running = true,
  onClockTap,
}: LeagueScoreBugProps) {
  const words = rugbyScoreWords(sport);
  const periodNoun = periodLabel.toUpperCase();
  const periodLabelLine
    = `${periodNoun} ${currentPeriod || 1}${quarterEnded ? " · over" : ""}`;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 px-4 py-3">
      {/* Left: home team */}
      <div className="min-w-0">
        <p className="truncate font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
          {teamName}
        </p>
        <p className="nums mt-0.5 flex flex-wrap items-baseline gap-x-1.5 font-mono leading-none text-ink">
          <span className="text-[36px] font-bold tracking-tightest" data-testid="league-points-team">
            {teamScore.points}
          </span>
          <ScoreLine score={teamScore} testId="league-score-line-team" words={words} />
        </p>
        {trackScoring && (onTeamTry || onTeamConversion || onTeamPenaltyGoal || onTeamFieldGoal) && (
          <div className="mt-1 flex flex-wrap gap-2">
            {onTeamTry && (
              <button
                type="button"
                onClick={onTeamTry}
                disabled={pending}
                className={SCORE_CHIP}
                aria-label="Record a try for our team"
              >
                +T
              </button>
            )}
            {kickingAllowed && onTeamConversion && (
              <button
                type="button"
                onClick={onTeamConversion}
                disabled={pending}
                className={SCORE_CHIP}
                aria-label="Record a conversion for our team"
              >
                +C
              </button>
            )}
            {onTeamPenaltyGoal && (
              <button
                type="button"
                onClick={onTeamPenaltyGoal}
                disabled={pending}
                className={SCORE_CHIP}
                aria-label={`Record a ${words.penaltyGoal.label.toLowerCase()} for our team`}
              >
                +{words.penaltyGoal.short}
              </button>
            )}
            {onTeamFieldGoal && (
              <button
                type="button"
                onClick={onTeamFieldGoal}
                disabled={pending}
                className={SCORE_CHIP}
                aria-label={`Record a ${words.fieldGoal.label.toLowerCase()} for our team`}
              >
                +{words.fieldGoal.short}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Centre: dark clock pill — tappable to pause/resume.
          Mirrors AFL `GameHeader`'s centre column exactly: pill
          shows the period label + ⏸/▶ state icon on top, big
          time readout below. When paused, an "End half early"
          chip drops in beneath the pill. */}
      <div className="flex flex-col items-center gap-1 self-center">
        <button
          type="button"
          onClick={onClockTap}
          disabled={!onClockTap || quarterEnded}
          className="flex flex-col items-center justify-center rounded-md bg-ink px-3 py-1.5 text-warm shadow-pop transition-colors duration-fast ease-out-quart hover:bg-ink/90 disabled:opacity-80"
          aria-label={
            onClockTap
              ? `Clock — ${periodNoun.charAt(0)}${currentPeriod || 1}, ${running ? "running" : "paused"}`
              : `${periodLabelLine}, ${clockReadout}`
          }
        >
          <span className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase leading-none tracking-micro text-warm/70">
            <span>{periodLabelLine}</span>
            {onClockTap && !quarterEnded && (
              <span aria-hidden>{running ? "⏸" : "▶"}</span>
            )}
          </span>
          <span
            className="nums mt-0.5 font-mono text-[22px] font-bold leading-none tracking-tightest text-warm"
            aria-live="polite"
          >
            {clockReadout}
          </span>
        </button>
        <p className="font-mono text-[9px] font-semibold uppercase tracking-micro text-ink-dim">
          of {periodCount} {periodLabelPlural}
        </p>
      </div>

      {/* Right: opponent (mirror) */}
      <div className="min-w-0 text-right">
        <p className="truncate font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
          {opponentName}
        </p>
        <p className="nums mt-0.5 flex flex-wrap items-baseline justify-end gap-x-1.5 font-mono leading-none text-ink">
          <ScoreLine score={opponentScore} testId="league-score-line-opponent" words={words} />
          <span className="text-[36px] font-bold tracking-tightest" data-testid="league-points-opponent">
            {opponentScore.points}
          </span>
        </p>
        {trackScoring && (onOpponentTry || onOpponentConversion || onOpponentPenaltyGoal || onOpponentFieldGoal) && (
          <div className="mt-1 flex flex-wrap justify-end gap-2">
            {onOpponentTry && (
              <button
                type="button"
                onClick={onOpponentTry}
                disabled={pending}
                className={SCORE_CHIP}
                aria-label="Record opponent try"
              >
                +T
              </button>
            )}
            {kickingAllowed && onOpponentConversion && (
              <button
                type="button"
                onClick={onOpponentConversion}
                disabled={pending}
                className={SCORE_CHIP}
                aria-label="Record opponent conversion"
              >
                +C
              </button>
            )}
            {onOpponentPenaltyGoal && (
              <button
                type="button"
                onClick={onOpponentPenaltyGoal}
                disabled={pending}
                className={SCORE_CHIP}
                aria-label={`Record opponent ${words.penaltyGoal.label.toLowerCase()}`}
              >
                +{words.penaltyGoal.short}
              </button>
            )}
            {onOpponentFieldGoal && (
              <button
                type="button"
                onClick={onOpponentFieldGoal}
                disabled={pending}
                className={SCORE_CHIP}
                aria-label={`Record opponent ${words.fieldGoal.label.toLowerCase()}`}
              >
                +{words.fieldGoal.short}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
