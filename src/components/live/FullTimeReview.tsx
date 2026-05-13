"use client";

// ─── Full-Time Review ────────────────────────────────────────
// Renders between Q4 quarter_end and the game_finalised event.
// Gives the coach a chance to reconcile / edit scores with the
// opposition before locking in the result. Once they tap
// "Finalise game", the game_finalised event fires, games.status
// flips to "completed", and the GameSummaryCard takes over.
//
// Steve 2026-05-13 audit: was a 514-line bespoke implementation
// that inlined its own per-quarter score log + delete-confirm +
// add-score form (~150 lines duplicating ScoreReviewPanel, which
// netball's NetballFullTimeReview already delegates to). Now
// delegates the same way — single source of truth for "Fix
// scores" behaviour across QuarterBreak, NetballQuarterBreak,
// FullTimeReview, NetballFullTimeReview.

import { startTransition, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import { finaliseGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import { SFButton } from "@/components/sf";
import { ScoreReviewPanel } from "@/components/live/ScoreReviewPanel";
import { QuarterScoreTable } from "@/components/live/QuarterScoreTable";
import type { LiveAuth, Player } from "@/lib/types";

interface FullTimeReviewProps {
  auth: LiveAuth;
  gameId: string;
  trackScoring: boolean;
  players: Player[];
  /** Total ms elapsed at full-time, used as the metadata.elapsed_ms
   *  for the game_finalised event. */
  finalisedElapsedMs: number;
  /** Team / opponent display names for the per-quarter table headers. */
  teamName?: string;
  opponentName?: string;
}

const aflPts = (g: number, b: number) => g * 6 + b;

export function FullTimeReview({
  auth,
  gameId,
  trackScoring,
  players,
  finalisedElapsedMs,
  teamName = "Us",
  opponentName = "Them",
}: FullTimeReviewProps) {
  const router = useRouter();
  const teamScore = useLiveGame((s) => s.teamScore);
  const opponentScore = useLiveGame((s) => s.opponentScore);
  const scoreByQuarter = useLiveGame((s) => s.scoreByQuarter);

  const [finalisePending, startFinaliseTransition] = useTransition();
  const [finaliseError, setFinaliseError] = useState<string | null>(null);

  function handleFinalise() {
    setFinaliseError(null);
    startFinaliseTransition(async () => {
      const result = await finaliseGame(auth, gameId, finalisedElapsedMs);
      if (!result.success) {
        setFinaliseError(result.error);
        return;
      }
      // Flip the live store's `finalised` flag locally so LiveGame's
      // render branches re-evaluate immediately (isAtFullTime → false,
      // GameSummaryCard mounts). Without this, router.refresh()
      // re-fetches initialState but LiveGame's init effect bails early
      // (`activeGameId === gameId && hydrated`), so the store stays at
      // finalised=false and the summary card never appears.
      useLiveGame.getState().finaliseGame();
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
              {teamScore.goals}.{teamScore.behinds}{" "}
              <span className="text-base font-normal text-ink-mute">
                ({aflPts(teamScore.goals, teamScore.behinds)})
              </span>
            </p>
          </div>
          <div className="rounded-md border border-hairline bg-surface-alt p-3">
            <p className="text-[10px] font-bold uppercase tracking-micro text-ink-mute">
              Them
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
              {opponentScore.goals}.{opponentScore.behinds}{" "}
              <span className="text-base font-normal text-ink-mute">
                ({aflPts(opponentScore.goals, opponentScore.behinds)})
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Per-quarter breakdown — coach reconciles with the
          opposition AFTER full time. Same QuarterScoreTable
          component the Q-break recap + in-game modal use, so
          the data shape is consistent across surfaces.
          quarterEnded=true so Q4 renders its final tally
          instead of "in play". */}
      {trackScoring && (
        <div className="mt-4">
          <QuarterScoreTable
            scoreByQuarter={scoreByQuarter}
            currentQuarter={4}
            quarterEnded={true}
            sport="afl"
            teamName={teamName}
            opponentName={opponentName}
          />
        </div>
      )}

      {/* Fix-scores editor — delegated to ScoreReviewPanel which
          is shared with NetballFullTimeReview (and QuarterBreak's
          mid-game version). `includeBehinds=true` flips the
          add-score type picker into AFL mode (goal / behind for
          both teams). The panel handles its own load + delete-
          confirm + retro-add flows. */}
      {trackScoring && (
        <div className="mt-4 border-t border-hairline pt-3">
          <ScoreReviewPanel
            auth={auth}
            gameId={gameId}
            players={players}
            includeBehinds={true}
            defaultQuarter={4}
          />
        </div>
      )}

      {finaliseError && (
        <p
          className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {finaliseError}
        </p>
      )}

      <div className="mt-4 border-t border-hairline pt-3">
        <SFButton
          full
          size="lg"
          onClick={handleFinalise}
          loading={finalisePending}
        >
          Finalise game
        </SFButton>
        <p className="mt-2 text-center text-[11px] text-ink-mute">
          Locks the score and shows the summary you can share.
        </p>
      </div>
    </div>
  );
}
