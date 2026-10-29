"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { SCORE_CHIP_OURS, SCORE_CHIP_THEIRS, SCORE_TEAM_NAME } from "@/components/live/scoreChip";
import { announce } from "@/lib/a11y/announce";
import { repeatTapGate } from "@/lib/live/repeatTap";

// ─── ScoreBugFrame ───────────────────────────────────────────
// The one layout every sport's scorebug sits in: AFL's GameHeader (the
// reference), netball's, rugby's, soccer's family's, basketball's and
// touch's. Each bug supplies its totals, chips and clock pill; the rows
// live here, so the UX round 3 fixes (e4, 24 Oct 2026) land in every
// sport at once:
//
//   - Portrait: team names and totals, the clock pill between; under
//     them one row of chips, ours left and theirs right. A team's chips
//     wrap within their own group, and theirs drop beneath ours when
//     both don't fit (basketball's six at 320 px had their +3 off the
//     screen and our +3 12 px from their +1; union's +DG went off the
//     screen at 175% text).
//   - Short screens (a phone held sideways): one row, each team's chips
//     beside its score, out at the edges where the thumbs are, and the
//     team names on one line. The bar took 156 of 390 px; now it's about 80.
//   - Spacing in px, text in rem: large text grows the words, not the
//     gaps, so the bar doesn't fill the screen at 200%.
//
// It also says what changes to a screen reader: the score after a
// score (or an undo, or another phone's), and the end of the period.

export interface ScoreChipSpec {
  key: string;
  /** "+G", "+T", "+3". */
  text: string;
  /** A word stacked under the text (touch's "+2" over "girl"). */
  sub?: string;
  /** What a screen reader calls it: "Add goal, Roos". */
  label: string;
  onTap: () => void;
}

export interface ScoreBugSide {
  name: string;
  /** The big total: a RollingNumber, or "—" before kickoff. */
  total: ReactNode;
  /** Beside the total: AFL's G·B, rugby's T·C. Ours trails it, theirs leads. */
  tally?: ReactNode;
  chips?: ScoreChipSpec[];
  /** The "+6" ghost that rises off the chips. */
  ghost?: ReactNode;
}

interface ScoreBugFrameProps {
  ours: ScoreBugSide;
  theirs: ScoreBugSide;
  /** The clock pill. */
  clock: ReactNode;
  /** Under the pill (AFL's and netball's Q-by-Q). */
  underClock?: ReactNode;
  /** Chips are off while a write is in flight. */
  chipsDisabled?: boolean;
  /** A light haptic on a chip's touch-down. */
  onChipPointerDown?: () => void;
  /** Said when it changes after the first render: "Roos 8, Hawks 3". */
  scoreSaid?: string | null;
  /** Said once when the period's time is up: "Q2 over. Half time." */
  periodOverSaid?: string | null;
  /** Card chrome around the bug (off inside the sticky score bar). */
  card?: boolean;
}

const TOTAL_ROW = "nums mt-1 flex flex-wrap items-baseline gap-x-[8px] font-mono tabular-nums text-ink";

export function ScoreBugFrame({
  ours,
  theirs,
  clock,
  underClock,
  chipsDisabled = false,
  onChipPointerDown,
  scoreSaid = null,
  periodOverSaid = null,
  card = false,
}: ScoreBugFrameProps) {
  // A double tap on one chip is one score (lib/live/repeatTap).
  const gate = useRef(repeatTapGate());
  const said = useRef(scoreSaid);
  useEffect(() => {
    if (scoreSaid && said.current !== scoreSaid) announce(scoreSaid);
    said.current = scoreSaid;
  }, [scoreSaid]);
  useEffect(() => {
    if (periodOverSaid) announce(periodOverSaid, { priority: 2 });
  }, [periodOverSaid]);

  const chipRow = (chips: ScoreChipSpec[] | undefined, side: "ours" | "theirs", ghost: ReactNode) =>
    chips && chips.length > 0 ? (
      <div
        className={`relative flex flex-wrap gap-[6px] ${
          side === "ours" ? "short:col-start-1" : "ml-auto justify-end short:col-start-5 short:ml-0"
        } short:row-start-1`}
      >
        {ghost}
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => {
              if (gate.current(`${side}:${c.key}`, Date.now())) c.onTap();
            }}
            onPointerDown={onChipPointerDown}
            disabled={chipsDisabled}
            className={`${side === "ours" ? SCORE_CHIP_OURS : SCORE_CHIP_THEIRS} min-w-[48px]${c.sub ? " flex-col !px-1 !py-1 leading-none" : ""}`}
            aria-label={c.label}
          >
            {c.text}
            {c.sub && <span className={`mt-0.5 text-[0.625rem] font-semibold uppercase tracking-micro ${side === "ours" ? "text-warm/80" : "text-ink-dim"}`}>{c.sub}</span>}
          </button>
        ))}
      </div>
    ) : null;

  const hasChips = (ours.chips?.length ?? 0) + (theirs.chips?.length ?? 0) > 0;

  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-x-[12px] px-[16px] pb-[24px] pt-[12px] short:grid-cols-[auto_minmax(72px,1fr)_auto_minmax(72px,1fr)_auto] short:items-center short:pb-[8px] short:pt-[8px] ${
        card ? "rounded-md bg-surface shadow-card" : ""
      }`}
    >
      {/* Left: our team, total first, then the tally on its baseline. */}
      <div className="min-w-0 short:col-start-2 short:row-start-1">
        <p data-testid="scorebug-team-name" className={`${SCORE_TEAM_NAME} short:line-clamp-1`}>
          {ours.name}
        </p>
        <p className={TOTAL_ROW}>
          {ours.total}
          {ours.tally}
        </p>
      </div>

      {/* Centre: the clock pill (and, sideways, what sits under it). */}
      <div className="flex flex-col items-center short:col-start-3 short:row-start-1 short:flex-row short:gap-[4px]">
        {clock}
        {underClock && <div className="hidden short:block">{underClock}</div>}
      </div>

      {/* Right: the opponent, mirrored. */}
      <div className="min-w-0 text-right short:col-start-4 short:row-start-1">
        <p data-testid="scorebug-team-name" className={`${SCORE_TEAM_NAME} short:line-clamp-1`}>
          {theirs.name}
        </p>
        <p className={`${TOTAL_ROW} justify-end`}>
          {theirs.tally}
          {theirs.total}
        </p>
      </div>

      {/* The chips: one row a side under the scores, ours left and theirs
          right; sideways they join the row above, out at the edges. */}
      {(hasChips || underClock) && (
        <div className="col-span-3 mt-[8px] flex flex-wrap items-center justify-between gap-x-[12px] gap-y-[8px] short:contents">
          {chipRow(ours.chips, "ours", ours.ghost)}
          {underClock && <div className="mx-auto short:hidden">{underClock}</div>}
          {chipRow(theirs.chips, "theirs", theirs.ghost)}
        </div>
      )}
    </div>
  );
}
