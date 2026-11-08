"use client";

import { ClockPillReadout } from "@/components/live/ClockPillReadout";

// ─── BasketballScoreBug ──────────────────────────────────────
// Basketball's scorebug. Mirrors AFL's GameHeader and soccer's bug
// column for column: our total and chips on the left, the clock pill in
// the centre (period, live dot, countdown; at the hooter it names the
// break), the opponent's mirror on the right. Basketball's chips are +1,
// +2 and +3 a side; +3 hides where the age plays no 3-pointers. The rows
// are the shared ScoreBugFrame's.
//
// Live v3 (Phase 10) splits it as AFL's GameHeader does (`part`): the
// header (names, big totals, the clock in ink on the chalk, hi-vis when
// a sub is due or the clock waits at 0:00 for the buzzer; tap a side for
// Scores and fixes, "No score kept" with scoring off) and the bar. With
// three kinds a side the bar is the two-row bar, a row a team (rugby's
// sides2): ours +1 filled and +2 +3 outlined, theirs text buttons. With
// no 3-pointers it's AFL's one row: + FREE THROW and + BASKET, theirs as
// text buttons. Without `part` it's the one-piece bug (full time).
//
// Our chips open the scorer picker for that many points (the parent owns
// it); the opponent's record straight away. With scoring off the chips
// hide.

import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { RollingNumber, SCORE_GHOST, useScoreGhost } from "@/components/live/RollingNumber";
import { ScoreBugFrame, type ScoreChipSpec } from "@/components/live/ScoreBugFrame";
import { hapticTap } from "@/lib/haptics";

type Points = 1 | 2 | 3;

/** The bar's word for each basket (one row, when there's no +3). */
const WORD: Record<Points, string> = { 1: "Free throw", 2: "Basket", 3: "Three" };

interface BasketballScoreBugProps {
  teamName: string;
  opponentName: string;
  teamPoints: number;
  opponentPoints: number;
  /** The period word's letter: "H" for halves, "Q" for quarters. */
  periodLetter: string;
  /** The period in play or last played; 0 before tip-off. */
  currentPeriod: number;
  periodCount: number;
  /** Countdown readout ("12:34"). */
  clockReadout: string;
  running: boolean;
  isPreGame: boolean;
  isFinished: boolean;
  /** The hooter has gone and the period waits for the coach to end it. */
  atHooter: boolean;
  /** "Half time", "Quarter time" or "Full time": the break the hooter starts. */
  breakName: string;
  trackScoring: boolean;
  /** The age (or team) plays 3-pointers: the +3 chips show. */
  threePointers: boolean;
  onTeamScore?: (points: Points) => void;
  onOpponentScore?: (points: Points) => void;
  onClockTap?: () => void;
  /** Bumped at sirenic moments (hooter, full time): the pill halos once. */
  clockPulseKey?: string | number | null;
  /** Live v3: the header or the bar (LiveShell); omitted, the one-piece bug. */
  part?: "header" | "bar";
  /** The header: a sub is due, so the clock goes hi-vis. */
  subDue?: boolean;
  /** The header: tap the score for Scores and fixes. */
  onScores?: () => void;
}

