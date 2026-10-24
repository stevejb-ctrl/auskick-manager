"use client";

// ─── LeagueFullTimeReview ────────────────────────────────────
// Renders between the final period's quarter_end event and the
// game_finalised event. Sibling of AFL's `FullTimeReview` and
// netball's `NetballFullTimeReview` — same visual rhythm:
//
//   1. "Full time" eyebrow + reconcile message
//   2. Two side-by-side score boxes (Us / Them), with the T/C line
//   3. The shared BreakScoreEditor: the score by period, a missed score
//      for either side on buttons that name their team (the scorebug's
//      44 pt chips: +T, +C, and U13+'s goals), and Undo
//   4. "Finalise game" button
//
// AFL's `ScoreReviewPanel` is goal/behind-shaped (calls
// addRetroScore with kinds "goal"/"behind") so RL can't drop it in
// verbatim; BreakScoreEditor is the editor the sports it can't speak
// for share (soccer's family, basketball, touch). The live scorebug's
// chips and undo strip are gone by now (UX audit 23 Oct 2026).

import { useRouter } from "next/navigation";
import { SFButton } from "@/components/sf";
import { hapticSiren } from "@/lib/haptics";
import { finaliseLeagueGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/league-actions";
import {
  leagueScoreLine,
  rugbyPoints,
  rugbyScoreWords,
  rugbyScoreByPeriod,
  type LeagueScoreByPeriod,
} from "@/lib/sports/rugby_league/fairness";
import type { RugbySport } from "@/lib/sports/registry";
import type { AgeGroupConfig } from "@/lib/sports/types";
import type { GameEvent, LiveAuth } from "@/lib/types";
import type { LeagueGameState } from "@/lib/sports/rugby_league/fairness";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useFinishGame } from "@/components/live/useFinishGame";
import { BreakScoreEditor, type BreakScoreChip } from "@/components/quarter-break/BreakScoreEditor";
import { periodLabels } from "@/lib/sports";

interface LeagueFullTimeReviewProps {
  auth: LiveAuth;
  /** The team's rugby sport: its points score each period. */
  sport: RugbySport;
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
  /** U13+ (international laws): penalty and field goals. */
  onTeamPenaltyGoal?: () => void;
  onTeamFieldGoal?: () => void;
  onOpponentPenaltyGoal?: () => void;
  onOpponentFieldGoal?: () => void;
  onUndo?: () => void;
  /** Pending guard — disables chips while a write is in flight. */
  scorePending?: boolean;
}

export function LeagueFullTimeReview({
  auth,
  sport,
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
  onTeamPenaltyGoal,
  onTeamFieldGoal,
  onOpponentPenaltyGoal,
  onOpponentFieldGoal,
  onUndo,
  scorePending = false,
}: LeagueFullTimeReviewProps) {
  const router = useRouter();
  // A failure keeps this screen up, and Finish is safe to tap again.
  const { finish: handleFinalise, pending, error } = useFinishGame(
    (key) => finaliseLeagueGame(auth, gameId, finalisedElapsedMs, key),
    () => {
      void hapticSiren();
      router.refresh();
    },
  );
  const periodLabel = periodLabels(sport, ageGroup).label;
  const periodAbbrev = periodLabel.charAt(0).toUpperCase();
  const words = rugbyScoreWords(sport);
  const scoreByPeriod: LeagueScoreByPeriod = rugbyScoreByPeriod(
    events,
    ageGroup.periodCount,
    rugbyPoints(sport),
  );
  // Each side's buttons, in the sport's words and naming the team.
  const chips = (
    team: string,
    on: { try?: () => void; conversion?: () => void; penaltyGoal?: () => void; fieldGoal?: () => void },
  ): BreakScoreChip[] => {
    const out: BreakScoreChip[] = [];
    const add = (key: string, text: string, what: string, onClick: (() => void) | undefined) => {
      if (onClick) out.push({ key, text, label: `Add ${what}, ${team}`, onClick });
    };
    add("t", "+T", "a try", on.try);
    if (kickingAllowed) add("c", "+C", "a conversion", on.conversion);
    add("pg", `+${words.penaltyGoal.short}`, `a ${words.penaltyGoal.label.toLowerCase()}`, on.penaltyGoal);
    add("fg", `+${words.fieldGoal.short}`, `a ${words.fieldGoal.label.toLowerCase()}`, on.fieldGoal);
    return out;
  };

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
              {leagueScoreLine(state.teamScore, words)}
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
              {leagueScoreLine(state.opponentScore, words)}
            </p>
          </div>
        </div>
      )}

      {trackScoring && (
        <div className="mt-4">
          <BreakScoreEditor
            teamName={teamName}
            opponentName={opponentName}
            teamPoints={state.teamScore.points}
            opponentPoints={state.opponentScore.points}
            scoreByPeriod={Object.fromEntries(
              Object.entries(scoreByPeriod).map(([p, row]) => [p, { ours: row.team.points, theirs: row.opponent.points }]),
            )}
            periodCount={ageGroup.periodCount}
            currentPeriod={ageGroup.periodCount}
            periodLetter={periodAbbrev}
            periodWord={periodLabel}
            teamChips={chips(teamName, {
              try: onTeamTry,
              conversion: onTeamConversion,
              penaltyGoal: onTeamPenaltyGoal,
              fieldGoal: onTeamFieldGoal,
            })}
            opponentChips={chips(opponentName, {
              try: onOpponentTry,
              conversion: onOpponentConversion,
              penaltyGoal: onOpponentPenaltyGoal,
              fieldGoal: onOpponentFieldGoal,
            })}
            missedNote={`Spotted a miscount? A score you missed counts in ${periodAbbrev}${ageGroup.periodCount}.`}
            onUndo={onUndo ?? (() => {})}
            undoDisabled={scorePending || !onUndo}
          />
        </div>
      )}

      {error && (
        <InlineAlert className="mt-3">
          {error}
        </InlineAlert>
      )}

      <div className="mt-4 border-t border-hairline pt-3">
        <SFButton
          full
          size="lg"
          onClick={handleFinalise}
          loading={pending}
          variant="accent"
        >
          Finish game
        </SFButton>
        <p className="mt-2 text-center text-[11px] text-ink-mute">
          Locks the score and shows the summary you can share.
        </p>
      </div>
    </div>
  );
}
