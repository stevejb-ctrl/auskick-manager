"use client";

import { useEffect, useState } from "react";
import {
  clockElapsedMs,
  formatClock,
  useLiveGame,
} from "@/lib/stores/liveGameStore";
import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { PulsingNumber } from "@/components/live/PulsingNumber";

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
   * Tap the small "Q-by-Q" chip below the clock pill. Parent owns
   * the modal so the same data the strip uses can be reused
   * without re-passing the full scoreByQuarter array down here.
   * Hidden when omitted (pre-Q1 / track_scoring=false / FT).
   */
  onShowQuarterScores?: () => void;
  /**
   * Tap the small "End Q early" chip that appears under the clock
   * pill ONLY when the clock is paused mid-quarter. Steve's real-
   * game scenario: paused at the start of the quarter, forgot to
   * resume, game continued without the clock; needs a way to skip
   * to the Q-break. Parent owns the confirmation flow so the
   * destructive action requires an explicit tap.
   */
  onEndQuarterEarly?: () => void;
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
}

function points(s: { goals: number; behinds: number }) {
  return s.goals * 6 + s.behinds;
}

// Score-record chip styling — shared by all four +G/+B buttons
// (own-team goal, own-team behind, opponent goal, opponent behind).
// Lives once here rather than copy-pasted across the four call sites.
// `active:bg-brand-200 active:text-brand-700` is the brief tap-down
// signal: a brand-coloured flash that confirms the chip registered
// the tap before the player-picker mounts. Higher contrast than the
// hover step because score-record is a deliberate, consequential
// action (it opens a picker, mutates state) — pointer-down deserves
// to feel weightier than mere hover.
const SCORE_CHIP =
  "rounded-md bg-surface-alt px-3 py-2 font-mono text-sm font-semibold text-ink-dim " +
  "transition-colors duration-fast ease-out-quart " +
  "hover:bg-hairline hover:text-ink " +
  "active:bg-brand-200 active:text-brand-700 " +
  "disabled:pointer-events-none disabled:opacity-60";

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
  onEndQuarterEarly,
  flat = false,
}: GameHeaderProps) {
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

  const rawElapsed = clockElapsedMs({ clockStartedAt: startedAt, accumulatedMs });
  const elapsed = rawElapsed * clockMultiplier;
  const remaining = Math.max(0, quarterMs - elapsed);
  const overtime = elapsed > quarterMs;

  const quarterLabel = isPreGame
    ? "Pre"
    : isFinished || quarter > periodCount
      ? "FT"
      : `Q${quarter}`;
  const stateIcon = isPreGame || isFinished ? null : running ? "⏸" : "▶";

  return (
    <div
      className={`grid grid-cols-[1fr_auto_1fr] items-start gap-2 px-4 py-3 ${
        flat ? "" : "rounded-md bg-surface shadow-card"
      }`}
    >
      {/* Left: home team — total points dominate, like a broadcast scorebug.
          +G/+B chips mirror the opponent side; tapping opens a
          player picker (the parent owns the picker UI) so the
          coach can attribute the score to whoever just scored
          without first having to tap the player tile. */}
      <div className="min-w-0">
        <p className="truncate font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
          {teamName}
        </p>
        <p className="nums mt-0.5 flex items-baseline gap-1.5 font-mono leading-none text-ink">
          <span className="text-sm font-semibold text-ink-dim">
            {team.goals}
            <span className="text-ink-mute">·</span>
            {team.behinds}
          </span>
          {/* PulsingNumber: count-up + halo on the points total when
              the team scores. The G·B detail above stays static —
              animating multiple digits at once reads as noise. The
              points total is the eye-catcher (36px, ink-dark) so
              the moment is communicated by the most prominent
              element. P0-6 from MICRO-INTERACTIONS-PLAN.md. */}
          <PulsingNumber
            value={points(team)}
            className="text-[36px] font-bold tracking-tightest"
          />
        </p>
        {onTeam && trackScoring && (
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => onTeam("goal")}
              disabled={isPending}
              className={SCORE_CHIP}
            >
              +G
            </button>
            <button
              type="button"
              onClick={() => onTeam("behind")}
              disabled={isPending}
              className={SCORE_CHIP}
            >
              +B
            </button>
          </div>
        )}
      </div>

      {/* Center: dark clock pill (tap to pause/resume). Wrapped in
          SirenPulseHalo so it briefly halos at sirenic moments
          (quarter-end hooter, FT). When clockPulseKey is null the
          halo span is omitted entirely — no animation, no DOM cost. */}
      <div className="flex flex-col items-center gap-1 self-center">
        <SirenPulseHalo triggerKey={clockPulseKey} size="md" className="rounded-md">
          <button
            type="button"
            onClick={onClockTap}
            disabled={isPreGame || isFinished || !onClockTap}
            className="flex flex-col items-center justify-center rounded-md bg-ink px-3 py-1.5 text-warm shadow-pop transition-colors duration-fast ease-out-quart hover:bg-ink/90 disabled:opacity-80"
            aria-label={running ? "Pause clock" : "Resume clock"}
          >
            <span className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase leading-none tracking-micro text-warm/70">
              <span>{quarterLabel}</span>
              {stateIcon && <span>{stateIcon}</span>}
            </span>
            <span
              className={`nums mt-0.5 font-mono text-[22px] font-bold leading-none tracking-tightest ${
                overtime ? "text-warn" : "text-warm"
              }`}
            >
              {formatClock(remaining)}
            </span>
          </button>
        </SirenPulseHalo>
        {/* Quarter-by-quarter trigger. Sits directly under the clock
            pill so it reads as part of the centre score-and-clock
            cluster. Tap → opens QuarterScoreModal with the full
            breakdown + cumulative running totals. Steve's user
            feedback 2026-05-09 (after the QuarterScoreStrip below
            the scorebug shipped): "There's room in the in-game
            scorebug under the score to open a quarter by quarter
            modal" — the strip is a glance, this is drill-down. */}
        {onShowQuarterScores && (
          <button
            type="button"
            onClick={onShowQuarterScores}
            className="rounded-full border border-hairline bg-surface px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-micro text-ink-dim transition-colors duration-fast ease-out-quart hover:border-ink-dim hover:bg-surface-alt hover:text-ink"
            aria-label="Show quarter-by-quarter scores"
          >
            Q-by-Q
          </button>
        )}
        {/* End-Q-early — paused-only "rescue" affordance. Surfaces
            beside Q-by-Q only when the clock is paused mid-quarter
            so it stays out of the way during normal play, but the
            coach who paused at the start of the quarter and forgot
            to resume has somewhere obvious to recover to. */}
        {onEndQuarterEarly && !running && !isPreGame && !isFinished && (
          <button
            type="button"
            onClick={onEndQuarterEarly}
            className="rounded-full border border-warn/40 bg-warn-soft px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-micro text-warn transition-colors duration-fast ease-out-quart hover:border-warn hover:bg-warn/15"
            aria-label="End the current quarter now"
          >
            End Q early
          </button>
        )}
      </div>

      {/* Right: opponent — mirror: BIG total first, then small G·B */}
      <div className="min-w-0 text-right">
        <p className="truncate font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
          {opponentName}
        </p>
        <p className="nums mt-0.5 flex items-baseline justify-end gap-1.5 font-mono leading-none text-ink">
          <PulsingNumber
            value={points(opp)}
            className="text-[36px] font-bold tracking-tightest"
          />
          <span className="text-sm font-semibold text-ink-dim">
            {opp.goals}
            <span className="text-ink-mute">·</span>
            {opp.behinds}
          </span>
        </p>
        {onOpponent && trackScoring && (
          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onOpponent("goal")}
              disabled={isPending}
              className={SCORE_CHIP}
            >
              +G
            </button>
            <button
              type="button"
              onClick={() => onOpponent("behind")}
              disabled={isPending}
              className={SCORE_CHIP}
            >
              +B
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
