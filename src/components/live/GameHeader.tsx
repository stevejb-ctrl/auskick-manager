"use client";

import { useEffect, useState } from "react";
import {
  clockElapsedMs,
  formatClock,
  useLiveGame,
} from "@/lib/stores/liveGameStore";
import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { PulsingNumber } from "@/components/live/PulsingNumber";
import { SCORE_CHIP } from "@/components/live/scoreChip";

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

  // Game ms, the store's frame (accumulatedMs is already scaled).
  const elapsed = clockElapsedMs({ clockStartedAt: startedAt, accumulatedMs, clockMultiplier });
  const remaining = Math.max(0, quarterMs - elapsed);
  const overtime = elapsed > quarterMs;

  const quarterLabel = isPreGame
    ? "Pre"
    : isFinished || quarter > periodCount
      ? "FT"
      : `Q${quarter}`;
  // Running: a mint "live" dot before the period — the old ⏸ glyph in
  // a running clock read as "paused". Paused keeps its ▶.
  const live = !isPreGame && !isFinished && running;
  const pausedIcon = !isPreGame && !isFinished && !running ? "▶" : null;

  // In-game re-skin (design session 17 Oct 2026): numbers up, chrome
  // down. Totals 44/700, clock 28/700, all tabular; team names and
  // G·B recede to ink-dim. align-items end puts one baseline across
  // all three columns — totals line up with the pill, buttons with
  // Q-BY-Q.
  const NAME = "truncate font-mono text-[10px] font-semibold uppercase leading-4 tracking-[0.12em] text-ink-dim";
  const TOTAL = "text-[44px] font-bold leading-10 tracking-[-0.04em]";
  const TALLY = "text-[13px] font-medium text-ink-dim";
  const CHIP = `${SCORE_CHIP} w-12`;

  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-x-3 px-4 pb-6 pt-3 ${
        flat ? "" : "rounded-md bg-surface shadow-card"
      }`}
    >
      {/* Left: home team — total first, then G·B on its baseline.
          +G/+B chips mirror the opponent side; tapping opens a
          player picker (the parent owns the picker UI) so the
          coach can attribute the score to whoever just scored
          without first having to tap the player tile. */}
      <div className="flex min-w-0 flex-col gap-2">
        <div className="min-w-0">
          <p className={NAME}>{teamName}</p>
          <p className="nums mt-1 flex items-baseline gap-2 font-mono tabular-nums text-ink">
            {/* PulsingNumber: count-up + halo on the points total when
                the team scores. P0-6 from MICRO-INTERACTIONS-PLAN.md. */}
            <PulsingNumber value={points(team)} className={TOTAL} />
            <span className={TALLY}>
              {team.goals}·{team.behinds}
            </span>
          </p>
        </div>
        {onTeam && trackScoring && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onTeam("goal")}
              disabled={isPending}
              className={CHIP}
              aria-label={`Add goal, ${teamName}`}
            >
              +G
            </button>
            <button
              type="button"
              onClick={() => onTeam("behind")}
              disabled={isPending}
              className={CHIP}
              aria-label={`Add behind, ${teamName}`}
            >
              +B
            </button>
          </div>
        )}
      </div>

      {/* Center: dark clock pill (tap opens the clock menu — pause /
          resume / end the quarter now; UX plan H5). Wrapped in
          SirenPulseHalo so it briefly halos at sirenic moments
          (quarter-end hooter, FT). When clockPulseKey is null the
          halo span is omitted entirely — no animation, no DOM cost. */}
      <div className="flex flex-col items-center">
        <SirenPulseHalo triggerKey={clockPulseKey} size="md" className="rounded-md">
          <button
            type="button"
            onClick={onClockTap}
            disabled={isPreGame || isFinished || !onClockTap}
            className="flex min-w-[104px] flex-col items-center justify-center rounded-md bg-ink px-4 pb-2.5 pt-2 text-warm shadow-[0_6px_16px_rgba(26,30,26,0.18)] transition-colors duration-fast ease-out-quart hover:bg-ink/90 disabled:opacity-80"
            aria-label={`Clock — ${quarterLabel}, ${running ? "running" : "paused"}`}
          >
            <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase leading-3 tracking-micro text-warm/[0.72]">
              {live && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-mint" />}
              <span>{quarterLabel}</span>
              {pausedIcon && <span>{pausedIcon}</span>}
            </span>
            <span
              className={`nums mt-1 font-mono text-[28px] font-bold leading-7 tracking-[-0.03em] tabular-nums ${
                overtime ? "text-warn" : "text-warm"
              }`}
            >
              {formatClock(remaining)}
            </span>
          </button>
        </SirenPulseHalo>
        {/* Quarter-by-quarter trigger: a 44pt text button under the
            pill (the old 9px bordered pill was a ~20px target).
            Tap → QuarterScoreModal with the full breakdown. */}
        {onShowQuarterScores && (
          <button
            type="button"
            onClick={onShowQuarterScores}
            className="min-h-[44px] px-3 font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim transition-colors duration-fast ease-out-quart hover:text-ink"
            aria-label="Show quarter-by-quarter scores"
          >
            Q-by-Q
          </button>
        )}
      </div>

      {/* Right: opponent — mirror: G·B, then the total. */}
      <div className="flex min-w-0 flex-col items-end gap-2 text-right">
        <div className="min-w-0 max-w-full">
          <p className={NAME}>{opponentName}</p>
          <p className="nums mt-1 flex items-baseline justify-end gap-2 font-mono tabular-nums text-ink">
            <span className={TALLY}>
              {opp.goals}·{opp.behinds}
            </span>
            <PulsingNumber value={points(opp)} className={TOTAL} />
          </p>
        </div>
        {onOpponent && trackScoring && (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onOpponent("goal")}
              disabled={isPending}
              className={CHIP}
              aria-label={`Add goal, ${opponentName}`}
            >
              +G
            </button>
            <button
              type="button"
              onClick={() => onOpponent("behind")}
              disabled={isPending}
              className={CHIP}
              aria-label={`Add behind, ${opponentName}`}
            >
              +B
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
