"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { SCORE_CHIP_OURS, SCORE_CHIP_THEIRS, SCORE_TEAM_NAME } from "@/components/live/scoreChip";
import { announce } from "@/lib/a11y/announce";
import { repeatTapGate } from "@/lib/live/repeatTap";
import { useScoringFor } from "@/components/live/ScoringFor";
import { BAR_OUTLINED, BAR_PRIMARY, BAR_SMALL, BAR_TEXT, barButton } from "@/components/live/barButtons";

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
//
// Live v3 (AFL's shell, Phase 5) splits the bug in two with `part`:
//
//   - "header": the names and big totals in ink on the chalk, the clock
//     between. Tapping either side opens Scores and fixes. With scoring
//     off it says "No score kept". It's the one that speaks: the score
//     and the end of the period go to a screen reader from here only.
//   - "bar": the chips as the action bar's buttons. Our first chip is
//     the one filled primary (+ GOAL, "who scored?" under it), our others
//     outlined, theirs plain text buttons at least 44 px tall. Same
//     labels ("Add goal, Roos"), so a screen reader hears no change.
//
// Without `part` it's the one-piece bug every other sport still uses.

export interface ScoreChipSpec {
  key: string;
  /** "+G", "+T", "+3". */
  text: string;
  /** The bar's word for it, "Goal" (live v3's part="bar"): "+ GOAL". */
  word?: string;
  /** The bar's line under it: "who scored?", "Roos +1". */
  hint?: string;
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
  /** Live v3: the header (names, totals, clock) or the bar (the chips). */
  part?: "header" | "bar";
  /** The header: tap a side for Scores and fixes. */
  onScores?: () => void;
  /** The header: scoring is off, so no totals; "No score kept". */
  scoringOff?: boolean;
}

const TOTAL_ROW = "nums mt-1 flex flex-wrap items-baseline gap-x-[8px] font-mono tabular-nums text-ink";

/**
 * A team's name over its score buttons: on two lines if it needs them,
 * cut only past that ("SANDRINGHAM / SHARKS", not "SANDRINGHA…": Steve,
 * 10 Nov 2026, the screenshot round).
 */
