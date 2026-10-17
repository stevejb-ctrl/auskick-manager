"use client";

// ─── SoccerScoreBug ──────────────────────────────────────────
// Football (soccer)'s scorebug, rendered inside the shared
// LiveStickyScoreBar. Mirrors AFL's GameHeader (the reference) column
// for column: our total and +G on the left, the dark clock pill in the
// centre (period, live dot, countdown; at the hooter it widens amber and
// names the break), the opponent's mirror on the right. Soccer scores
// goals only, so there is no tally beside the total and no +B.
//
// Own-team +G opens the scorer picker (the parent owns it); the
// opponent's +G records straight away. With scoring off the chips hide
// (MiniRoos records no results).

import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { RollingNumber, SCORE_GHOST, useScoreGhost } from "@/components/live/RollingNumber";
import { SCORE_CHIP, SCORE_TEAM_NAME } from "@/components/live/scoreChip";
import { hapticTap } from "@/lib/haptics";

interface SoccerScoreBugProps {
  teamName: string;
  opponentName: string;
  teamGoals: number;
  opponentGoals: number;
  /** The period word's letter: "H" for halves. */
  periodLetter: string;
  /** The half in play or last played; 0 before kick-off. */
  currentPeriod: number;
  periodCount: number;
  /** Countdown readout ("12:34"). */
  clockReadout: string;
  running: boolean;
  isPreGame: boolean;
  isFinished: boolean;
  /** The hooter has gone and the half waits for the coach to end it. */
  atHooter: boolean;
  /** "Half time" or "Full time": the break the hooter starts. */
  breakName: string;
  trackScoring: boolean;
  pending?: boolean;
  onTeamGoal?: () => void;
  onOpponentGoal?: () => void;
  onClockTap?: () => void;
  /** Bumped at sirenic moments (hooter, full time): the pill halos once. */
  clockPulseKey?: string | number | null;
}

export function SoccerScoreBug({
  teamName,
  opponentName,
  teamGoals,
  opponentGoals,
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
  pending = false,
  onTeamGoal,
  onOpponentGoal,
  onClockTap,
  clockPulseKey = null,
}: SoccerScoreBugProps) {
  const periodTag = isPreGame
    ? "Pre"
    : isFinished || currentPeriod > periodCount
      ? "FT"
      : `${periodLetter}${currentPeriod || 1}`;
  const live = !isPreGame && !isFinished && running && !atHooter;
  const pausedIcon = !isPreGame && !isFinished && !running && !atHooter ? "▶" : null;

  const teamGhost = useScoreGhost(teamGoals);
  const oppGhost = useScoreGhost(opponentGoals);
  const tapDown = () => void hapticTap("light");

  const TOTAL = "text-[44px] font-bold leading-10 tracking-[-0.04em]";
  const CHIP = `${SCORE_CHIP} w-12`;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-x-3 px-4 pb-6 pt-3">
      {/* Left: our team. */}
      <div className="flex min-w-0 flex-col gap-2">
        <div className="min-w-0">
          <p data-testid="scorebug-team-name" className={SCORE_TEAM_NAME}>{teamName}</p>
          <p className="nums mt-1 flex items-baseline gap-2 font-mono tabular-nums text-ink">
            <RollingNumber value={teamGoals} className={TOTAL} />
          </p>
        </div>
        {onTeamGoal && trackScoring && (
          <div className="relative flex gap-2">
            {teamGhost && (
              <span key={teamGhost.key} aria-hidden className={`${SCORE_GHOST} left-3`}>
                {teamGhost.text}
              </span>
            )}
            <button
              type="button"
              onClick={onTeamGoal}
              onPointerDown={tapDown}
              disabled={pending}
              className={CHIP}
              aria-label={`Add goal, ${teamName}`}
            >
              +G
            </button>
          </div>
        )}
      </div>

      {/* Centre: the clock pill (tap opens the clock menu). */}
      <div className="flex flex-col items-center">
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
      </div>

      {/* Right: the opponent, mirrored. */}
      <div className="flex min-w-0 flex-col items-end gap-2 text-right">
        <div className="min-w-0 max-w-full">
          <p data-testid="scorebug-team-name" className={SCORE_TEAM_NAME}>{opponentName}</p>
          <p className="nums mt-1 flex items-baseline justify-end gap-2 font-mono tabular-nums text-ink">
            <RollingNumber value={opponentGoals} className={TOTAL} />
          </p>
        </div>
        {onOpponentGoal && trackScoring && (
          <div className="relative flex justify-end gap-2">
            {oppGhost && (
              <span key={oppGhost.key} aria-hidden className={`${SCORE_GHOST} right-3`}>
                {oppGhost.text}
              </span>
            )}
            <button
              type="button"
              onClick={onOpponentGoal}
              onPointerDown={tapDown}
              disabled={pending}
              className={CHIP}
              aria-label={`Add goal, ${opponentName}`}
            >
              +G
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
