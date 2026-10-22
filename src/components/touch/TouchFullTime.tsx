"use client";

// ─── Touch family full time ──────────────────────────────────
// TouchFullTimeReview sits between the last period's end and
// game_finalised, as AFL's FullTimeReview and basketball's do: the two
// score boxes, the score by period, inline score adjustments (a try for
// either side, Oztag's girl's try, undo the last), then "Finish game".
// With scoring off it's just the finish. TouchGameSummaryCard is the
// share text afterwards, on the shared CopyableTextBlock.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SFButton } from "@/components/sf";
import { InlineAlert } from "@/components/ui/InlineAlert";
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleFinalise() {
    setError(null);
    startTransition(async () => {
      const result = await finaliseTouchGame(auth, gameId, finalisedElapsedMs);
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
  const opponentChips = touchOpponentChips(girlsTryDouble, opponentName);

  return (
    <div className="rounded-md border border-hairline bg-surface p-4 shadow-card">
      <p className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">Full time</p>
      <p className="mt-0.5 text-base font-semibold text-ink">
        {trackScoring ? "Check the score with the referee, then finish." : "That's the game. Finish it to see everyone's minutes."}
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

          {periodCount > 1 && (
            <div className="mt-4 overflow-hidden rounded-md border border-hairline">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-alt">
                  <tr>
                    <th className={`px-3 py-1.5 ${head}`}>Half</th>
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
          )}

          {(onTeamScore || onOpponentScore || onUndo) && (
            <section className="mt-3 rounded-md border border-hairline bg-surface-alt p-3">
              <p className={head}>Score adjustments</p>
              <p className="mt-0.5 text-[11px] text-ink-mute">Spotted a miscount? Add a missed try, or undo the most recent one.</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {onTeamScore && (
                  <button
                    type="button"
                    onClick={onTeamScore}
                    disabled={scorePending}
                    className={`${chip} bg-brand-600 text-white hover:bg-brand-500`}
                    aria-label={`Add a try, ${teamName}`}
                  >
                    +T
                  </button>
                )}
                {onOpponentScore && (
                  <div className="flex gap-1.5">
                    {opponentChips.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => onOpponentScore(c.girl)}
                        disabled={scorePending}
                        className={`${chip} flex-1 bg-ink text-warm hover:bg-ink/85`}
                        aria-label={c.label}
                      >
                        {c.sub ? `${c.text} ${c.sub}` : c.text}
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
                    ↶ Undo last try
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
