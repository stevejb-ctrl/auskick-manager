"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface QuarterEndModalProps {
  quarter: number;
  loading?: boolean;
  /**
   * Home team name + score for the embedded scorebug. Steve
   * 2026-05-13: the late-score affordance used to be a single pair
   * of chips that only attributed to our team — but the same
   * "landed on the siren" scenario plays out for the opposition
   * too. Embed the live scorebug here so the coach has the SAME
   * +G/+B chips they use in-play, for BOTH teams, at the moment
   * the hooter fires.
   */
  teamName: string;
  opponentName: string;
  teamScore: { goals: number; behinds: number };
  opponentScore: { goals: number; behinds: number };
  /** False → hide all +G/+B chips. Matches the in-play scorebug behaviour. */
  trackScoring: boolean;
  /**
   * Tap own-team +G / +B inside the modal. Parent opens the
   * player-attribution picker (SlotFillSheet) — the chip itself
   * doesn't record the score until a scorer is picked.
   */
  onTeamLateScore?: (kind: "goal" | "behind") => void;
  /**
   * Tap opponent +G / +B inside the modal. Parent's handler
   * increments the opposition tally directly (no scorer picker —
   * we don't track opposition players).
   */
  onOpponentLateScore?: (kind: "goal" | "behind") => void;
  onConfirm: () => void;
}

function points(s: { goals: number; behinds: number }) {
  return s.goals * 6 + s.behinds;
}

export function QuarterEndModal({
  quarter,
  loading,
  teamName,
  opponentName,
  teamScore,
  opponentScore,
  trackScoring,
  onTeamLateScore,
  onOpponentLateScore,
  onConfirm,
}: QuarterEndModalProps) {
  const isLastQuarter = quarter >= 4;
  return (
    <Modal>
      <h2 className="text-center text-lg font-bold text-ink">
        Quarter {quarter} complete
      </h2>
      <p className="mt-1 text-center text-sm text-ink-dim">
        {isLastQuarter ? "That's the final whistle!" : `Ready for Q${quarter + 1}?`}
      </p>

      {/* Embedded mini-scorebug — mirrors the in-play GameHeader
          rhythm (small team label, big total + small G·B, +G/+B
          chips below) but in a card-on-modal layout. Both teams
          have full +G/+B chips so a "goal on the siren" can be
          attributed for either side without leaving this modal. */}
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-start gap-2 rounded-md bg-surface-alt px-3 py-3">
        {/* Home team */}
        <div className="min-w-0">
          <p className="truncate font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
            {teamName}
          </p>
          <p className="nums mt-0.5 flex items-baseline gap-1.5 font-mono leading-none text-ink">
            <span className="text-sm font-semibold text-ink-dim">
              {teamScore.goals}
              <span className="text-ink-mute">·</span>
              {teamScore.behinds}
            </span>
            <span className="text-2xl font-bold tracking-tightest">
              {points(teamScore)}
            </span>
          </p>
          {trackScoring && onTeamLateScore && (
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button"
                onClick={() => onTeamLateScore("goal")}
                disabled={loading}
                className="rounded-md bg-surface px-2.5 py-1.5 font-mono text-xs font-semibold text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-hairline hover:text-ink disabled:pointer-events-none disabled:opacity-60"
              >
                +G
              </button>
              <button
                type="button"
                onClick={() => onTeamLateScore("behind")}
                disabled={loading}
                className="rounded-md bg-surface px-2.5 py-1.5 font-mono text-xs font-semibold text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-hairline hover:text-ink disabled:pointer-events-none disabled:opacity-60"
              >
                +B
              </button>
            </div>
          )}
        </div>

        {/* Center label: indicates the quarter just ended. */}
        <div className="flex flex-col items-center justify-center self-center px-1">
          <span className="font-mono text-[10px] font-bold uppercase tracking-micro text-ink-mute">
            on the
          </span>
          <span className="font-mono text-[10px] font-bold uppercase tracking-micro text-ink">
            siren
          </span>
        </div>

        {/* Opponent — mirror of home */}
        <div className="min-w-0 text-right">
          <p className="truncate font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
            {opponentName}
          </p>
          <p className="nums mt-0.5 flex items-baseline justify-end gap-1.5 font-mono leading-none text-ink">
            <span className="text-2xl font-bold tracking-tightest">
              {points(opponentScore)}
            </span>
            <span className="text-sm font-semibold text-ink-dim">
              {opponentScore.goals}
              <span className="text-ink-mute">·</span>
              {opponentScore.behinds}
            </span>
          </p>
          {trackScoring && onOpponentLateScore && (
            <div className="mt-1.5 flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => onOpponentLateScore("goal")}
                disabled={loading}
                className="rounded-md bg-surface px-2.5 py-1.5 font-mono text-xs font-semibold text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-hairline hover:text-ink disabled:pointer-events-none disabled:opacity-60"
              >
                +G
              </button>
              <button
                type="button"
                onClick={() => onOpponentLateScore("behind")}
                disabled={loading}
                className="rounded-md bg-surface px-2.5 py-1.5 font-mono text-xs font-semibold text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-hairline hover:text-ink disabled:pointer-events-none disabled:opacity-60"
              >
                +B
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4">
        <Button className="w-full" size="lg" onClick={onConfirm} loading={loading}>
          {isLastQuarter ? "End game" : `Select team for Q${quarter + 1}`}
        </Button>
      </div>
    </Modal>
  );
}
