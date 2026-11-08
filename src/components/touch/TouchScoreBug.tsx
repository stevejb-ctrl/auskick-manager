"use client";

import { ClockPillReadout } from "@/components/live/ClockPillReadout";

// ─── TouchScoreBug ───────────────────────────────────────────
// The touch and Oztag scorebug. Mirrors AFL's GameHeader and
// basketball's bug column for column: our total and chip on the left,
// the clock pill in the centre (period, live dot, countdown; at the
// whistle it names the break), the opponent's mirror on the right.
//
// A try is 1 point: one +T chip a side. Ours opens the scorer picker
// (the parent owns it), and a try credited to a girl is a girl's try
// when the team plays one (Oztag mixed). We don't know the opponent's
// scorer, so when girls' tries count theirs are "+T" and "+2" marked
// girl (touchOpponentChips). With scoring off the chips hide. The rows
// are the shared ScoreBugFrame's.
//
// Live v3 (Phase 10) splits it as AFL's GameHeader does (`part`): the
// header (names, big totals, the clock in ink on the chalk, hi-vis when
// a sub is due or the clock waits at 0:00 for the whistle; tap a side
// for Scores and fixes, "No score kept" with scoring off) and the bar:
// + TRY ("who scored?") filled, theirs as text buttons, the "+2" over
// "girl" one button wide. Without `part` it's the one-piece bug.

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
  /** The period's letter: "H" for halves, "P" for one period. */
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
  /** Live v3: the header or the bar (LiveShell); omitted, the one-piece bug. */
  part?: "header" | "bar";
  /** The header: a sub is due, so the clock goes hi-vis. */
  subDue?: boolean;
  /** The header: tap the score for Scores and fixes. */
  onScores?: () => void;
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
  part,
  subDue = false,
  onScores,
}: TouchScoreBugProps) {
  const v3 = part !== undefined;
  // Before the start the v3 header shows the first period, full length
  // ("H1 20:00"), as the clock will read at the tap.
  const periodTag = isPreGame
    ? v3
      ? `${periodLetter}1`
      : "Pre"
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

  const TOTAL = v3 ? "" : "text-[44px] font-bold leading-10 tracking-[-0.04em]";
  // Theirs: +T, and "+2" over "girl" (one chip wide) when a girl's try
  // counts double.
  const opponentChips = touchOpponentChips(girlsTryDouble, opponentName);

  // v3: the clock on the chalk in ink; hi-vis only when it needs the
  // coach: a sub due, or 0:00 waiting for the whistle.
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
  // The "+1" rises off the header, not off the bar as well.
  const ghosts = part !== "bar";

  return (
    <ScoreBugFrame
      part={part}
      onScores={onScores}
      scoringOff={v3 && !trackScoring}
      ours={{
        name: teamName,
        total: <RollingNumber value={teamPoints} className={TOTAL} />,
        chips:
          onTeamScore && trackScoring
            ? [{ key: "t", text: "+T", word: "Try", hint: "who scored?", label: `Add a try, ${teamName}`, onTap: onTeamScore }]
            : [],
        ghost: ghosts && teamGhost && (
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
        ghost: ghosts && oppGhost && (
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