export function BasketballScoreBug({
  teamName,
  opponentName,
  teamPoints,
  opponentPoints,
  periodLetter,
  currentPeriod,
  periodCount,
  clockReadout,
  running,
  isPreGame,
  isFinished,
  atHooter,
  breakName,
  trackScoring,
  threePointers,
  onTeamScore,
  onOpponentScore,
  onClockTap,
  clockPulseKey = null,
  part,
  subDue = false,
  onScores,
}: BasketballScoreBugProps) {
  const v3 = part !== undefined;
  // Before tip-off the v3 header shows the first period, full length
  // ("H1 10:00"), as the clock will read at the tip-off.
  const periodTag = isPreGame
    ? v3
      ? `${periodLetter}1`
      : "Pre"
    : isFinished || currentPeriod > periodCount
      ? "FT"
      : `${periodLetter}${currentPeriod || 1}`;
  const live = !isPreGame && !isFinished && running && !atHooter;
  const pausedIcon = !isPreGame && !isFinished && !running && !atHooter ? "▶" : null;

  const teamGhost = useScoreGhost(teamPoints);
  const oppGhost = useScoreGhost(opponentPoints);
  const tapDown = () => void hapticTap("light");
  const chips: Points[] = threePointers ? [1, 2, 3] : [1, 2];

  const TOTAL = v3 ? "" : "text-[44px] font-bold leading-10 tracking-[-0.04em]";

  // v3: the clock on the chalk in ink; hi-vis only when it needs the
  // coach: a sub due, or 0:00 waiting for the buzzer.
  const hot = v3 && !isPreGame && !isFinished && (atHooter || subDue);
  const clockSaid = isPreGame && v3 ? "not started" : atHooter ? breakName : `${running ? "running" : "paused"}${hot && subDue ? ", sub due" : ""}`;
  const pill = (
    <SirenPulseHalo triggerKey={clockPulseKey} size="md" className="rounded-md">
      <button
        type="button"
        onClick={onClockTap}
        disabled={isPreGame || isFinished || !onClockTap}
        className={
          v3
            ? `flex min-w-[92px] flex-col items-center justify-center rounded-[12px] px-[10px] py-[6px] transition-colors duration-move ease-out-quart bigtext:min-w-0 bigtext:px-[6px] ${
                hot ? "bg-hivis text-hivis-ink" : "bg-transparent text-ink enabled:hover:bg-surface-alt"
              }`
            : `flex flex-col items-center justify-center rounded-md px-4 pb-2.5 pt-2 text-warm shadow-[0_6px_16px_rgba(26,30,26,0.18)] transition-[min-width,background-color] duration-move ease-out-quart ${isFinished ? "" : "disabled:opacity-80"} ${
                atHooter ? "min-w-[168px] bg-due" : "min-w-[104px] bg-ink hover:bg-ink/90 bigtext:min-w-0 bigtext:px-2"
              }`
        }
        aria-label={`Clock — ${periodTag}, ${clockSaid}`}
      >
        {atHooter ? (
          <span key="hooter" className="flex flex-col items-center motion-safe:animate-xfade-in motion-reduce:animate-xfade-in">
            <span className={`font-mono text-nano font-bold uppercase leading-3 tracking-micro ${v3 ? "text-hivis-ink" : "text-white/[0.85]"}`}>
              End {periodTag}
            </span>
            <span className={`mt-0.5 whitespace-nowrap text-xl font-bold leading-7 tracking-[-0.01em] ${v3 ? "text-hivis-ink" : "text-white"}`}>
              {breakName}
            </span>
          </span>
        ) : (
          <ClockPillReadout
            key={`p-${currentPeriod}`}
            periodTag={hot && subDue ? "Sub due" : periodTag}
            live={live && !(hot && subDue)}
            pausedIcon={pausedIcon}
            readout={clockReadout}
            finished={isFinished}
            tone={v3 ? (hot ? "hot" : "ink") : "warm"}
          />
        )}
      </button>
    </SirenPulseHalo>
  );
  const chipsFor = (who: string, ours: boolean, onScore?: (points: Points) => void): ScoreChipSpec[] =>
    trackScoring && onScore
      ? chips.map((n, i) => ({
          key: String(n),
          text: `+${n}`,
          word: WORD[n],
          // One row (no +3): "+ FREE THROW / who scored?", "+ BASKET / Hawks +2".
          hint: ours ? (i === 0 ? "who scored?" : `${who} +${n}`) : undefined,
          label: `Add ${n} ${n === 1 ? "point" : "points"}, ${who}`,
          onTap: () => onScore(n),
        }))
      : [];
  // The "+3" rises off the header, not off the bar as well.
  const ghosts = part !== "bar";

  return (
    <ScoreBugFrame
      part={part}
      onScores={onScores}
      scoringOff={v3 && !trackScoring}
      ours={{
        name: teamName,
        total: <RollingNumber value={teamPoints} className={TOTAL} />,
        chips: chipsFor(teamName, true, onTeamScore),
        ghost: ghosts && teamGhost && (
          <span key={teamGhost.key} aria-hidden className={`${SCORE_GHOST} left-3`}>
            {teamGhost.text}
          </span>
        ),
      }}
      theirs={{
        name: opponentName,
        total: <RollingNumber value={opponentPoints} className={TOTAL} />,
        chips: chipsFor(opponentName, false, onOpponentScore),
        ghost: ghosts && oppGhost && (
          <span key={oppGhost.key} aria-hidden className={`${SCORE_GHOST} right-3`}>
            {oppGhost.text}
          </span>
        ),
      }}
      clock={pill}
      onChipPointerDown={tapDown}
      scoreSaid={trackScoring ? `${teamName} ${teamPoints}, ${opponentName} ${opponentPoints}` : null}
      periodOverSaid={atHooter && !isFinished ? `End of ${periodTag}. ${breakName}` : null}
    />
  );
}
