"use client";

import { useEffect, useRef, useState } from "react";
import { ScoresButton } from "@/components/live/ScoresSheet";
import { ClockPillReadout } from "@/components/live/ClockPillReadout";
import {
  clockElapsedMs,
  formatClock,
  useLiveGame,
} from "@/lib/stores/liveGameStore";
import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { RollingNumber, SCORE_GHOST, useScoreGhost } from "@/components/live/RollingNumber";
import { ScoreBugFrame } from "@/components/live/ScoreBugFrame";
import { hapticTap } from "@/lib/haptics";
import { periodBreakName as breakName } from "@/lib/live/periodBreakName";

interface GameHeaderProps {
  teamName: string;
  opponentName: string;
  trackScoring: boolean;
  /**
   * Tap on the OWN-team `+G`/`+B` chip. Parent opens a player-picker
   * sheet — the chip itself doesn't record a score until the coach
   * picks a scorer. Mirrors `onOpponent` shape so callers can wire
   * both with the same signature. Stagehand exploration found that
   * a fresh runner expects symmetric +G/+B controls per team and
   * couldn't discover the tap-player-to-score path on their own.
   */
  onTeam?: (kind: "goal" | "behind") => void;
  onOpponent?: (kind: "goal" | "behind") => void;
  /** Fires when the user taps the clock pill — parent decides whether to pause/resume. */
  onClockTap?: () => void;
  running: boolean;
  isPreGame: boolean;
  isFinished: boolean;
  /** Speed multiplier for demo games — scales displayed elapsed time (default 1). */
  clockMultiplier?: number;
  /**
   * Quarter length in milliseconds. Cascade source: game override →
   * team override → age-group default (`getEffectiveQuarterSeconds`).
   * Required so the countdown reflects the actual age-group length
   * (U13+ = 20 min, not the legacy hardcoded 12). Steve 2026-05-20:
   * previously this component imported a hardcoded QUARTER_MS from
   * the store; every game read 12 min no matter what age group.
   */
  quarterMs: number;
  /**
   * Number of periods this age group plays (`ageGroup.periodCount`).
   * Drives the "FT" label fallback (`quarter > periodCount`) instead
   * of a hardcoded 4 (CONFIG-01). Threaded from the LiveGame mount
   * exactly like `quarterMs` — a period-COUNT scalar to match the
   * period-LENGTH scalar already passed here.
   */
  periodCount: number;
  /** True while a server action from this header (e.g. opponent score) is in flight. */
  isPending?: boolean;
  /**
   * Bump this whenever a moment that ARE a siren going off occurs —
   * quarter-end hooter, game finalised. The clock pill pulses once
   * with the brand's siren halo. Pass `null` (the default) to
   * suppress the pulse on header instances that aren't tied to a
   * sirenic moment. Mirrors the same prop on netball's
   * NetballScoreBug.
   */
  clockPulseKey?: string | number | null;
  /**
   * Tap "Scores" below the clock pill. Parent owns the Scores and
   * fixes sheet (live/ScoresSheet) so the same data the strip uses
   * can be reused without re-passing scoreByQuarter down here.
   * Hidden when omitted (pre-Q1 / track_scoring=false / FT).
   */
  onShowQuarterScores?: () => void;
  /**
   * Strip the outer card chrome (rounded corners, surface bg, drop
   * shadow). Used when the header is nested inside a sticky-bottom
   * wrapper (Steve 2026-05-13) — the wrapper carries its own bar
   * styling and a card-on-card render looks bumpy. The grid layout
   * + internal padding stay so the inner content rhythm is
   * unchanged. Defaults to false for the top-anchored render
   * (current behaviour everywhere else).
   */
  flat?: boolean;
  /**
   * Live v3 (AFL's shell): just the header (names, big totals, the clock
   * between; tap a side for Scores and fixes) or just the bar (+ GOAL,
   * + BEHIND, theirs as text buttons). Omitted: the one-piece bug.
   */
  part?: "header" | "bar";
  /** The header: a sub is due, so the clock goes hi-vis. */
  subDue?: boolean;
  /** The header: tap the score for Scores and fixes. */
  onScores?: () => void;
}

function points(s: { goals: number; behinds: number }) {
  return s.goals * 6 + s.behinds;
}


/**
 * The unified top header: BRUNSWICK 3.2 (20) ·  Q2 ⏸ 8:14  · COBURG 2.4 (16).
 * Combines what was previously ScoreBoard + GameClock in two separate cards.
 * The dark centre pill is tappable to pause/resume.
 */
