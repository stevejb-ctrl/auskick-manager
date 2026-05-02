"use client";

import { useEffect, useState } from "react";
import {
  clockElapsedMs,
  formatClock,
  QUARTER_MS,
  useLiveGame,
} from "@/lib/stores/liveGameStore";
import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";

interface GameHeaderProps {
  teamName: string;
  opponentName: string;
  trackScoring: boolean;
  onOpponent?: (kind: "goal" | "behind") => void;
  /** Fires when the user taps the clock pill — parent decides whether to pause/resume. */
  onClockTap?: () => void;
  running: boolean;
  isPreGame: boolean;
  isFinished: boolean;
  /** Speed multiplier for demo games — scales displayed elapsed time (default 1). */
  clockMultiplier?: number;
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
  onOpponent,
  onClockTap,
  running,
  isPreGame,
  isFinished,
  clockMultiplier = 1,
  isPending = false,
  clockPulseKey = null,
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
  const remaining = Math.max(0, QUARTER_MS - elapsed);
  const overtime = elapsed > QUARTER_MS;

  const quarterLabel = isPreGame
    ? "Pre"
    : isFinished || quarter > 4
      ? "FT"
      : `Q${quarter}`;
  const stateIcon = isPreGame || isFinished ? null : running ? "⏸" : "▶";

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 rounded-md bg-surface px-4 py-3 shadow-card">
      {/* Left: home team — total points dominate, like a broadcast scorebug */}
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
          <span className="text-[36px] font-bold tracking-tightest">
            {points(team)}
          </span>
        </p>
      </div>

      {/* Center: dark clock pill (tap to pause/resume). Wrapped in
          SirenPulseHalo so it briefly halos at sirenic moments
          (quarter-end hooter, FT). When clockPulseKey is null the
          halo span is omitted entirely — no animation, no DOM cost. */}
      <SirenPulseHalo triggerKey={clockPulseKey} size="md" className="self-center rounded-md">
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

      {/* Right: opponent — mirror: BIG total first, then small G·B */}
      <div className="min-w-0 text-right">
        <p className="truncate font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
          {opponentName}
        </p>
        <p className="nums mt-0.5 flex items-baseline justify-end gap-1.5 font-mono leading-none text-ink">
          <span className="text-[36px] font-bold tracking-tightest">
            {points(opp)}
          </span>
          <span className="text-sm font-semibold text-ink-dim">
            {opp.goals}
            <span className="text-ink-mute">·</span>
            {opp.behinds}
          </span>
        </p>
        {onOpponent && trackScoring && (
          <div className="mt-0.5 flex justify-end gap-1">
            <button
              type="button"
              onClick={() => onOpponent("goal")}
              disabled={isPending}
              className="rounded-xs bg-surface-alt px-1.5 py-0.5 font-mono text-[9px] font-semibold text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-hairline hover:text-ink disabled:pointer-events-none disabled:opacity-60"
            >
              +G
            </button>
            <button
              type="button"
              onClick={() => onOpponent("behind")}
              disabled={isPending}
              className="rounded-xs bg-surface-alt px-1.5 py-0.5 font-mono text-[9px] font-semibold text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-hairline hover:text-ink disabled:pointer-events-none disabled:opacity-60"
            >
              +B
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
