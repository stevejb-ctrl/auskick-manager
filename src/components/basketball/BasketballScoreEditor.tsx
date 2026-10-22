"use client";

// Basketball's score editor at the break, inside the shared break
// screen's score sheet (the score chip opens it): the per-period
// breakdown (the shared QuarterScoreTable) and the baskets a coach
// missed in play. Basketball's own buttons stay (+1 / +2 / +3), since
// the shared ScoreReviewPanel speaks goals and behinds.

import { QuarterScoreTable } from "@/components/live/QuarterScoreTable";
import { SCORE_CHIP } from "@/components/live/scoreChip";

type Points = 1 | 2 | 3;

interface BasketballScoreEditorProps {
  teamName: string;
  opponentName: string;
  teamPoints: number;
  opponentPoints: number;
  scoreByPeriod: Record<number, { ours: number; theirs: number }>;
  periodCount: number;
  currentPeriod: number;
  periodLetter: string;
  periodWord: string;
  chips: Points[];
  onTeamScore: (points: Points) => void;
  onOpponentScore: (points: Points) => void;
  onUndo: () => void;
  undoDisabled?: boolean;
}

export function BasketballScoreEditor({
  teamName,
  opponentName,
  teamPoints,
  opponentPoints,
  scoreByPeriod,
  periodCount,
  currentPeriod,
  periodLetter,
  periodWord,
  chips,
  onTeamScore,
  onOpponentScore,
  onUndo,
  undoDisabled = false,
}: BasketballScoreEditorProps) {
  return (
    <div className="space-y-4">
      <QuarterScoreTable
        scoreByQuarter={[
          { ours: { goals: 0 }, theirs: { goals: 0 } },
          ...Array.from({ length: periodCount }, (_, i) => ({
            ours: { goals: scoreByPeriod[i + 1]?.ours ?? 0 },
            theirs: { goals: scoreByPeriod[i + 1]?.theirs ?? 0 },
          })),
        ]}
        currentQuarter={currentPeriod}
        quarterEnded
        sport="netball"
        teamName={teamName}
        opponentName={opponentName}
        totalQuarters={periodCount}
        periodLetter={periodLetter}
        periodWord={periodWord === "half" ? "Half" : "Quarter"}
      />
      <div className="space-y-2 border-t border-hairline pt-4">
        <p className="text-xs text-ink-dim">
          A basket you missed counts in {periodLetter}
          {currentPeriod}.
        </p>
        {(
          [
            { side: "ours", name: teamName, onScore: onTeamScore },
            { side: "theirs", name: opponentName, onScore: onOpponentScore },
          ] as const
        ).map(({ side, name, onScore }) => (
          <div key={side} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-sm font-semibold text-ink">{name}</span>
            <span className="flex shrink-0 gap-1.5">
              {chips.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onScore(n)}
                  className={`${SCORE_CHIP} px-2`}
                  aria-label={`Add ${n} ${n === 1 ? "point" : "points"}, ${name}`}
                >
                  +{n}
                </button>
              ))}
            </span>
          </div>
        ))}
        {(teamPoints > 0 || opponentPoints > 0) && (
          <button
            type="button"
            onClick={onUndo}
            disabled={undoDisabled}
            className="min-h-[44px] w-full rounded-md border border-hairline font-mono text-xs font-bold uppercase tracking-micro text-ink-dim transition-colors hover:bg-surface-alt disabled:opacity-60"
          >
            Undo last score
          </button>
        )}
      </div>
    </div>
  );
}
