"use client";

// ─── Basketball full time ────────────────────────────────────
// BasketballFullTimeReview sits between the last period's end and
// game_finalised, as AFL's FullTimeReview and soccer's do: the two score
// boxes, then the shared BreakScoreEditor (the break's score sheet) —
// the score by period, a missed basket for either side on buttons that
// name their team and the points (the scorebug's 44 pt chip), and Undo
// last score — then "Finish game". The live scorebug's chips and undo
// strip are gone by now (UX audit 23 Oct 2026: six unlabelled +1/+2/+3
// by colour only, "Undo last basket" for a free throw). With scoring off
// it's just the finish. BasketballGameSummaryCard is the share text
// afterwards, on the shared CopyableTextBlock.

import { useRouter } from "next/navigation";
import { SFButton } from "@/components/sf";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useFinishGame } from "@/components/live/useFinishGame";
import { BreakScoreEditor } from "@/components/quarter-break/BreakScoreEditor";
import { basketballPointsWords } from "@/lib/sports/basketball/scoreEvents";
import { CopyableTextBlock } from "@/components/ui/CopyableTextBlock";
import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { hapticSiren } from "@/lib/haptics";
import { finaliseBasketballGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/basketball-actions";
import type { LiveAuth, Player } from "@/lib/types";
import type { BasketballGameState } from "@/lib/sports/basketball/replay";
import { buildBasketballSummary } from "@/lib/sports/basketball/summary";

type Points = 1 | 2 | 3;

interface BasketballFullTimeReviewProps {
  auth: LiveAuth;
  gameId: string;
  state: BasketballGameState;
  periodCount: number;
  /** "H" for halves, "Q" for quarters. */
  periodLetter: string;
  trackScoring: boolean;
  threePointers: boolean;
  /** ms of the last period, written on game_finalised. */
  finalisedElapsedMs: number;
  teamName: string;
  opponentName: string;
  /** Points for us: opens the scorer picker. */
  onTeamScore?: (points: Points) => void;
  onOpponentScore?: (points: Points) => void;
  onUndo?: () => void;
  scorePending?: boolean;
}

export function BasketballFullTimeReview({
  auth,
  gameId,
  state,
  periodCount,
  periodLetter,
  trackScoring,
  threePointers,
  finalisedElapsedMs,
  teamName,
  opponentName,
  onTeamScore,
  onOpponentScore,
  onUndo,
  scorePending = false,
}: BasketballFullTimeReviewProps) {
  const router = useRouter();
  // A failure keeps this screen up, and Finish is safe to tap again.
  const { finish: handleFinalise, pending, error } = useFinishGame(
    (key) => finaliseBasketballGame(auth, gameId, finalisedElapsedMs, key),
    () => {
      void hapticSiren();
      router.refresh();
    },
  );
  const chips: Points[] = threePointers ? [1, 2, 3] : [1, 2];

  const box = "rounded-md border border-hairline bg-surface-alt p-3";

  return (
    <div className="rounded-md border border-hairline bg-surface p-4 shadow-card">
      <p className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">Full time</p>
      <p className="mt-0.5 text-base font-semibold text-ink">
        {trackScoring ? "Check the score with the table, then finish." : "That's the game. Finish it to see everyone's minutes."}
      </p>

      {trackScoring && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className={box}>
              <p className="truncate text-[10px] font-bold uppercase tracking-micro text-ink-mute">{teamName}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{state.teamScore.points}</p>
            </div>
            <div className={box}>
              <p className="truncate text-[10px] font-bold uppercase tracking-micro text-ink-mute">{opponentName}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{state.opponentScore.points}</p>
            </div>
          </div>

          <div className="mt-4">
            <BreakScoreEditor
              teamName={teamName}
              opponentName={opponentName}
              teamPoints={state.teamScore.points}
              opponentPoints={state.opponentScore.points}
              scoreByPeriod={state.scoreByPeriod}
              periodCount={periodCount}
              currentPeriod={periodCount}
              periodLetter={periodLetter}
              periodWord={periodLetter === "Q" ? "quarter" : "half"}
              teamChips={
                onTeamScore
                  ? chips.map((n) => ({
                      key: String(n),
                      text: `+${n}`,
                      label: `Add ${basketballPointsWords(n)}, ${teamName}`,
                      onClick: () => onTeamScore(n),
                    }))
                  : []
              }
              opponentChips={
                onOpponentScore
                  ? chips.map((n) => ({
                      key: String(n),
                      text: `+${n}`,
                      label: `Add ${basketballPointsWords(n)}, ${opponentName}`,
                      onClick: () => onOpponentScore(n),
                    }))
                  : []
              }
              missedNote={`Spotted a miscount? A basket you missed counts in ${periodLetter}${periodCount}.`}
              onUndo={onUndo ?? (() => {})}
              undoDisabled={scorePending || !onUndo}
            />
          </div>
        </>
      )}

      {error && <InlineAlert className="mt-3">{error}</InlineAlert>}

      <div className="mt-4 border-t border-hairline pt-3">
        <SFButton full size="lg" onClick={handleFinalise} loading={pending} variant="accent">
          Finish game
        </SFButton>
        <p className="mt-2 text-center text-[11px] text-ink-mute">Locks the game and shows the summary you can share.</p>
      </div>
    </div>
  );
}

interface BasketballGameSummaryCardProps {
  state: BasketballGameState;
  squad: Player[];
  presentIds: string[];
  trackScoring: boolean;
  teamName: string;
  opponentName: string;
  /** The arrival halo on first mount (the live page, not the game page). */
  showArrivalPulse?: boolean;
}

export function BasketballGameSummaryCard({
  state,
  squad,
  presentIds,
  trackScoring,
  teamName,
  opponentName,
  showArrivalPulse = false,
}: BasketballGameSummaryCardProps) {
  const summary = buildBasketballSummary({ teamName, opponentName, trackScoring, state, squad, presentIds });
  const card = (
    <div className={`rounded-md border border-hairline bg-surface p-4 shadow-card ${showArrivalPulse ? "animate-slide-up" : ""}`}>
      <CopyableTextBlock title="Game summary" text={summary} textId="basketball-game-summary-text" />
    </div>
  );
  if (!showArrivalPulse) return card;
  return (
    <SirenPulseHalo triggerKey="ft" size="lg" display="block" className="rounded-md">
      {card}
    </SirenPulseHalo>
  );
}
