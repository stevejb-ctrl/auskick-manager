"use client";

// ─── The soccer family's full time ───────────────────────────
// SoccerFullTimeReview sits between the last period's end and
// game_finalised, as AFL's FullTimeReview and league's do: the two
// score boxes, the score by half (or quarter), inline score adjustments
// (+ Goal for either side, undo the last), then "Finish game". With
// scoring off (MiniRoos) it's just the finish. SoccerGameSummaryCard is the share
// text afterwards, on the shared CopyableTextBlock.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SFButton } from "@/components/sf";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { CopyableTextBlock } from "@/components/ui/CopyableTextBlock";
import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { hapticSiren } from "@/lib/haptics";
import { finaliseSoccerGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/soccer-actions";
import type { LiveAuth, Player } from "@/lib/types";
import type { SoccerGameState } from "@/lib/sports/soccer/replay";
import { buildSoccerSummary } from "@/lib/sports/soccer/summary";

interface SoccerFullTimeReviewProps {
  auth: LiveAuth;
  gameId: string;
  state: SoccerGameState;
  periodCount: number;
  /** The age group's period word ("half", "quarter"): the score table's rows. */
  periodWord: string;
  trackScoring: boolean;
  /** ms of the last period, written on game_finalised. */
  finalisedElapsedMs: number;
  teamName: string;
  opponentName: string;
  /** + Goal for us: opens the scorer picker. */
  onTeamGoal?: () => void;
  onOpponentGoal?: () => void;
  onUndo?: () => void;
  scorePending?: boolean;
}

export function SoccerFullTimeReview({
  auth,
  gameId,
  state,
  periodCount,
  periodWord,
  trackScoring,
  finalisedElapsedMs,
  teamName,
  opponentName,
  onTeamGoal,
  onOpponentGoal,
  onUndo,
  scorePending = false,
}: SoccerFullTimeReviewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleFinalise() {
    setError(null);
    startTransition(async () => {
      const result = await finaliseSoccerGame(auth, gameId, finalisedElapsedMs);
      if (!result.success) {
        setError(result.error ?? "Couldn't finish the game.");
        return;
      }
      void hapticSiren();
      router.refresh();
    });
  }

  const box = "rounded-md border border-hairline bg-surface-alt p-3";
  const head = "font-mono text-[10px] font-bold uppercase tracking-micro text-ink-mute";

  return (
    <div className="rounded-md border border-hairline bg-surface p-4 shadow-card">
      <p className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">Full time</p>
      <p className="mt-0.5 text-base font-semibold text-ink">
        {trackScoring ? "Check the score with the other team, then finish." : "That's the game. Finish it to see everyone's minutes."}
      </p>

      {trackScoring && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className={box}>
              <p className="truncate text-[10px] font-bold uppercase tracking-micro text-ink-mute">{teamName}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{state.teamScore.goals}</p>
            </div>
            <div className={box}>
              <p className="truncate text-[10px] font-bold uppercase tracking-micro text-ink-mute">{opponentName}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{state.opponentScore.goals}</p>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-md border border-hairline">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-alt">
                <tr>
                  <th className={`px-3 py-1.5 ${head}`}>{periodWord.charAt(0).toUpperCase() + periodWord.slice(1)}</th>
                  <th className={`px-2 py-1.5 text-right ${head}`}>{teamName}</th>
                  <th className={`px-2 py-1.5 text-right ${head}`}>{opponentName}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {Array.from({ length: periodCount }).map((_, i) => {
                  const row = state.scoreByPeriod[i + 1] ?? { ours: 0, theirs: 0 };
                  return (
                    <tr key={i}>
                      <td className="px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
                        {periodWord.charAt(0).toUpperCase()}
                        {i + 1}
                      </td>
                      <td className="px-2 py-1.5 text-right font-bold tabular-nums text-ink">{row.ours}</td>
                      <td className="px-2 py-1.5 text-right font-bold tabular-nums text-ink">{row.theirs}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {(onTeamGoal || onOpponentGoal || onUndo) && (
            <section className="mt-3 rounded-md border border-hairline bg-surface-alt p-3">
              <p className={head}>Score adjustments</p>
              <p className="mt-0.5 text-[11px] text-ink-mute">Spotted a miscount? Add a missed goal, or undo the most recent one.</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {onTeamGoal && (
                  <button
                    type="button"
                    onClick={onTeamGoal}
                    disabled={scorePending}
                    className="rounded-sm bg-brand-600 px-2 py-1.5 font-mono text-[11px] font-bold uppercase tracking-micro text-white transition-colors duration-fast ease-out-quart hover:bg-brand-500 disabled:opacity-60"
                    aria-label={`Add goal, ${teamName}`}
                  >
                    + Goal
                  </button>
                )}
                {onOpponentGoal && (
                  <button
                    type="button"
                    onClick={onOpponentGoal}
                    disabled={scorePending}
                    className="rounded-sm bg-ink px-2 py-1.5 font-mono text-[11px] font-bold uppercase tracking-micro text-warm transition-colors duration-fast ease-out-quart hover:bg-ink/85 disabled:opacity-60"
                    aria-label={`Add goal, ${opponentName}`}
                  >
                    + Goal
                  </button>
                )}
              </div>
              {onUndo && (state.teamScore.goals > 0 || state.opponentScore.goals > 0) && (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={onUndo}
                    disabled={scorePending}
                    className="rounded-sm px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-micro text-warn underline-offset-2 transition-colors duration-fast ease-out-quart hover:bg-warn-soft hover:underline disabled:opacity-60"
                  >
                    ↶ Undo last goal
                  </button>
                </div>
              )}
            </section>
          )}
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

interface SoccerGameSummaryCardProps {
  /** The sport's emoji for the share text (SoccerFamilyRules.emoji). */
  emoji: string;
  state: SoccerGameState;
  squad: Player[];
  presentIds: string[];
  trackScoring: boolean;
  teamName: string;
  opponentName: string;
  /** The arrival halo on first mount (the live page, not the game page). */
  showArrivalPulse?: boolean;
}

export function SoccerGameSummaryCard({
  emoji,
  state,
  squad,
  presentIds,
  trackScoring,
  teamName,
  opponentName,
  showArrivalPulse = false,
}: SoccerGameSummaryCardProps) {
  const summary = buildSoccerSummary({ emoji, teamName, opponentName, trackScoring, state, squad, presentIds });
  const card = (
    <div className={`rounded-md border border-hairline bg-surface p-4 shadow-card ${showArrivalPulse ? "animate-slide-up" : ""}`}>
      <CopyableTextBlock title="Game summary" text={summary} textId="soccer-game-summary-text" />
    </div>
  );
  if (!showArrivalPulse) return card;
  return (
    <SirenPulseHalo triggerKey="ft" size="lg" display="block" className="rounded-md">
      {card}
    </SirenPulseHalo>
  );
}
