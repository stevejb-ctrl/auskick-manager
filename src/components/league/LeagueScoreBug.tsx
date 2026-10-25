"use client";

import { rugbyScoreWords, type LeagueScore, type RugbyScoreWords } from "@/lib/sports/rugby_league/fairness";
import type { RugbySport } from "@/lib/sports/registry";
import { RollingNumber } from "@/components/live/RollingNumber";
import { ScoreBugFrame, type ScoreChipSpec } from "@/components/live/ScoreBugFrame";

// ─── LeagueScoreBug ──────────────────────────────────────────
// Rugby's scorebug (league and union), inside the shared
// LiveStickyScoreBar, on the same layout as AFL's GameHeader and every
// sport's bug (UI polish round 2, Steve 23 Oct 2026):
//
//   Left  : team name (wraps rather than cuts off), the 44px total
//           rolling on a score, and the T·C (·PG·FG) tally.
//   Centre: the dark clock pill: H1 / Q1 with the live dot, the time.
//   Right : the opponent, mirrored.
//   Under : each team's chips in one row (+T +C, U13+ +PG +FG / DG).
//
// The rows are the shared ScoreBugFrame's (UX round 3, e4).
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
    <span className="text-[13px] font-medium text-ink-dim" data-testid={testId}>
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
  const periodTag = `${periodNoun.charAt(0)}${currentPeriod || 1}`;
  const periodLabelLine = `${periodNoun} ${currentPeriod || 1}${quarterEnded ? " · over" : ""}`;
  const live = running && !quarterEnded;
  const TOTAL = "text-[44px] font-bold leading-10 tracking-[-0.04em]";

  const ours: ScoreChipSpec[] = [
    ...(onTeamTry ? [{ key: "t", text: "+T", label: "Record a try for our team", onTap: onTeamTry }] : []),
    ...(kickingAllowed && onTeamConversion
      ? [{ key: "c", text: "+C", label: "Record a conversion for our team", onTap: onTeamConversion }]
      : []),
    ...(onTeamPenaltyGoal
      ? [{ key: "pg", text: `+${words.penaltyGoal.short}`, label: `Record a ${words.penaltyGoal.label.toLowerCase()} for our team`, onTap: onTeamPenaltyGoal }]
      : []),
    ...(onTeamFieldGoal
      ? [{ key: "fg", text: `+${words.fieldGoal.short}`, label: `Record a ${words.fieldGoal.label.toLowerCase()} for our team`, onTap: onTeamFieldGoal }]
      : []),
  ];
  const theirs: ScoreChipSpec[] = [
    ...(onOpponentTry ? [{ key: "t", text: "+T", label: "Record opponent try", onTap: onOpponentTry }] : []),
    ...(kickingAllowed && onOpponentConversion
      ? [{ key: "c", text: "+C", label: "Record opponent conversion", onTap: onOpponentConversion }]
      : []),
    ...(onOpponentPenaltyGoal
      ? [{ key: "pg", text: `+${words.penaltyGoal.short}`, label: `Record opponent ${words.penaltyGoal.label.toLowerCase()}`, onTap: onOpponentPenaltyGoal }]
      : []),
    ...(onOpponentFieldGoal
      ? [{ key: "fg", text: `+${words.fieldGoal.short}`, label: `Record opponent ${words.fieldGoal.label.toLowerCase()}`, onTap: onOpponentFieldGoal }]
      : []),
  ];
  const pill = (
    <button
      type="button"
      onClick={onClockTap}
      disabled={!onClockTap || quarterEnded}
      className="flex min-w-[104px] flex-col items-center justify-center rounded-md bg-ink px-4 pb-2.5 pt-2 text-warm shadow-[0_6px_16px_rgba(26,30,26,0.18)] transition-colors duration-fast ease-out-quart hover:bg-ink/90 disabled:opacity-80"
      aria-label={
        onClockTap
          ? `Clock — ${periodTag}, ${running ? "running" : "paused"}`
          : `${periodLabelLine}, ${clockReadout}`
      }
    >
      <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase leading-3 tracking-micro text-warm/[0.72]">
        {live && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-mint" />}
        <span>{quarterEnded ? `${periodTag} · over` : periodTag}</span>
        {onClockTap && !quarterEnded && !running && <span aria-hidden>▶</span>}
      </span>
      {/* Not a live region: a ticking clock would talk over everything
          else (the score and the period's end are said by the frame). */}
      <span className="nums mt-1 font-mono text-[28px] font-bold leading-7 tracking-[-0.03em] tabular-nums text-warm">
        {clockReadout}
      </span>
    </button>
  );

  return (
    <ScoreBugFrame
      ours={{
        name: teamName,
        total: (
          <span data-testid="league-points-team">
            <RollingNumber value={teamScore.points} className={TOTAL} />
          </span>
        ),
        tally: <ScoreLine score={teamScore} testId="league-score-line-team" words={words} />,
        chips: trackScoring ? ours : [],
      }}
      theirs={{
        name: opponentName,
        total: (
          <span data-testid="league-points-opponent">
            <RollingNumber value={opponentScore.points} className={TOTAL} />
          </span>
        ),
        tally: <ScoreLine score={opponentScore} testId="league-score-line-opponent" words={words} />,
        chips: trackScoring ? theirs : [],
      }}
      clock={pill}
      chipsDisabled={pending}
      scoreSaid={trackScoring ? `${teamName} ${teamScore.points}, ${opponentName} ${opponentScore.points}` : null}
      periodOverSaid={quarterEnded ? `${periodLabel.charAt(0).toUpperCase()}${periodLabel.slice(1)} ${currentPeriod || 1} over` : null}
    />
  );
}
