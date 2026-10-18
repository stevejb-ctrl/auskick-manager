"use client";

// ─── Basketball full time ────────────────────────────────────
// BasketballFullTimeReview sits between the last period's end and
// game_finalised, as AFL's FullTimeReview and soccer's do: the two score
// boxes, the score by period, inline score adjustments (+1/+2/+3 for
// either side, undo the last), then "Finish game". With scoring off it's
// just the finish. BasketballGameSummaryCard is the share text
// afterwards, on the shared CopyableTextBlock.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SFButton } from "@/components/sf";
import { InlineAlert } from "@/components/ui/InlineAlert";
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const chips: Points[] = threePointers ? [1, 2, 3] : [1, 2];

  function handleFinalise() {
    setError(null);
    startTransition(async () => {
      const result = await finaliseBasketballGame(auth, gameId, finalisedElapsedMs);
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
  const chip =
    "rounded-sm px-2 py-1.5 font-mono text-[11px] font-bold uppercase tracking-micro transition-colors duration-fast ease-out-quart disabled:opacity-60";

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

          <div className="mt-4 overflow-hidden rounded-md border border-hairline">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-alt">
                <tr>
                  <th className={`px-3 py-1.5 ${head}`}>{periodLetter === "Q" ? "Quarter" : "Half"}</th>
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
                        {periodLetter}
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

          {(onTeamScore || onOpponentScore || onUndo) && (
            <section className="mt-3 rounded-md border border-hairline bg-surface-alt p-3">
              <p className={head}>Score adjustments</p>
              <p className="mt-0.5 text-[11px] text-ink-mute">Spotted a miscount? Add a missed basket, or undo the most recent one.</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {onTeamScore && (
                  <div className="flex gap-1.5">
                    {chips.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => onTeamScore(n)}
                        disabled={scorePending}
                        className={`${chip} flex-1 bg-brand-600 text-white hover:bg-brand-500`}
                        aria-label={`Add ${n}, ${teamName}`}
                      >
                        +{n}
                      </button>
                    ))}
                  </div>
                )}
                {onOpponentScore && (
                  <div className="flex gap-1.5">
                    {chips.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => onOpponentScore(n)}
                        disabled={scorePending}
                        className={`${chip} flex-1 bg-ink text-warm hover:bg-ink/85`}
                        aria-label={`Add ${n}, ${opponentName}`}
                      >
                        +{n}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {onUndo && (state.teamScore.points > 0 || state.opponentScore.points > 0) && (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={onUndo}
                    disabled={scorePending}
                    className="rounded-sm px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-micro text-warn underline-offset-2 transition-colors duration-fast ease-out-quart hover:bg-warn-soft hover:underline disabled:opacity-60"
                  >
                    ↶ Undo last basket
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
