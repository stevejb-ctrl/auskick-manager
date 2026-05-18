"use client";

// ─── LeagueFullTimeReview ────────────────────────────────────
// Renders between the final period's quarter_end event and the
// game_finalised event. Sibling of AFL's `FullTimeReview` and
// netball's `NetballFullTimeReview` — same visual rhythm:
//
//   1. "Full time" eyebrow + reconcile message
//   2. Two side-by-side score boxes (Us / Them)
//   3. Per-period score table
//   4. "Finalise game" button
//
// AFL's `ScoreReviewPanel` is goal/behind-shaped (calls
// addRetroScore with kinds "goal"/"behind") so RL can't drop it in
// verbatim. Coaches who need to fix a try/conversion can use the
// Undo button + re-record via the scorebug — those chips stay
// enabled at full-time review (see `LeagueLiveGame`'s scorebug
// gating). A bespoke RL retro-add editor is a follow-up.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SFButton } from "@/components/sf";
import { hapticSiren } from "@/lib/haptics";
import { finaliseLeagueGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/league-actions";
import {
  leagueScoreByPeriod,
  type LeagueScoreByPeriod,
} from "@/lib/sports/rugby_league/fairness";
import type { AgeGroupConfig } from "@/lib/sports/types";
import type { GameEvent, LiveAuth } from "@/lib/types";
import type { LeagueGameState } from "@/lib/sports/rugby_league/fairness";

interface LeagueFullTimeReviewProps {
  auth: LiveAuth;
  gameId: string;
  /** Live replay state at the time of full-time. */
  state: LeagueGameState;
  /** Full event log — used for per-period score derivation. */
  events: GameEvent[];
  /** Age group — drives period label + period count. */
  ageGroup: AgeGroupConfig;
  /** Track-scoring gate — hides the score boxes when off (U6/U7 default). */
  trackScoring: boolean;
  /** ms elapsed at full-time, written into the game_finalised event metadata. */
  finalisedElapsedMs: number;
  teamName: string;
  opponentName: string;
}

export function LeagueFullTimeReview({
  auth,
  gameId,
  state,
  events,
  ageGroup,
  trackScoring,
  finalisedElapsedMs,
  teamName,
  opponentName,
}: LeagueFullTimeReviewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const periodLabel = ageGroup.periodLabel ?? "quarter";
  const periodAbbrev = periodLabel.charAt(0).toUpperCase();
  const scoreByPeriod: LeagueScoreByPeriod = leagueScoreByPeriod(
    events,
    ageGroup.periodCount,
  );

  function handleFinalise() {
    setError(null);
    startTransition(async () => {
      const result = await finaliseLeagueGame(auth, gameId, finalisedElapsedMs);
      if (!result.success) {
        setError(result.error ?? "Couldn't finalise the game.");
        return;
      }
      void hapticSiren();
      router.refresh();
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
              {teamName}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
              {state.teamScore.points}
            </p>
            <p className="text-[11px] text-ink-mute">
              {state.teamScore.tries}T · {state.teamScore.conversions}C
            </p>
          </div>
          <div className="rounded-md border border-hairline bg-surface-alt p-3">
            <p className="text-[10px] font-bold uppercase tracking-micro text-ink-mute">
              {opponentName}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
              {state.opponentScore.points}
            </p>
            <p className="text-[11px] text-ink-mute">
              {state.opponentScore.tries}T · {state.opponentScore.conversions}C
            </p>
          </div>
        </div>
      )}

      {/* Per-period reconcile table — mirrors AFL's QuarterScoreTable
          shape but with the RL T/C breakdown rather than g.b. */}
      {trackScoring && (
        <div className="mt-4 overflow-hidden rounded-md border border-hairline">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-alt">
              <tr>
                <th className="px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-micro text-ink-mute">
                  {periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1)}
                </th>
                <th className="px-2 py-1.5 text-right font-mono text-[10px] font-bold uppercase tracking-micro text-ink-mute">
                  {teamName}
                </th>
                <th className="px-2 py-1.5 text-right font-mono text-[10px] font-bold uppercase tracking-micro text-ink-mute">
                  {opponentName}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {Array.from({ length: ageGroup.periodCount }).map((_, i) => {
                const p = i + 1;
                const row = scoreByPeriod[p];
                if (!row) return null;
                return (
                  <tr key={p}>
                    <td className="px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
                      {periodAbbrev}
                      {p}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <span className="font-bold text-ink">
                        {row.team.points}
                      </span>{" "}
                      <span className="text-[10px] text-ink-mute">
                        ({row.team.tries}T · {row.team.conversions}C)
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <span className="font-bold text-ink">
                        {row.opponent.points}
                      </span>{" "}
                      <span className="text-[10px] text-ink-mute">
                        ({row.opponent.tries}T · {row.opponent.conversions}C)
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {trackScoring && (
        <p className="mt-3 text-xs text-ink-mute">
          Need to fix something? Tap{" "}
          <strong className="text-ink-dim">Undo last score</strong> on the
          scorebug, or use the <strong className="text-ink-dim">+T</strong> /{" "}
          <strong className="text-ink-dim">+C</strong> chips to add a missed
          one before finalising.
        </p>
      )}

      {error && (
        <p
          className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="mt-4 border-t border-hairline pt-3">
        <SFButton
          full
          size="lg"
          onClick={handleFinalise}
          loading={pending}
          variant="accent"
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
