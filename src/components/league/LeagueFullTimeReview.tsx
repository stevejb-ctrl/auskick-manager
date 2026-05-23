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
  /** True when the age group has goal-kicking (U8+); gates conversion chips. */
  kickingAllowed?: boolean;
  /** ms elapsed at full-time, written into the game_finalised event metadata. */
  finalisedElapsedMs: number;
  teamName: string;
  opponentName: string;
  /**
   * Score-edit callbacks — same chips the live scorebug surfaces,
   * embedded inline in the review card so the coach can reconcile
   * the score without scrolling to the sticky scorebar (Steve
   * 2026-05-23: the bottom chips were too easy to miss).
   *
   * Each callback maps 1:1 to a LeagueScoreBug action:
   *   onTeamTry         → opens the scorer picker
   *   onTeamConversion  → opens the conversion dialog
   *   onOpponentTry     → direct write
   *   onOpponentConversion → direct write
   *   onUndo            → undo the most recent surviving scoring event
   *
   * All callbacks optional — if a sport / age group disables a chip
   * upstream (e.g. U6 has no scoring), the matching button hides.
   */
  onTeamTry?: () => void;
  onTeamConversion?: () => void;
  onOpponentTry?: () => void;
  onOpponentConversion?: () => void;
  onUndo?: () => void;
  /** Pending guard — disables chips while a write is in flight. */
  scorePending?: boolean;
}

export function LeagueFullTimeReview({
  auth,
  gameId,
  state,
  events,
  ageGroup,
  trackScoring,
  kickingAllowed = false,
  finalisedElapsedMs,
  teamName,
  opponentName,
  onTeamTry,
  onTeamConversion,
  onOpponentTry,
  onOpponentConversion,
  onUndo,
  scorePending = false,
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

      {/* Inline score-adjustments panel — same chips the live
          scorebug exposes, surfaced HERE so the coach doesn't have
          to scroll down to the sticky scorebar to fix a miscount.
          +T / +C add a missed score (+T opens the scorer picker
          for our team; +C opens the conversion dialog when kicking
          is allowed). Opponent +T / +C write directly because
          there's no scorer to attribute. Undo pops the most
          recent surviving scoring event (LIFO). Hidden entirely
          when scoring is off. Steve 2026-05-23. */}
      {trackScoring && (onTeamTry || onTeamConversion || onOpponentTry || onOpponentConversion || onUndo) && (
        <section className="mt-3 rounded-md border border-hairline bg-surface-alt p-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-micro text-ink-mute">
            Score adjustments
          </p>
          <p className="mt-0.5 text-[11px] text-ink-mute">
            Spotted a miscount? Add a missed score with +T / +C, or
            undo the most recent one.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="space-y-1.5 rounded-md border border-hairline bg-surface p-2">
              <p className="truncate text-[10px] font-bold uppercase tracking-micro text-ink-mute">
                {teamName}
              </p>
              <div className="flex gap-1.5">
                {onTeamTry && (
                  <button
                    type="button"
                    onClick={onTeamTry}
                    disabled={scorePending}
                    className="flex-1 rounded-sm bg-brand-600 px-2 py-1.5 font-mono text-[11px] font-bold uppercase tracking-micro text-white transition-colors duration-fast ease-out-quart hover:bg-brand-500 disabled:opacity-60"
                  >
                    + Try
                  </button>
                )}
                {onTeamConversion && kickingAllowed && (
                  <button
                    type="button"
                    onClick={onTeamConversion}
                    disabled={scorePending}
                    className="flex-1 rounded-sm border border-brand-500 bg-surface px-2 py-1.5 font-mono text-[11px] font-bold uppercase tracking-micro text-brand-700 transition-colors duration-fast ease-out-quart hover:bg-brand-50 disabled:opacity-60"
                  >
                    + Conv
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-1.5 rounded-md border border-hairline bg-surface p-2">
              <p className="truncate text-[10px] font-bold uppercase tracking-micro text-ink-mute">
                {opponentName}
              </p>
              <div className="flex gap-1.5">
                {onOpponentTry && (
                  <button
                    type="button"
                    onClick={onOpponentTry}
                    disabled={scorePending}
                    className="flex-1 rounded-sm bg-ink px-2 py-1.5 font-mono text-[11px] font-bold uppercase tracking-micro text-warm transition-colors duration-fast ease-out-quart hover:bg-ink/85 disabled:opacity-60"
                  >
                    + Try
                  </button>
                )}
                {onOpponentConversion && kickingAllowed && (
                  <button
                    type="button"
                    onClick={onOpponentConversion}
                    disabled={scorePending}
                    className="flex-1 rounded-sm border border-ink/40 bg-surface px-2 py-1.5 font-mono text-[11px] font-bold uppercase tracking-micro text-ink transition-colors duration-fast ease-out-quart hover:bg-ink/5 disabled:opacity-60"
                  >
                    + Conv
                  </button>
                )}
              </div>
            </div>
          </div>
          {onUndo
            && (state.teamScore.points > 0 || state.opponentScore.points > 0)
            && (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={scorePending}
                  className="rounded-sm px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-micro text-warn underline-offset-2 transition-colors duration-fast ease-out-quart hover:bg-warn-soft hover:underline disabled:opacity-60"
                >
                  ↶ Undo last score
                </button>
              </div>
            )}
        </section>
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
