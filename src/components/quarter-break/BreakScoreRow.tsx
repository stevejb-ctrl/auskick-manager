"use client";

// The break's Score row, as AFL's and netball's quarter breaks have it:
// [SCORE] [us – them · margin] [chevron], opening to the per-period
// breakdown (the shared QuarterScoreTable) and the scores a coach missed
// in play. Each side's buttons are the sport's own (touch's +T, Oztag's
// +1 and +2 (girl)), since the shared ScoreReviewPanel speaks goals and
// behinds.
//
// Lifted from basketball's BreakScoreRow with the chips as props; touch
// and Oztag are its first users, and basketball's can move onto it.

import { QuarterScoreTable } from "@/components/live/QuarterScoreTable";
import { SCORE_CHIP } from "@/components/live/scoreChip";

export interface BreakScoreChip {
  key: string;
  text: string;
  /** Spoken label ("Add a try, Sharks"). */
  label: string;
  onClick: () => void;
}

interface BreakScoreRowProps {
  open: boolean;
  onToggle: () => void;
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

export function BreakScoreRow({
  open,
  onToggle,
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
}: BreakScoreRowProps) {
  const lead = teamPoints - opponentPoints;
  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-alt"
        aria-expanded={open}
        aria-label={open ? "Hide score review" : "Review and update scores"}
      >
        <span className="flex flex-1 items-center gap-3 text-sm">
          <span className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-dim">Score</span>
          <span className="nums truncate font-mono text-xs tabular-nums text-ink-dim">
            {teamPoints}
            <span className="mx-1">–</span>
            {opponentPoints}
            {lead !== 0 && (
              <>
                <span className="mx-1">·</span>
                <span className={`font-semibold ${lead > 0 ? "text-brand-700" : "text-danger"}`}>
                  {lead > 0 ? `+${lead}` : `−${-lead}`}
                </span>
              </>
            )}
          </span>
        </span>
        <span aria-hidden className="text-ink-dim">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            className={`transition-transform duration-fast ease-out-quart ${open ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-hairline px-4 py-4">
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
      )}
    </div>
  );
}
