"use client";

// ─── FieldLines ──────────────────────────────────────────────
// Live v3's playing surface (Steve, 8 Nov 2026): the kids on a darker,
// shaded green, line by line. No band boxes and no zone colours: the
// lines are told apart by air and a faint chalk rule between them, with
// a small dim label in the left margin ("FORWARD", "CENTRE", "BACK").
// Each line is a named group, so a screen reader (and a spec) can tell
// which line a kid is on.
//
// Sport-agnostic: a sport passes its lines (label + tiles) and its
// surface: grass (AFL, league, union, soccer…), court (netball) or
// wood (basketball). Its ground's markings go in `marks`, drawn faint
// under the kids (AFL's centre circle and goal arcs: OvalMarks).

import type { ReactNode } from "react";

export interface FieldLine {
  key: string;
  /** The line's name: the margin label and the group's accessible name. */
  label: string;
  /** The kids (KidTile / KidSlot), in order across. */
  tiles: ReactNode[];
  /** Kids per row; defaults to all of them up to 4, then two rows. */
  cols?: number;
}

const SURFACE = {
  field: "bg-field",
  court: "bg-court",
  wood: "bg-wood",
} as const;

export interface FieldLinesProps {
  lines: FieldLine[];
  surface?: keyof typeof SURFACE;
  /** The ground's markings, faint, under the kids. */
  marks?: ReactNode;
  /** Big fields: shorter rows (44 px). */
  dense?: boolean;
  /** Widest a tile gets, px (narrower when the row needs it). */
  tileWidth?: number;
  /**
   * Bumped when the game goes from pre-kickoff to Q1 running: a one-shot
   * siren halo round the field ("the game is on"). Null until then.
   */
  wakeUpKey?: number | null;
}

function colsFor(n: number): number {
  return n <= 4 ? Math.max(1, n) : Math.ceil(n / 2);
}

export function FieldLines({ lines, surface = "field", marks, dense = false, tileWidth = 88, wakeUpKey = null }: FieldLinesProps) {
  const rowH = dense ? 44 : 48;
  return (
    <div className={`relative flex min-h-full flex-1 flex-col rounded-[24px] py-[8px] pl-[4px] pr-[10px] ${SURFACE[surface]}`}>
      {wakeUpKey !== null && (
        <span
          key={wakeUpKey}
          aria-hidden
          className="siren-pulse-once pointer-events-none absolute inset-0 rounded-[24px]"
          style={{ "--siren-pulse-r": "40px" } as React.CSSProperties}
        />
      )}
      {marks && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[24px]">
          {marks}
        </div>
      )}
      {lines.map((line, i) => {
        const cols = line.cols ?? colsFor(line.tiles.length);
        return (
          <div
            key={line.key}
            role="group"
            aria-label={line.label}
            className={`relative grid flex-[1_0_auto] grid-cols-[minmax(14px,auto)_minmax(0,1fr)] items-center gap-[6px] py-[8px] ${
              i > 0 ? "border-t border-mark/10" : ""
            }`}
          >
            {/* Dim, but 4.5:1 on the grass (the design's 42% was 3:1). */}
            <span
              aria-hidden
              className="self-center justify-self-center whitespace-nowrap font-display text-[0.53125rem] font-bold uppercase leading-none tracking-[0.16em] text-mark/[0.62] [transform:rotate(180deg)] [writing-mode:vertical-rl]"
            >
              {line.label}
            </span>
            <div
              className="grid justify-center gap-[8px] bigtext:!grid-cols-2"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, ${tileWidth}px))`,
                gridAutoRows: `minmax(${rowH}px, auto)`,
              }}
            >
              {line.tiles}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** AFL's oval: the centre circle and the two goal-square arcs, faint. */
export function OvalMarks() {
  return (
    <>
      <span className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-mark/[0.07]" />
      <span className="absolute -top-16 left-[22%] right-[22%] h-[110px] rounded-[50%] border-[1.5px] border-mark/[0.07]" />
      <span className="absolute -bottom-16 left-[22%] right-[22%] h-[110px] rounded-[50%] border-[1.5px] border-mark/[0.07]" />
    </>
  );
}
