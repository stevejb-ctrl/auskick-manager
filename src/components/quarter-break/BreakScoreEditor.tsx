"use client";

// The break's score editor, inside the shared break screen's score sheet
// (PeriodBreak's score chip opens it) for sports whose scores the shared
// ScoreReviewPanel can't speak (it speaks goals and behinds): the
// per-period breakdown (the shared QuarterScoreTable) and the scores a
// coach missed in play, each side's buttons the sport's own
// (basketball's +1 / +2 / +3, touch's +T, Oztag's +1 and +2 (girl)).

import { QuarterScoreTable } from "@/components/live/QuarterScoreTable";
import { SCORE_CHIP } from "@/components/live/scoreChip";

export interface BreakScoreChip {
  key: string;
  text: string;
  /** Spoken label ("Add a try, Sharks"). */
  label: string;
  onClick: () => void;
}

interface BreakScoreEditorProps {
  teamName: string;
  opponentName: string;
  teamPoints: number;
  opponentPoints: number;
  scoreByPeriod: Record<number, { ours: number; theirs: number }>;
  periodCount: number;
  currentPeriod: number;
  periodLetter: string;
  periodWord: string;
  teamChips: BreakScoreChip[];
  opponentChips: BreakScoreChip[];
  /** "A try you missed counts in H1." */
  missedNote: string;
  onUndo: () => void;
  undoDisabled?: boolean;
}

export function BreakScoreEditor({
  teamName,
  opponentName,
  teamPoints,
  opponentPoints,
  scoreByPeriod,
  periodCount,
  currentPeriod,
  periodLetter,
  periodWord,
  teamChips,
  opponentChips,
  missedNote,
  onUndo,
  undoDisabled = false,
}: BreakScoreEditorProps) {
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
        periodWord={periodWord === "half" ? "Half" : periodWord === "period" ? "Period" : "Quarter"}
      />
      <div className="space-y-2 border-t border-hairline pt-4">
        <p className="text-xs text-ink-dim">{missedNote}</p>
        {(
          [
            { side: "ours", name: teamName, chips: teamChips },
            { side: "theirs", name: opponentName, chips: opponentChips },
          ] as const
        ).map(({ side, name, chips }) => (
          <div key={side} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-sm font-semibold text-ink">{name}</span>
            <span className="flex shrink-0 gap-1.5">
              {chips.map((c) => (
                <button key={c.key} type="button" onClick={c.onClick} className={`${SCORE_CHIP} px-2`} aria-label={c.label}>
                  {c.text}
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