const BAR_NAME =
  "line-clamp-2 font-display text-[0.625rem] font-extrabold uppercase leading-[1.15] text-ink-mute [overflow-wrap:break-word]";

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
  part,
  onScores,
  scoringOff = false,
}: ScoreBugFrameProps) {
  // A double tap on one chip is one score (lib/live/repeatTap).
  const gate = useRef(repeatTapGate());
  // On a game-day link, our name says it is the parent's team.
  const scoringFor = useScoringFor();
  // The bar half never speaks: the header says the score, once.
  const speaks = part !== "bar";
  const said = useRef(scoreSaid);
  useEffect(() => {
    if (!speaks) return;
    if (scoreSaid && said.current !== scoreSaid) announce(scoreSaid);
    said.current = scoreSaid;
  }, [scoreSaid, speaks]);
  useEffect(() => {
    if (speaks && periodOverSaid) announce(periodOverSaid, { priority: 2 });
  }, [periodOverSaid, speaks]);

  if (part === "header") {
    return (
      <HeaderPart
        ours={ours}
        theirs={theirs}
        clock={clock}
        onScores={onScores}
        scoringOff={scoringOff}
        scoreSaid={scoreSaid}
        yours={scoringFor}
      />
    );
  }
  if (part === "bar") {
    const tap = (side: "ours" | "theirs", c: ScoreChipSpec) => () => {
      if (gate.current(`${side}:${c.key}`, Date.now())) c.onTap();
    };
    const ourChips = ours.chips ?? [];
    const theirChips = theirs.chips ?? [];
    // More than two kinds a side (rugby's +T +C +PG +DG): v3's "sides2",
    // a row a team, each led by its name. Ours: the first filled, the
    // rest outlined; theirs: the same as text buttons.
    if (ourChips.length > 2 || theirChips.length > 2) {
      const row = (s: ScoreBugSide, chips: ScoreChipSpec[], side: "ours" | "theirs") =>
        chips.length > 0 ? (
          <div className="relative grid grid-cols-[70px_minmax(0,1fr)] items-center gap-[6px] bigtext:grid-cols-1 bigtext:gap-[2px]">
            <span className={`${BAR_NAME} tracking-[0.06em]`}>{s.name}</span>
            <div className="grid gap-[6px]" style={{ gridTemplateColumns: `repeat(${chips.length}, minmax(0, 1fr))` }}>
              {chips.map((c, i) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={tap(side, c)}
                  onPointerDown={onChipPointerDown}
                  disabled={chipsDisabled}
                  aria-label={c.label}
                  className={
                    side === "theirs" ? BAR_TEXT : `${barButton(i === 0 ? "primary" : "outlined", "sm")} !min-h-[44px] !rounded-[12px]`
                  }
                >
                  <span className="whitespace-nowrap">{c.text}</span>
                  {side === "ours" && i === 0 && s.ghost}
                </button>
              ))}
            </div>
            {side === "theirs" && s.ghost}
          </div>
        ) : null;
      // Sideways (a short screen), the two rows sit side by side.
      return (
        <div className="flex flex-col gap-[6px] short:grid short:grid-cols-2 short:gap-x-[12px]">
          {row(ours, ourChips, "ours")}
          {row(theirs, theirChips, "theirs")}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(88px,100px)] items-stretch gap-[8px] bigtext:grid-cols-2">
        {ourChips.map((c, i) => (
          <button
            key={c.key}
            type="button"
            onClick={tap("ours", c)}
            onPointerDown={onChipPointerDown}
            disabled={chipsDisabled}
            aria-label={c.label}
            className={`${i === 0 ? BAR_PRIMARY : BAR_OUTLINED} ${ourChips.length === 1 ? "col-span-2" : ""}`}
          >
            <span className="whitespace-nowrap">+ {c.word ?? c.text.replace(/^\+/, "")}</span>
            {c.hint && (
              <span className={BAR_SMALL}>
                {c.hint}
              </span>
            )}
            {i === 0 && ours.ghost}
          </button>
        ))}
        {theirChips.length > 0 && (
          // Large text: their name and buttons on one row, under ours.
          <div className="relative grid min-w-0 grid-cols-2 grid-rows-[auto_1fr] text-center bigtext:col-span-2 bigtext:grid-cols-[minmax(0,1fr)_auto_auto] bigtext:grid-rows-1 bigtext:items-center bigtext:gap-x-[8px] bigtext:text-left">
            <span className={`${BAR_NAME} col-span-2 tracking-[0.08em] bigtext:col-span-1`}>
              {theirs.name}
            </span>
            {theirChips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={tap("theirs", c)}
                onPointerDown={onChipPointerDown}
                disabled={chipsDisabled}
                aria-label={c.label}
                className={BAR_TEXT}
              >
                {c.sub ? (
                  // Touch's "+2" over "girl", one button wide.
                  <span className="flex flex-col items-center leading-none">
                    {c.text}
                    <span className="mt-[2px] text-[0.625rem] font-bold uppercase tracking-[0.06em]">{c.sub}</span>
                  </span>
                ) : (
                  c.text
                )}
              </button>
            ))}
            {theirs.ghost}
          </div>
        )}
      </div>
    );
  }

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
      className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-x-[12px] px-[16px] pb-[24px] pt-[12px] bigtext:gap-x-[6px] bigtext:px-[8px] bigtext:pb-[12px] short:grid-cols-[auto_minmax(72px,1fr)_auto_minmax(72px,1fr)_auto] short:items-center short:pb-[8px] short:pt-[8px] ${
        card ? "rounded-md bg-surface shadow-card" : ""
      }`}
    >
      {/* Left: our team, total first, then the tally on its baseline. */}
      <div className="min-w-0 short:col-start-2 short:row-start-1">
        <p data-testid="scorebug-team-name" className={`${SCORE_TEAM_NAME} short:line-clamp-1`}>
          {ours.name}
          {scoringFor && (
            <span data-testid="scorebug-yours" className="font-normal text-ink-mute">
              {" "}
              (you)
            </span>
          )}
        </p>
        <p className={TOTAL_ROW}>
          {ours.total}
          {/* Large text: the total is the score; the breakdown goes. */}
          {ours.tally && <span className="bigtext:hidden">{ours.tally}</span>}
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
          {theirs.tally && <span className="bigtext:hidden">{theirs.tally}</span>}
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

// ─── Live v3's two halves ─────────────────────────────────────

const HEADER_TOTAL = "nums font-display stretch-62 text-[40px] font-extrabold leading-none text-ink tabular-nums";
const HEADER_NAME =
  // Three lines before it clips: a long club name in the narrow column
  // beside a two-digit total ("Northcote Kangaroos 868" at 375 px).
  // Archivo's narrowest width (the score's), so a long word ("SANDRINGHAM")
  // fits beside the break's name at 390 px rather than breaking inside
  // itself (Stagehand, 9 Nov 2026).
  "line-clamp-3 break-words font-display stretch-62 text-[0.75rem] font-bold uppercase leading-tight tracking-[0.02em] text-ink-mute bigtext:line-clamp-2";
const HEADER_SMALL = "text-[0.75rem] font-semibold text-ink-mute";

function HeaderPart({
  ours,
  theirs,
  clock,
  onScores,
  scoringOff,
  scoreSaid,
  yours,
}: {
  ours: ScoreBugSide;
  theirs: ScoreBugSide;
  clock: ReactNode;
  onScores?: () => void;
  scoringOff: boolean;
  scoreSaid: string | null;
  yours: boolean;
}) {
  // One side of the header. The name's paragraph and the total's stay
  // siblings (specs and the two-phone checks read the total as the
  // name's next <p>); the total's <p> is `contents`, so its pieces sit
  // in the side's grid: the name over the tally, the big total beside.
  const side = (s: ScoreBugSide, right: boolean) => {
    const cls = `relative grid min-w-0 items-center gap-x-[6px] rounded-[14px] px-[4px] py-[4px] ${
      right ? "grid-cols-[auto_minmax(0,1fr)] text-right" : "grid-cols-[minmax(0,1fr)_auto] text-left"
    }`;
    // Scoring off: our side stays out of the way (the clock, then the
    // words on the right), and there's nothing to tap.
    if (scoringOff) {
      return right ? (
        <div className="min-w-0 px-[4px] text-right">
          <p data-testid="scorebug-team-name" className={HEADER_NAME}>
            {s.name}
          </p>
          <p data-testid="scores-not-kept" className="text-[0.75rem] text-ink-mute">
            No score kept
          </p>
        </div>
      ) : (
        <div aria-hidden className="invisible" />
      );
    }
    const body = (
      <>
        <p data-testid="scorebug-team-name" className={`${right ? "col-start-2" : "col-start-1"} row-start-1 self-end ${HEADER_NAME}`}>
          {s.name}
          {!right && yours && (
            <span data-testid="scorebug-yours" className="font-normal normal-case tracking-normal">
              {" "}
              (you)
            </span>
          )}
        </p>
        <p className="contents">
          {right && s.tally && <span className={`col-start-2 row-start-2 self-start ${HEADER_SMALL} bigtext:hidden`}>{s.tally}</span>}
          <span className={`${right ? "col-start-1" : "col-start-2"} row-span-2 row-start-1 self-center ${HEADER_TOTAL}`}>{s.total}</span>
          {!right && s.tally && <span className={`col-start-1 row-start-2 self-start ${HEADER_SMALL} bigtext:hidden`}>{s.tally}</span>}
        </p>
        {s.ghost}
      </>
    );
    return onScores ? (
      <button
        type="button"
        onClick={onScores}
        aria-label={`Scores and fixes. ${scoreSaid ?? ""}`.trim()}
        className={`${cls} transition-colors duration-fast ease-out-quart hover:bg-surface-alt active:bg-surface-alt`}
      >
        {body}
      </button>
    ) : (
      <div className={cls}>{body}</div>
    );
  };
  return (
    <div className="grid min-h-[58px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-[4px] px-[12px] short:min-h-0">
      {side(ours, false)}
      <div className="flex flex-col items-center">{clock}</div>
      {side(theirs, true)}
    </div>
  );
}
