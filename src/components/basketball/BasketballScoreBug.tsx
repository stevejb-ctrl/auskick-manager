"use client";

// ─── BasketballScoreBug ──────────────────────────────────────
// Basketball's scorebug, rendered inside the shared LiveStickyScoreBar.
// Mirrors AFL's GameHeader and soccer's bug column for column: our total
// and chips on the left, the dark clock pill in the centre (period, live
// dot, countdown; at the hooter it widens amber and names the break),
// the opponent's mirror on the right. Basketball's chips are +1, +2 and
// +3 a side (the shared SCORE_CHIP), in one full-width row under the
// scores; +3 hides where the age plays no 3-pointers. The rows are the
// shared ScoreBugFrame's: at 320 px theirs wrap beneath ours (UX round
// 3, e4: their +3 was off the screen, our +3 12 px from their +1).
//
// Our chips open the scorer picker for that many points (the parent owns
// it); the opponent's record straight away. With scoring off the chips
// hide.

import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { RollingNumber, SCORE_GHOST, useScoreGhost } from "@/components/live/RollingNumber";
import { ScoreBugFrame } from "@/components/live/ScoreBugFrame";
import { hapticTap } from "@/lib/haptics";

type Points = 1 | 2 | 3;

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
}: BasketballScoreBugProps) {
  const periodTag = isPreGame
    ? "Pre"
    : isFinished || currentPeriod > periodCount
      ? "FT"
      : `${periodLetter}${currentPeriod || 1}`;
  const live = !isPreGame && !isFinished && running && !atHooter;
  const pausedIcon = !isPreGame && !isFinished && !running && !atHooter ? "▶" : null;

  const teamGhost = useScoreGhost(teamPoints);
  const oppGhost = useScoreGhost(opponentPoints);
  const tapDown = () => void hapticTap("light");
  const chips: Points[] = threePointers ? [1, 2, 3] : [1, 2];

  const TOTAL = "text-[44px] font-bold leading-10 tracking-[-0.04em]";

  const pill = (
    <SirenPulseHalo triggerKey={clockPulseKey} size="md" className="rounded-md">
      <button
        type="button"
        onClick={onClockTap}
        disabled={isPreGame || isFinished || !onClockTap}
        className={`flex flex-col items-center justify-center rounded-md px-4 pb-2.5 pt-2 text-warm shadow-[0_6px_16px_rgba(26,30,26,0.18)] transition-[min-width,background-color] duration-move ease-out-quart disabled:opacity-80 ${
          atHooter ? "min-w-[168px] bg-due" : "min-w-[104px] bg-ink hover:bg-ink/90"
        }`}
        aria-label={`Clock — ${periodTag}, ${atHooter ? breakName : running ? "running" : "paused"}`}
      >
        {atHooter ? (
          <span key="hooter" className="flex flex-col items-center motion-safe:animate-xfade-in motion-reduce:animate-xfade-in">
            <span className="font-mono text-[10px] font-bold uppercase leading-3 tracking-micro text-white/[0.85]">
              End {periodTag}
            </span>
            <span className="mt-0.5 whitespace-nowrap text-xl font-bold leading-7 tracking-[-0.01em] text-white">
              {breakName}
            </span>
          </span>
        ) : (
          <span key={`p-${currentPeriod}`} className="flex flex-col items-center">
            <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase leading-3 tracking-micro text-warm/[0.72]">
              {live && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-mint" />}
              <span>{periodTag}</span>
              {pausedIcon && <span>{pausedIcon}</span>}
            </span>
            <span className="nums mt-1 font-mono text-[28px] font-bold leading-7 tracking-[-0.03em] tabular-nums text-warm">
              {clockReadout}
            </span>
          </span>
        )}
      </button>
    </SirenPulseHalo>
  );
  const chipsFor = (who: string, onScore?: (points: Points) => void) =>
    trackScoring && onScore
      ? chips.map((n) => ({ key: String(n), text: `+${n}`, label: `Add ${n} ${n === 1 ? "point" : "points"}, ${who}`, onTap: () => onScore(n) }))
      : [];

  return (
    <ScoreBugFrame
      ours={{
        name: teamName,
        total: <RollingNumber value={teamPoints} className={TOTAL} />,
        chips: chipsFor(teamName, onTeamScore),
        ghost: teamGhost && (
          <span key={teamGhost.key} aria-hidden className={`${SCORE_GHOST} left-3`}>
            {teamGhost.text}
          </span>
        ),
      }}
      theirs={{
        name: opponentName,
        total: <RollingNumber value={opponentPoints} className={TOTAL} />,
        chips: chipsFor(opponentName, onOpponentScore),
        ghost: oppGhost && (
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
