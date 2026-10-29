"use client";

// ─── Touch family full time ──────────────────────────────────
// TouchFullTimeReview sits between the last period's end and
// game_finalised, as AFL's FullTimeReview and basketball's do: the two
// score boxes, then the shared BreakScoreEditor — the score by half, a
// missed try for either side on buttons that name their team (the
// scorebug's 44 pt chips, Oztag's girl's try too), and Undo — then
// "Finish game". The live scorebug's chips and undo strip are gone by now
// (UX audit 23 Oct 2026). With scoring off it's just the finish. TouchGameSummaryCard is the
// share text afterwards, on the shared CopyableTextBlock.

import { useRouter } from "next/navigation";
import { SFButton } from "@/components/sf";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useFinishGame } from "@/components/live/useFinishGame";
import { BreakScoreEditor } from "@/components/quarter-break/BreakScoreEditor";
import { CopyableTextBlock } from "@/components/ui/CopyableTextBlock";
import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { hapticSiren } from "@/lib/haptics";
import { finaliseTouchGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/touch-actions";
import type { LiveAuth, Player } from "@/lib/types";
import type { TouchGameState } from "@/lib/sports/touch/replay";
import { buildTouchSummary } from "@/lib/sports/touch/summary";
import { touchOpponentChips } from "@/components/touch/touchWords";

interface TouchFullTimeReviewProps {
  auth: LiveAuth;
  gameId: string;
  state: TouchGameState;
  periodCount: number;
  /** "H" for halves; "" for one period. */
  periodLetter: string;
  trackScoring: boolean;
  /** A girl's try counts 2 (Oztag mixed). */
  girlsTryDouble: boolean;
  /** ms of the last period, written on game_finalised. */
  finalisedElapsedMs: number;
  teamName: string;
  opponentName: string;
  /** A try for us: opens the scorer picker. */
  onTeamScore?: () => void;
  onOpponentScore?: (girl: boolean) => void;
  onUndo?: () => void;
  scorePending?: boolean;
}

export function TouchFullTimeReview({
  auth,
  gameId,
  state,
  periodCount,
  periodLetter,
  trackScoring,
  girlsTryDouble,
  finalisedElapsedMs,
  teamName,
  opponentName,
  onTeamScore,
  onOpponentScore,
  onUndo,
  scorePending = false,
}: TouchFullTimeReviewProps) {
  const router = useRouter();
  // A failure keeps this screen up, and Finish is safe to tap again.
  const { finish: handleFinalise, pending, error } = useFinishGame(
    (key) => finaliseTouchGame(auth, gameId, finalisedElapsedMs, key),
    () => {
      void hapticSiren();
      router.refresh();
    },
  );

  const box = "rounded-md border border-hairline bg-surface-alt p-3";

  return (
    <div className="rounded-md border border-hairline bg-surface p-4 shadow-card">
      <p className="font-mono text-micro font-bold uppercase tracking-micro text-ink-mute">Full time</p>
      <p className="mt-0.5 text-base font-semibold text-ink">
        {trackScoring ? "Check the score with the referee, then finish." : "That's the game. Finish it to see everyone's minutes."}
      </p>

      {trackScoring && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className={box}>
              <p className="truncate text-nano font-bold uppercase tracking-micro text-ink-mute">{teamName}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{state.teamScore.points}</p>
            </div>
            <div className={box}>
              <p className="truncate text-nano font-bold uppercase tracking-micro text-ink-mute">{opponentName}</p>
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
              periodLetter={periodLetter || "P"}
              periodWord={periodCount > 1 ? "half" : "period"}
              teamChips={onTeamScore ? [{ key: "try", text: "+T", label: `Add a try, ${teamName}`, onClick: onTeamScore }] : []}
              opponentChips={
                onOpponentScore
                  ? touchOpponentChips(girlsTryDouble, opponentName).map((c) => ({
                      key: c.key,
                      text: c.text,
                      sub: c.sub,
                      label: c.label,
                      onClick: () => onOpponentScore(c.girl),
                    }))
                  : []
              }
              missedNote={`Spotted a miscount? A try you missed counts in ${periodLetter || "P"}${periodCount}.`}
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
        <p className="mt-2 text-center text-micro text-ink-mute">Locks the game and shows the summary you can share.</p>
      </div>
    </div>
  );
}

interface TouchGameSummaryCardProps {
  state: TouchGameState;
  squad: Player[];
  presentIds: string[];
  trackScoring: boolean;
  teamName: string;
  opponentName: string;
  /** The arrival halo on first mount (the live page, not the game page). */
  showArrivalPulse?: boolean;
}

export function TouchGameSummaryCard({
  state,
  squad,
  presentIds,
  trackScoring,
  teamName,
  opponentName,
  showArrivalPulse = false,
}: TouchGameSummaryCardProps) {
  const summary = buildTouchSummary({ teamName, opponentName, trackScoring, state, squad, presentIds });
  const card = (
    <div className={`rounded-md border border-hairline bg-surface p-4 shadow-card ${showArrivalPulse ? "animate-slide-up" : ""}`}>
      <CopyableTextBlock title="Game summary" text={summary} textId="touch-game-summary-text" />
    </div>
  );
  if (!showArrivalPulse) return card;
  return (
    <SirenPulseHalo triggerKey="ft" size="lg" display="block" className="rounded-md">
      {card}
    </SirenPulseHalo>
  );
}