export function GameHeader({
  teamName,
  opponentName,
  trackScoring,
  onTeam,
  onOpponent,
  onClockTap,
  running,
  isPreGame,
  isFinished,
  clockMultiplier = 1,
  quarterMs,
  periodCount,
  isPending = false,
  clockPulseKey = null,
  onShowQuarterScores,
  flat = false,
  part,
  subDue = false,
  onScores,
}: GameHeaderProps) {
  const v3 = part !== undefined;
  const team = useLiveGame((s) => s.teamScore);
  const opp = useLiveGame((s) => s.opponentScore);
  const startedAt = useLiveGame((s) => s.clockStartedAt);
  const accumulatedMs = useLiveGame((s) => s.accumulatedMs);
  const quarter = useLiveGame((s) => s.currentQuarter);
  const [, force] = useState(0);

  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => force((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [startedAt]);

  // Game ms, the store's frame (accumulatedMs is already scaled).
  const elapsed = clockElapsedMs({ clockStartedAt: startedAt, accumulatedMs, clockMultiplier });
  const remaining = Math.max(0, quarterMs - elapsed);
  const overtime = elapsed > quarterMs;

  // Before kickoff the v3 header shows the first quarter, full length
  // ("Q1 12:00"), as the clock will read when the siren goes.
  const quarterLabel = isPreGame
    ? v3
      ? "Q1"
      : "Pre"
    : isFinished || quarter > periodCount
      ? "FT"
      : `Q${quarter}`;
  // Running: a mint "live" dot before the period — the old ⏸ glyph in
  // a running clock read as "paused". Paused keeps its ▶.
  const live = !isPreGame && !isFinished && running;
  const pausedIcon = !isPreGame && !isFinished && !running ? "▶" : null;

  // The hooter has gone and the clock holds at 0:00 until the coach
  // taps through (existing behaviour): the pill speaks up — widens,
  // fills amber, and names the break.
  const atHooter = !isPreGame && !isFinished && !running && elapsed >= quarterMs;

  // The next period's label rises in when the quarter changes (not on
  // first paint).
  const firstQuarterRef = useRef(quarter);
  const quarterChanged = quarter !== firstQuarterRef.current;

  const teamGhost = useScoreGhost(points(team));
  const oppGhost = useScoreGhost(points(opp));
  const tapDown = () => void hapticTap("light");

  // In-game re-skin (design session 17 Oct 2026): numbers up, chrome
  // down. Totals 44/700, clock 28/700, all tabular; team names and
  // G·B recede to ink-dim. align-items end puts one baseline across
  // all three columns — totals line up with the pill, buttons with
  // Q-BY-Q.
  const TOTAL = "text-[44px] font-bold leading-10 tracking-[-0.04em]";
  const TALLY = "text-[0.8125rem] font-medium text-ink-dim";

  // The rows are the shared ScoreBugFrame's (UX round 3, e4): the same
  // in every sport, compact on a short screen, chips wrapping at 320 px
  // and at large text.
  // v3: the clock sits on the chalk in ink, and goes hi-vis only when it
  // needs the coach: a sub due, or the siren.
  const hot = v3 && !isPreGame && !isFinished && (atHooter || subDue);
  const v3Pill = `flex min-w-[92px] flex-col items-center justify-center rounded-[12px] px-[10px] py-[6px] transition-colors duration-move ease-out-quart bigtext:min-w-0 bigtext:px-[6px] ${
    hot ? "bg-hivis text-hivis-ink" : "bg-transparent text-ink enabled:hover:bg-surface-alt"
  }`;
  const clockSaid = isPreGame && v3
    ? "not started"
    : atHooter
      ? breakName(quarter, periodCount)
      : `${running ? "running" : "paused"}${hot && subDue ? ", sub due" : ""}`;
  const pill = (
    <SirenPulseHalo triggerKey={clockPulseKey} size="md" className="rounded-md">
      <button
        type="button"
        onClick={onClockTap}
        disabled={isPreGame || isFinished || !onClockTap}
        className={v3 ? v3Pill : `flex flex-col items-center justify-center rounded-md px-4 pb-2.5 pt-2 text-warm shadow-[0_6px_16px_rgba(26,30,26,0.18)] transition-[min-width,background-color] duration-move ease-out-quart ${isFinished ? "" : "disabled:opacity-80"} ${
          atHooter ? "min-w-[168px] bg-due" : "min-w-[104px] bg-ink hover:bg-ink/90 bigtext:min-w-0 bigtext:px-2"
        }`}
        aria-label={`Clock — ${quarterLabel}, ${clockSaid}`}
      >
        {atHooter ? (
          // Label crossfades to the break: END Q2 / Half time.
          <span key="hooter" className="flex flex-col items-center motion-safe:animate-xfade-in motion-reduce:animate-xfade-in">
            <span className={`font-mono text-nano font-bold uppercase leading-3 tracking-micro ${v3 ? "text-hivis-ink" : "text-white/[0.85]"}`}>
              End {quarterLabel}
            </span>
            {/* v3: "Three-quarter / time" on two lines, so the team names
                beside it keep their words whole at 390 px (Stagehand,
                9 Nov 2026). */}
            <span
              className={`mt-0.5 font-bold tracking-[-0.01em] ${
                v3
                  ? "max-w-[6.5rem] text-center text-base leading-[1.1] text-hivis-ink [text-wrap:balance]"
                  : "whitespace-nowrap text-xl leading-7 text-white"
              }`}
            >
              {breakName(quarter, periodCount)}
            </span>
          </span>
        ) : (
          <ClockPillReadout
            key={`q-${quarter}`}
            animateClassName={quarterChanged ? "motion-safe:animate-rise-in motion-reduce:animate-xfade-in" : ""}
            // A sub due: the pill says so, over the time (v3).
            periodTag={hot && subDue ? "Sub due" : quarterLabel}
            live={live && !(hot && subDue)}
            pausedIcon={pausedIcon}
            readout={formatClock(remaining)}
            overtime={overtime}
            finished={isFinished || quarter > periodCount}
            tone={v3 ? (hot ? "hot" : "ink") : "warm"}
          />
        )}
      </button>
    </SirenPulseHalo>
  );
  const chips = (name: string, on?: (kind: "goal" | "behind") => void) =>
    on && trackScoring
      ? [
          // The bar's words (v3): "+ GOAL / who scored?", "+ BEHIND / Roos +1".
          { key: "g", text: "+G", word: "Goal", hint: "who scored?", label: `Add goal, ${name}`, onTap: () => on("goal") },
          { key: "b", text: "+B", word: "Behind", hint: `${name} +1`, label: `Add behind, ${name}`, onTap: () => on("behind") },
        ]
      : [];
  // The header's totals take the header's type; the "+6" rises there, not
  // off the bar as well.
  const totalClass = v3 ? "" : TOTAL;
  const tallyClass = v3 ? "" : TALLY;
  const ghosts = part !== "bar";

  return (
    <ScoreBugFrame
      card={!flat}
      part={part}
      onScores={onScores}
      scoringOff={v3 && !trackScoring}
      ours={{
        name: teamName,
        // The total rolls up one slot on a score; the tally trails it by 40ms.
        total: <RollingNumber value={points(team)} className={totalClass} />,
        tally: <RollingNumber value={`${team.goals}·${team.behinds}`} className={tallyClass} delayMs={40} />,
        chips: chips(teamName, onTeam),
        ghost: ghosts && teamGhost && (
          <span key={teamGhost.key} aria-hidden className={`${SCORE_GHOST} left-3`}>
            {teamGhost.text}
          </span>
        ),
      }}
      theirs={{
        name: opponentName,
        total: <RollingNumber value={points(opp)} className={totalClass} />,
        tally: <RollingNumber value={`${opp.goals}·${opp.behinds}`} className={tallyClass} delayMs={40} />,
        chips: chips(opponentName, onOpponent),
        ghost: ghosts && oppGhost && (
          <span key={oppGhost.key} aria-hidden className={`${SCORE_GHOST} right-3`}>
            {oppGhost.text}
          </span>
        ),
      }}
      clock={pill}
      // Scores: a 44pt text button under the pill (the old 9px bordered
      // pill was a ~20px target). Tap → the Scores and fixes sheet.
      underClock={
        !v3 && onShowQuarterScores && (
          <ScoresButton onClick={onShowQuarterScores} />
        )
      }
      chipsDisabled={isPending}
      onChipPointerDown={tapDown}
      scoreSaid={
        trackScoring
          ? `${teamName} ${team.goals}.${team.behinds}, ${points(team)}. ${opponentName} ${opp.goals}.${opp.behinds}, ${points(opp)}`
          : null
      }
      periodOverSaid={atHooter ? `End of ${quarterLabel}. ${breakName(quarter, periodCount)}` : null}
    />
  );
}
