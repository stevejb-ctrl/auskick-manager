"use client";

import { rugbyScoreWords, type LeagueScore, type RugbyScoreWords } from "@/lib/sports/rugby_league/fairness";
import type { RugbySport } from "@/lib/sports/registry";
import { SCORE_CHIP, SCORE_TEAM_NAME } from "@/components/live/scoreChip";
import { RollingNumber } from "@/components/live/RollingNumber";

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

  type Chip = { key: string; text: string; label: string; onTap: () => void };
  const ours: Chip[] = [
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
  const theirs: Chip[] = [
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
  const chipRow = (chips: Chip[]) => (
    <div className="flex shrink-0 gap-1.5">
      {chips.map((c) => (
        <button key={c.key} type="button" onClick={c.onTap} disabled={pending} className={`${SCORE_CHIP} w-12`} aria-label={c.label}>
          {c.text}
        </button>
      ))}
    </div>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-x-3 px-4 pb-6 pt-3">
      {/* Left: our team. */}
      <div className="min-w-0">
        <p data-testid="scorebug-team-name" className={SCORE_TEAM_NAME}>{teamName}</p>
        <p className="nums mt-1 flex flex-wrap items-baseline gap-x-2 font-mono tabular-nums text-ink">
          <span data-testid="league-points-team"><RollingNumber value={teamScore.points} className={TOTAL} /></span>
          <ScoreLine score={teamScore} testId="league-score-line-team" words={words} />
        </p>
      </div>

      {/* Centre: the dark clock pill, as every sport's (tap: pause / resume). */}
      <div className="flex flex-col items-center">
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
          <span className="nums mt-1 font-mono text-[28px] font-bold leading-7 tracking-[-0.03em] tabular-nums text-warm" aria-live="polite">
            {clockReadout}
          </span>
        </button>
      </div>

      {/* Right: the opponent, mirrored. */}
      <div className="min-w-0 text-right">
        <p data-testid="scorebug-team-name" className={SCORE_TEAM_NAME}>{opponentName}</p>
        <p className="nums mt-1 flex flex-wrap items-baseline justify-end gap-x-2 font-mono tabular-nums text-ink">
          <ScoreLine score={opponentScore} testId="league-score-line-opponent" words={words} />
          <span data-testid="league-points-opponent"><RollingNumber value={opponentScore.points} className={TOTAL} /></span>
        </p>
      </div>

      {/* The chips, one row a side under the scores (ours left, theirs
          right), as basketball's and AFL's. Union's four a side don't fit
          two teams across a phone, so theirs wraps beneath, still one row. */}
      {trackScoring && (ours.length > 0 || theirs.length > 0) && (
        <div className="col-span-3 mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {chipRow(ours)}
          <div className="ml-auto">{chipRow(theirs)}</div>
        </div>
      )}
    </div>
  );
}
