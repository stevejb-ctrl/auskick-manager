"use client";

// ─── Netball Full-Time Review ────────────────────────────────
// Mirrors AFL's FullTimeReview, sized for netball: shows current
// scores (goal-only — no behinds), a per-quarter Fix-scores panel,
// and a "Finalise game" CTA. Renders between the Q4 quarter_end
// event and the game_finalised event so the coach can reconcile
// with the opposition before locking in the result.

import { startTransition, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { finaliseNetballGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/netball-actions";
import { Button } from "@/components/ui/Button";
import { ScoreReviewPanel } from "@/components/live/ScoreReviewPanel";
import { QuarterScoreTable } from "@/components/live/QuarterScoreTable";
import type { LiveAuth, Player } from "@/lib/types";

interface NetballFullTimeReviewProps {
  auth: LiveAuth;
  gameId: string;
  trackScoring: boolean;
  /** Current cumulative team / opponent goal counts (netball is goals-only). */
  teamScore: { goals: number };
  opponentScore: { goals: number };
  /** Per-quarter score breakdown shaped to match the AFL store / QuarterScoreTable
   *  contract: index 0 unused, indices 1..4 carry the per-quarter totals. The
   *  inner `{goals, behinds}` shape lets us share the table component with AFL —
   *  netball just always reports 0 behinds. */
  scoreByQuarter: Array<{
    ours: { goals: number; behinds: number };
    theirs: { goals: number; behinds: number };
  }>;
  /** Squad players for the add-score picker. */
  players: Player[];
  /** ms elapsed at full time — passed to game_finalised event. */
  finalisedElapsedMs: number;
  /** Display names for the per-quarter table headers. */
  teamName?: string;
  opponentName?: string;
}

export function NetballFullTimeReview({
  auth,
  gameId,
  trackScoring,
  teamScore,
  opponentScore,
  scoreByQuarter,
  players,
  finalisedElapsedMs,
  teamName = "Us",
  opponentName = "Them",
}: NetballFullTimeReviewProps) {
  const router = useRouter();
  const [finalisePending, startFinaliseTransition] = useTransition();
  const [finaliseError, setFinaliseError] = useState<string | null>(null);

  function handleFinalise() {
    setFinaliseError(null);
    startFinaliseTransition(async () => {
      const result = await finaliseNetballGame(auth, gameId, finalisedElapsedMs);
      if (!result.success) {
        setFinaliseError(result.error);
        return;
      }
      startTransition(() => router.refresh());
    });
  }

  return (
    <div className="rounded-md border border-hairline bg-surface p-4 shadow-card">
      <p className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
        Full time
      </p>
      <p className="mt-0.5 text-base font-semibold text-ink">
        Reconcile the score with the other team, then finalise.
      </p>

      {trackScoring && (
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border border-hairline bg-surface-alt p-3">
            <p className="text-[10px] font-bold uppercase tracking-micro text-ink-mute">
              Us
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
              {teamScore.goals}
            </p>
          </div>
          <div className="rounded-md border border-hairline bg-surface-alt p-3">
            <p className="text-[10px] font-bold uppercase tracking-micro text-ink-mute">
              Them
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
              {opponentScore.goals}
            </p>
          </div>
        </div>
      )}

      {trackScoring && (
        <div className="mt-4">
          <QuarterScoreTable
            scoreByQuarter={scoreByQuarter}
            currentQuarter={4}
            quarterEnded={true}
            sport="netball"
            teamName={teamName}
            opponentName={opponentName}
          />
        </div>
      )}

      {trackScoring && (
        <div className="mt-4 border-t border-hairline pt-3">
          <ScoreReviewPanel
            auth={auth}
            gameId={gameId}
            players={players}
            includeBehinds={false}
            defaultQuarter={4}
          />
        </div>
      )}

      {finaliseError && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {finaliseError}
        </p>
      )}

      <div className="mt-4 border-t border-hairline pt-3">
        <Button
          className="w-full"
          size="lg"
          onClick={handleFinalise}
          loading={finalisePending}
        >
          Finalise game
        </Button>
        <p className="mt-2 text-center text-[11px] text-ink-mute">
          Locks the score and shows the summary you can share.
        </p>
      </div>
    </div>
  );
}
