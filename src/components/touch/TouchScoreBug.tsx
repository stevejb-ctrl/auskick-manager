"use client";

// ─── TouchScoreBug ───────────────────────────────────────────
// The touch and Oztag scorebug, rendered inside the shared
// LiveStickyScoreBar. Mirrors AFL's GameHeader and basketball's bug
// column for column: our total and chip on the left, the dark clock pill
// in the centre (period, live dot, countdown; at the hooter it widens
// amber and names the break), the opponent's mirror on the right. The
// chips are AFL's SCORE_CHIP token.
//
// A try is 1 point: one +T chip a side, AFL's +G / +B size. Ours opens
// the scorer picker (the parent owns it), and a try credited to a girl
// is a girl's try when the team plays one (Oztag mixed). We don't know
// the opponent's scorer, so when girls' tries count theirs are "+T" and
// "+2" marked girl (touchOpponentChips), on one row: wrapped to two, the
// bar grew to about 30% of a 390 px screen and covered Finish game (UX
// audit 23 Oct). With scoring off the chips hide. The rows are the shared
// ScoreBugFrame's.

import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { RollingNumber, SCORE_GHOST, useScoreGhost } from "@/components/live/RollingNumber";
import { ScoreBugFrame } from "@/components/live/ScoreBugFrame";
import { hapticTap } from "@/lib/haptics";
import { touchOpponentChips } from "@/components/touch/touchWords";

interface TouchScoreBugProps {
  teamName: string;
  opponentName: string;
  teamPoints: number;
  opponentPoints: number;
  /** The period's letter: "H" for halves, "" for one period. */
  periodLetter: string;
  /** The period in play or last played; 0 before the start. */
  currentPeriod: number;
  periodCount: number;
  /** Countdown readout ("12:34"). */
  clockReadout: string;
  running: boolean;
  isPreGame: boolean;
  isFinished: boolean;
  /** The hooter has gone and the period waits for the coach to end it. */
  atHooter: boolean;
  /** "Half time" or "Full time": the break the hooter starts. */
  breakName: string;
  trackScoring: boolean;
  /** A girl's try counts 2 (Oztag mixed): the opponent's chips are +T and +2 (girl). */
  girlsTryDouble: boolean;
  pending?: boolean;
  onTeamScore?: () => void;
  onOpponentScore?: (girl: boolean) => void;
  onClockTap?: () => void;
  /** Bumped at sirenic moments (hooter, full time): the pill halos once. */
  clockPulseKey?: string | number | null;
}

export function TouchScoreBug({
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
  girlsTryDouble,
  pending = false,
  onTeamScore,
  onOpponentScore,
  onClockTap,
  clockPulseKey = null,
}: TouchScoreBugProps) {
  const periodTag = isPreGame
    ? "Pre"
    : isFinished || currentPeriod > periodCount
      ? "FT"
      : periodCount === 1
        ? "Live"
        : `${periodLetter}${currentPeriod || 1}`;
  const live = !isPreGame && !isFinished && running && !atHooter;
  const pausedIcon = !isPreGame && !isFinished && !running && !atHooter ? "▶" : null;

  const teamGhost = useScoreGhost(teamPoints);
  const oppGhost = useScoreGhost(opponentPoints);
  const tapDown = () => void hapticTap("light");

  const TOTAL = "text-[44px] font-bold leading-10 tracking-[-0.04em]";
  // Theirs: +T, and "+2" over "girl" (one chip wide) when a girl's try
  // counts double.
  const opponentChips = touchOpponentChips(girlsTryDouble, opponentName);

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

  return (
    <ScoreBugFrame
      ours={{
        name: teamName,
        total: <RollingNumber value={teamPoints} className={TOTAL} />,
        chips: onTeamScore && trackScoring ? [{ key: "t", text: "+T", label: `Add a try, ${teamName}`, onTap: onTeamScore }] : [],
        ghost: teamGhost && (
          <span key={teamGhost.key} aria-hidden className={`${SCORE_GHOST} left-3`}>
            {teamGhost.text}
          </span>
        ),
      }}
      theirs={{
        name: opponentName,
        total: <RollingNumber value={opponentPoints} className={TOTAL} />,
        chips:
          onOpponentScore && trackScoring
            ? opponentChips.map((c) => ({ key: c.key, text: c.text, sub: c.sub, label: c.label, onTap: () => onOpponentScore(c.girl) }))
            : [],
        ghost: oppGhost && (
          <span key={oppGhost.key} aria-hidden className={`${SCORE_GHOST} right-3`}>
            {oppGhost.text}
          </span>
        ),
      }}
      clock={pill}
      chipsDisabled={pending}
      onChipPointerDown={tapDown}
      scoreSaid={trackScoring ? `${teamName} ${teamPoints}, ${opponentName} ${opponentPoints}` : null}
      periodOverSaid={atHooter && !isFinished ? `End of ${periodTag}. ${breakName}` : null}
    />
  );
}
