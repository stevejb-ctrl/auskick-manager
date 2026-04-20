"use client";

import { useEffect, useState } from "react";
import {
  clockElapsedMs,
  formatClock,
  QUARTER_MS,
  useLiveGame,
} from "@/lib/stores/liveGameStore";

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

  const elapsed = clockElapsedMs({ clockStartedAt: startedAt, accumulatedMs });
  const remaining = Math.max(0, QUARTER_MS - elapsed);
  const overtime = elapsed > QUARTER_MS;

  const quarterLabel = isPreGame
    ? "Pre"
    : isFinished || quarter > 4
      ? "FT"
      : `Q${quarter}`;
  const stateIcon = isPreGame || isFinished ? null : running ? "⏸" : "▶";

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      {/* Left: home team */}
      <div className="min-w-0">
        <p className="truncate font-mono text-[10px] font-bold uppercase tracking-micro text-warn">
          {teamName}
        </p>
        <p className="nums mt-0.5 font-mono leading-none text-ink">
          <span className="text-[28px] font-bold tracking-tightest">{team.goals}</span>
          <span className="text-[28px] font-bold tracking-tightest text-ink-mute">.</span>
          <span className="text-[28px] font-bold tracking-tightest">{team.behinds}</span>
          <span className="ml-1.5 text-sm font-semibold text-ink-dim">({points(team)})</span>
        </p>
      </div>

      {/* Center: dark clock pill (tap to pause/resume) */}
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

      {/* Right: opponent */}
      <div className="min-w-0 text-right">
        <p className="truncate font-mono text-[10px] font-bold uppercase tracking-micro text-warn">
          {opponentName}
        </p>
        <p className="nums mt-0.5 font-mono leading-none text-ink">
          <span className="text-[28px] font-bold tracking-tightest">{opp.goals}</span>
          <span className="text-[28px] font-bold tracking-tightest text-ink-mute">.</span>
          <span className="text-[28px] font-bold tracking-tightest">{opp.behinds}</span>
          <span className="ml-1.5 text-sm font-semibold text-ink-dim">({points(opp)})</span>
        </p>
        {onOpponent && trackScoring && (
          <div className="mt-0.5 flex justify-end gap-1">
            <button
              type="button"
              onClick={() => onOpponent("goal")}
              className="rounded-xs bg-surface-alt px-1.5 py-0.5 font-mono text-[9px] font-semibold text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-hairline hover:text-ink"
            >
              +G
            </button>
            <button
              type="button"
              onClick={() => onOpponent("behind")}
              className="rounded-xs bg-surface-alt px-1.5 py-0.5 font-mono text-[9px] font-semibold text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-hairline hover:text-ink"
            >
              +B
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
