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

export { staggerRows } from "@/components/live/staggerRows";

export interface FieldLine {
  key: string;
  /** The line's name: the margin label and the group's accessible name. */
  label: string;
  /** The kids (KidTile / KidSlot), in order across. */
  tiles: ReactNode[];
  /** Kids per row; defaults to all of them up to 4, then two rows. */
  cols?: number;
  /**
   * Big fields: the formation's rows (formationRows), each centred on
   * its own, in place of `tiles`' grid. Union's front row, 2nd row and
   * back row are three rows of one "Forwards" line.
   */
  rows?: ReactNode[][];
  /**
   * Where `rows` sit in the line: centred (default), at its top or
   * bottom (netball's GS and GK by their shooting circles), or spread
   * down the whole line (Oztag's one line of eight, staggerRows).
   */
  rowsAlign?: "center" | "start" | "end" | "spread";
  /**
   * Each row's place across the field: left, centre (default) or right,
   * a lane in from the edge. Netball's bibs zigzag down the court (GS
   * centre, GA right, WA left, C centre…), as the court always has.
   */
  rowSide?: ("left" | "center" | "right")[];
  /**
   * How many are on after the margin label ("FORWARDS 4/4"), underlined
   * when the line is short. Seen only, as the old count chip was.
   */
  count?: { text: string; short: boolean };
}

// Each surface also names its ground for the tiles on it (KidTile's
// solid plate: --tile-ground).
const SURFACE = {
  field: "bg-field [--tile-ground:var(--c-field)]",
  court: "bg-court [--tile-ground:var(--c-court)]",
  wood: "bg-wood [--tile-ground:var(--c-wood)]",
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
  /**
   * Room kept clear at each end, px, for what's drawn there (rugby's
   * in-goals and posts: RugbyMarks). The usual 8 when unset.
   */
  endsPx?: number;
}

const ROW_SIDE = {
  left: "justify-start pl-[12px]",
  center: "justify-center",
  right: "justify-end pr-[12px]",
} as const;

const ROWS_ALIGN = {
  center: "",
  start: "self-start",
  end: "self-end",
  spread: "self-stretch justify-evenly",
} as const;

function colsFor(n: number): number {
  return n <= 4 ? Math.max(1, n) : Math.ceil(n / 2);
}

export function FieldLines({ lines, surface = "field", marks, dense = false, tileWidth = 88, wakeUpKey = null, endsPx }: FieldLinesProps) {
  const rowH = dense ? 44 : 48;
  return (
    <div
      className={`relative flex min-h-full flex-1 flex-col rounded-[24px] px-[4px] py-[8px] ${SURFACE[surface]}`}
      style={endsPx !== undefined ? { paddingTop: endsPx, paddingBottom: endsPx } : undefined}
    >
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
            // The label's column on the left, an empty one as wide on the
            // right, so the kids sit centred with even room to each
            // sideline (Steve, 10 Nov 2026: the right-hand tiles hugged it).
            className={`relative grid flex-[1_0_auto] grid-cols-[14px_minmax(0,1fr)_14px] items-center gap-[6px] ${dense ? "py-[6px]" : "py-[8px]"} ${
              i > 0 ? "border-t border-mark/10" : ""
            }`}
          >
            {/* Dim, but 4.5:1 on the grass (the design's 42% was 3:1). On
                a patch of the ground, so a sideline drawn there (soccer,
                hockey, futsal) passes behind it, not through it. */}
            <span
              aria-hidden
              className="self-center justify-self-center whitespace-nowrap rounded-[3px] bg-[rgb(var(--tile-ground,var(--c-field)))] px-[2px] py-[4px] font-display text-[0.53125rem] font-bold uppercase leading-none tracking-[0.16em] text-mark/[0.62] [transform:rotate(180deg)] [writing-mode:vertical-rl]"
            >
              {line.label}
              {line.count && (
                <>
                  {"  "}
                  <span className={line.count.short ? "underline decoration-[1.5px] underline-offset-[3px]" : ""}>{line.count.text}</span>
                </>
              )}
            </span>
            {line.rows ? (
              <div className={`flex flex-col gap-[6px] ${ROWS_ALIGN[line.rowsAlign ?? "center"]}`}>
                {line.rows.map((row, r) => (
                  <div
                    key={r}
                    className={`grid gap-[8px] bigtext:!grid-cols-2 ${ROW_SIDE[line.rowSide?.[r] ?? "center"]}`}
                    style={{
                      gridTemplateColumns: `repeat(${row.length}, minmax(0, ${tileWidth}px))`,
                      gridAutoRows: `minmax(${rowH}px, auto)`,
                    }}
                  >
                    {row}
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="grid justify-center gap-[8px] bigtext:!grid-cols-2"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(0, ${tileWidth}px))`,
                  gridAutoRows: `minmax(${rowH}px, auto)`,
                }}
              >
                {line.tiles}
              </div>
            )}
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
