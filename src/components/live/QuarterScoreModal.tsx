"use client";

// ─── Quarter Score Modal ───────────────────────────────────────
// Tap the "Q-by-Q" chip in the scorebug → this modal opens with
// the full quarter-by-quarter breakdown PLUS cumulative running
// totals and per-quarter lead margins. Steve's user feedback
// 2026-05-09 (after the QuarterScoreStrip shipped): "There's room
// in the in-game scorebug (under the score) to open a quarter
// by quarter modal" — the strip is glance-level, the modal is
// drill-down.
//
// Sport-aware formatting:
//   AFL      — "2.1 (13)"  (goals.behinds + total points)
//   Netball  — "3"         (goals only)

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ScoreReviewPanel } from "@/components/live/ScoreReviewPanel";
import { QuarterScoreTable } from "@/components/live/QuarterScoreTable";
import type { LiveAuth, Player } from "@/lib/types";

interface QuarterScore {
  ours: { goals: number; behinds?: number };
  theirs: { goals: number; behinds?: number };
}

interface QuarterScoreModalProps {
  /** Per-quarter scores, indexed 1..N (index 0 unused/reserved). */
  scoreByQuarter: QuarterScore[];
  /** Drives the "in play" cell + which quarters are completed. */
  currentQuarter: number;
  /** True when the most-recent quarter has ended (Q-break view). */
  quarterEnded: boolean;
  /** "afl" → goals.behinds (pts); "netball" → goals only. */
  sport: "afl" | "netball";
  /** Coach's team name + opposition — render as column headers. */
  teamName: string;
  opponentName: string;
  /** Total quarters in the game (defaults to 4). */
  totalQuarters?: number;
  /** Tap outside / close-button → fire this. */
  onClose: () => void;
  /**
   * Optional fix-scores integration. When provided, a "Fix scores"
   * collapsible section opens at the bottom of the modal so the
   * coach can delete an accidental double-tap or add a missed
   * score without waiting for the next quarter break. Steve's
   * follow-up 2026-05-09 (after QuarterScoreModal shipped):
   * "Perhaps the modal could be used for in-quarter score
   * adjustments too — if you accidentally give someone a goal
   * twice, you can unwind it from there." Reuses the same
   * ScoreReviewPanel the Q-break already exposes so the audit
   * trail (retro flag, score_undo events) is consistent.
   *
   * Omit these props to keep the modal read-only.
   */
  auth?: LiveAuth;
  gameId?: string;
  players?: Player[];
}

export function QuarterScoreModal({
  scoreByQuarter,
  currentQuarter,
  quarterEnded,
  sport,
  teamName,
  opponentName,
  totalQuarters = 4,
  onClose,
  auth,
  gameId,
  players,
}: QuarterScoreModalProps) {
  // Fix-scores section starts collapsed — most of the time the
  // coach is just glancing at the breakdown. Expanding mounts
  // ScoreReviewPanel, which fetches its own log on first open.
  const [showFixScores, setShowFixScores] = useState(false);
  const fixScoresAvailable = !!auth && !!gameId && !!players;

  return (
    <Modal size="md">
      {/* Flex column inside the Modal's max-h-capped card so a long
          Fix-scores list can scroll without pushing the Close
          button off-screen. Steve's bug 2026-05-09: "If [the
          modal] extends long it can't be closed. Need to lock
          the close button on screen." */}
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {/* Header — fixed at top */}
        <div className="flex-shrink-0">
          <p className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
            Quarter scores
          </p>
          <h2 className="text-lg font-bold text-ink">
            {teamName} <span className="text-ink-mute">vs</span> {opponentName}
          </h2>
        </div>

        {/* Scrollable middle: table + parenthetical + Fix-scores
            panel. min-h-0 is required so flex-1 actually allows
            this region to shrink and scroll inside the parent
            flex column. */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <QuarterScoreTable
          scoreByQuarter={scoreByQuarter}
          currentQuarter={currentQuarter}
          quarterEnded={quarterEnded}
          sport={sport}
          teamName={teamName}
          opponentName={opponentName}
          totalQuarters={totalQuarters}
        />

        <p className="px-1 text-[11px] text-ink-mute">
          Numbers in (parentheses) are cumulative through that quarter.
          {sport === "afl"
            ? " Format: goals.behinds (points). 6 points per goal, 1 per behind."
            : " Format: goals."}
        </p>

        {fixScoresAvailable && (
          <div className="rounded-md border border-hairline bg-surface-alt">
            <button
              type="button"
              onClick={() => setShowFixScores((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-ink-dim hover:bg-surface"
              aria-expanded={showFixScores}
            >
              <span>
                {showFixScores ? "Hide fix scores" : "Fix scores"}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-micro text-ink-mute">
                {showFixScores ? "▾" : "▸"}
              </span>
            </button>
            {showFixScores && (
              <div className="border-t border-hairline bg-surface px-3 py-3">
                <ScoreReviewPanel
                  auth={auth!}
                  gameId={gameId!}
                  players={players!}
                  includeBehinds={sport === "afl"}
                  defaultQuarter={Math.max(1, currentQuarter)}
                />
              </div>
            )}
          </div>
        )}
        </div>

        {/* Footer — pinned at the bottom of the modal card, never
            scrolls off-screen no matter how long the Fix-scores
            list grows. */}
        <Button className="w-full flex-shrink-0" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
