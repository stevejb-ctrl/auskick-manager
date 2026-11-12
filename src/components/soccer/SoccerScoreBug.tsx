"use client";

import { ClockPillReadout } from "@/components/live/ClockPillReadout";

// ─── SoccerScoreBug ──────────────────────────────────────────
// Football (soccer)'s scorebug, on the shared live v3 shell.
// Mirrors AFL's GameHeader (the reference) column
// for column: our total and +G on the left, the dark clock pill in the
// centre (period, live dot, countdown; at the hooter it widens amber and
// names the break), the opponent's mirror on the right. Soccer scores
// goals only, so there is no tally beside the total and no +B.
//
// Own-team +G opens the scorer picker (the parent owns it); the
// opponent's +G records straight away. With scoring off the chips hide
// (MiniRoos records no results). The rows are the shared ScoreBugFrame's.
//
// Live v3 (the shell, Phase 9) splits it as AFL's GameHeader does with
// `part`: the header (names and big totals in ink on the chalk, the
// clock between, hi-vis only when a sub is due or the whistle's gone;
// tap the score for Scores and fixes, "No score kept" with scoring off)
// and the bar (+ GOAL "who scored?" filled, their +G a text button).

import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { RollingNumber, SCORE_GHOST, useScoreGhost } from "@/components/live/RollingNumber";
import { ScoreBugFrame } from "@/components/live/ScoreBugFrame";
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
  /** Live v3: the header or the bar (LiveShell); omitted, the one-piece bug. */
  part?: "header" | "bar";
  /** The header: a sub is due, so the clock goes hi-vis. */
  subDue?: boolean;
  /** The header: tap the score for Scores and fixes. */
  onScores?: () => void;
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
  part,
  subDue = false,
  onScores,
}: SoccerScoreBugProps) {
  const v3 = part !== undefined;
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

  // v3: the header part sets the totals' type (ScoreBugFrame).
  const TOTAL = v3 ? "" : "text-[44px] font-bold leading-10 tracking-[-0.04em]";

  const pill = (
    <SirenPulseHalo triggerKey={clockPulseKey} size="md" className="rounded-md">
      <button
        type="button"
        onClick={onClockTap}
        disabled={isPreGame || isFinished || !onClockTap}
        className={`flex flex-col items-center justify-center rounded-md px-4 pb-2.5 pt-2 text-warm shadow-[0_6px_16px_rgba(26,30,26,0.18)] transition-[min-width,background-color] duration-move ease-out-quart ${isFinished ? "" : "disabled:opacity-80"} ${
          atHooter ? "min-w-[168px] bg-due" : "min-w-[104px] bg-ink hover:bg-ink/90 bigtext:min-w-0 bigtext:px-2"
        }`}
        aria-label={`Clock — ${periodTag}, ${atHooter ? breakName : running ? "running" : "paused"}`}
      >
        {atHooter ? (
          <span key="hooter" className="flex flex-col items-center motion-safe:animate-xfade-in motion-reduce:animate-xfade-in">
            <span className="font-mono text-nano font-bold uppercase leading-3 tracking-micro text-white/[0.85]">
              End {periodTag}
            </span>
            <span className="mt-0.5 whitespace-nowrap text-xl font-bold leading-7 tracking-[-0.01em] text-white">
              {breakName}
            </span>
          </span>
        ) : (
          <ClockPillReadout
            key={`p-${currentPeriod}`}
            periodTag={periodTag}
            live={live}
            pausedIcon={pausedIcon}
            readout={clockReadout}
            finished={isFinished}
          />
        )}
      </button>
    </SirenPulseHalo>
  );

  // v3: the clock on the chalk in ink; hi-vis when a sub is due or the
  // whistle has gone (the half ends itself, unless a goal's being named).
  const hot = v3 && !isPreGame && !isFinished && (subDue || atHooter);
  const firstTag = `${periodLetter}1`;
  const v3Pill = (
    <SirenPulseHalo triggerKey={clockPulseKey} size="md" className="rounded-md">
      <button
        type="button"
        onClick={onClockTap}
        disabled={isPreGame || isFinished || !onClockTap}
        className={`flex min-w-[92px] flex-col items-center justify-center rounded-[12px] px-[10px] py-[6px] transition-colors duration-move ease-out-quart bigtext:min-w-0 bigtext:px-[6px] ${
          hot ? "bg-hivis text-hivis-ink" : "bg-transparent text-ink enabled:hover:bg-surface-alt"
        }`}
        aria-label={
          isPreGame
            ? `Clock — ${firstTag}, not started`
            : `Clock — ${periodTag}, ${atHooter ? breakName : running ? "running" : "paused"}${subDue && !atHooter && !isFinished ? ", sub due" : ""}`
        }
      >
        <ClockPillReadout
          key={`v3-${currentPeriod}`}
          periodTag={isPreGame ? firstTag : atHooter ? breakName : hot ? "Sub due" : periodTag}
          live={live && !hot}
          pausedIcon={pausedIcon}
          readout={clockReadout}
          finished={isFinished}
          tone={hot ? "hot" : "ink"}
        />
      </button>
    </SirenPulseHalo>
  );

  return (
    <ScoreBugFrame
      part={part}
      onScores={onScores}
      scoringOff={v3 && !trackScoring}
      ours={{
        name: teamName,
        total: <RollingNumber value={teamGoals} className={TOTAL} />,
        chips:
          onTeamGoal && trackScoring
            ? [{ key: "g", text: "+G", word: "Goal", hint: "who scored?", label: `Add goal, ${teamName}`, onTap: onTeamGoal }]
            : [],
        // The "+1" rises off the header (v3), not the bar as well.
        ghost: part !== "bar" && teamGhost && (
          <span key={teamGhost.key} aria-hidden className={`${SCORE_GHOST} left-3`}>
            {teamGhost.text}
          </span>
        ),
      }}
      theirs={{
        name: opponentName,
        total: <RollingNumber value={opponentGoals} className={TOTAL} />,
        chips: onOpponentGoal && trackScoring ? [{ key: "g", text: "+G", label: `Add goal, ${opponentName}`, onTap: onOpponentGoal }] : [],
        ghost: part !== "bar" && oppGhost && (
          <span key={oppGhost.key} aria-hidden className={`${SCORE_GHOST} right-3`}>
            {oppGhost.text}
          </span>
        ),
      }}
      clock={v3 ? v3Pill : pill}
      chipsDisabled={pending}
      onChipPointerDown={tapDown}
      scoreSaid={trackScoring ? `${teamName} ${teamGoals}, ${opponentName} ${opponentGoals}` : null}
      periodOverSaid={atHooter && !isFinished ? `End of ${periodTag}. ${breakName}` : null}
    />
  );
}
