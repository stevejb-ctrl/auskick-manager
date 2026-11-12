"use client";

// ─── Netball full time ───────────────────────────────────────
// NetballFullTimeReview sits between Q4's end and game_finalised, as
// the other sports' full times do (SoccerFullTimeReview, touch's,
// basketball's, league's): the two score boxes, then the shared
// BreakScoreEditor — the score by quarter, a missed goal for either side
// on buttons that name their team (the scorebug's 44 pt chip; ours opens
// the GS / GA picker, as only they can score), Undo last score, and the
// game's goals with "Change who scored" — then "Finish game". It was
// the older review: "Us" / "Them" boxes and the AFL-shaped Fix scores
// panel (Steve, 10 Nov 2026: netball's full time in the old look).
// With scoring off it's just the finish. NetballGameSummaryCard (time in
// each third) is the share text afterwards.

import { useRouter } from "next/navigation";
import { finaliseNetballGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/netball-actions";
import { hapticSiren } from "@/lib/haptics";
import { SFButton } from "@/components/sf";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useFinishGame } from "@/components/live/useFinishGame";
import { BreakScoreEditor } from "@/components/quarter-break/BreakScoreEditor";
import type { LiveAuth } from "@/lib/types";

interface NetballFullTimeReviewProps {
  auth: LiveAuth;
  gameId: string;
  trackScoring: boolean;
  /** Team / opponent goals (netball is goals-only). */
  teamScore: { goals: number };
  opponentScore: { goals: number };
  /**
   * The score by quarter, in the AFL store's shape: index 0 unused,
   * 1..periodCount each quarter's goals (behinds always 0).
   */
  scoreByQuarter: Array<{
    ours: { goals: number };
    theirs: { goals: number };
  }>;
  /** The age group's quarters (4). */
  periodCount: number;
  /** ms elapsed at full time — passed to game_finalised event. */
  finalisedElapsedMs: number;
  /**
   * Q4's mid-quarter subs. There's no break after Q4 to write them, so
   * finalise does (they were lost: a Q4 replacement got no time).
   */
  midQuarterSubs?: { positionId: string; outPlayerId: string | null; inPlayerId: string | null; atMs: number }[];
  teamName: string;
  opponentName: string;
  /** + Goal for us: opens the GS / GA picker. */
  onTeamGoal?: () => void;
  onOpponentGoal?: () => void;
  /** Takes back the game's latest goal. */
  onUndo?: () => void;
  scorePending?: boolean;
}

export function NetballFullTimeReview({
  auth,
  gameId,
  trackScoring,
  teamScore,
  opponentScore,
  scoreByQuarter,
  periodCount,
  finalisedElapsedMs,
  midQuarterSubs = [],
  teamName,
  opponentName,
  onTeamGoal,
  onOpponentGoal,
  onUndo,
  scorePending = false,
}: NetballFullTimeReviewProps) {
  const router = useRouter();
  // A failure keeps this screen up, and Finish is safe to tap again
  // (it used to throw into the error boundary: "Failed to fetch").
  const { finish: handleFinalise, pending, error } = useFinishGame(
    (key) => finaliseNetballGame(auth, gameId, finalisedElapsedMs, midQuarterSubs, key),
    () => {
      // Full time IS a sirenic moment, as the quarter-end hooter.
      void hapticSiren();
      router.refresh();
    },
  );

  const scoreByPeriod: Record<number, { ours: number; theirs: number }> = {};
  for (let q = 1; q <= periodCount; q++) {
    scoreByPeriod[q] = { ours: scoreByQuarter[q]?.ours.goals ?? 0, theirs: scoreByQuarter[q]?.theirs.goals ?? 0 };
  }
  const box = "rounded-md border border-hairline bg-surface-alt p-3";

  return (
    <div className="rounded-md border border-hairline bg-surface p-4 shadow-card">
      <p className="font-mono text-micro font-bold uppercase tracking-micro text-ink-mute">Full time</p>
      <p className="mt-0.5 text-base font-semibold text-ink">
        {trackScoring ? "Check the score with the other team, then finish." : "That's the game. Finish it to see everyone's minutes."}
      </p>

      {trackScoring && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className={box}>
              <p className="truncate text-nano font-bold uppercase tracking-micro text-ink-mute">{teamName}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{teamScore.goals}</p>
            </div>
            <div className={box}>
              <p className="truncate text-nano font-bold uppercase tracking-micro text-ink-mute">{opponentName}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{opponentScore.goals}</p>
            </div>
          </div>

          <div className="mt-4">
            <BreakScoreEditor
              teamName={teamName}
              opponentName={opponentName}
              teamPoints={teamScore.goals}
              opponentPoints={opponentScore.goals}
              scoreByPeriod={scoreByPeriod}
              periodCount={periodCount}
              currentPeriod={periodCount}
              periodLetter="Q"
              periodWord="quarter"
              teamChips={onTeamGoal ? [{ key: "goal", text: "+G", label: `Add goal, ${teamName}`, onClick: onTeamGoal }] : []}
              opponentChips={
                onOpponentGoal ? [{ key: "goal", text: "+G", label: `Add goal, ${opponentName}`, onClick: onOpponentGoal }] : []
              }
              missedNote={`Spotted a miscount? A goal you missed counts in Q${periodCount}.`}
              onUndo={onUndo ?? (() => {})}
              undoDisabled={scorePending || !onUndo}
              fix={{ auth, gameId }}
            />
          </div>
        </>
      )}

      {error && <InlineAlert className="mt-3">{error}</InlineAlert>}

      <div className="mt-4 border-t border-hairline pt-3">
        <SFButton full size="lg" onClick={handleFinalise} loading={pending} variant="accent">
          Finish game
        </SFButton>
        <p className="mt-2 text-center text-micro text-ink-mute">Locks the game and shows the summary you can share.</p>
      </div>
    </div>
  );
}
