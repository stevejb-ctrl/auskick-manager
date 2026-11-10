"use client";

// ─── RugbyMarks ──────────────────────────────────────────────
// A try-line field under the kids (Steve, 10 Nov 2026: "make it look
// more field like, goal posts at the end, line markings"). Rugby league
// and union, and touch and Oztag (no posts): the in-goal at each end,
// the try lines and halfway; then each code's own lines, measured from
// the try line toward halfway:
//   league  (50 m to halfway) 10 m and 30 m dashed, 20 m and 40 m solid
//   union   (50 m)            5 m dashed, 22 m solid, 10 m from halfway dashed
//   touch / Oztag (35 m)      10 m either side of halfway, dashed
// Decoration only. The in-goals are `RUGBY_IN_GOAL_PX` deep, and the
// field pads its ends by as much (FieldLines' `endsPx`), so no kid
// stands in an in-goal or on the posts.

import type { RugbySport } from "@/lib/sports/registry";
import type { FieldSurface } from "@/components/live/FieldLines";

/** How deep each in-goal is drawn, px: the field's end padding too. */
export const RUGBY_IN_GOAL_PX = 40;

export type TryLineCode = RugbySport | "touch" | "oztag";

interface Code {
  /** Metres from a try line to halfway. */
  half: number;
  /** Lines between a try line and halfway: metres from the try line. */
  lines: { m: number; dashed: boolean }[];
  posts: boolean;
}

const CODES: Record<TryLineCode, Code> = {
  rugby_league: {
    half: 50,
    lines: [
      { m: 10, dashed: true },
      { m: 20, dashed: false },
      { m: 30, dashed: true },
      { m: 40, dashed: false },
    ],
    posts: true,
  },
  rugby_union: {
    half: 50,
    lines: [
      { m: 5, dashed: true },
      { m: 22, dashed: false },
      { m: 40, dashed: true },
    ],
    posts: true,
  },
  touch: { half: 35, lines: [{ m: 25, dashed: true }], posts: false },
  oztag: { half: 35, lines: [{ m: 25, dashed: true }], posts: false },
};

const SOLID = "border-t-2 border-mark/25";
const DASHED = "border-t-2 border-dashed border-mark/20";

/** A line a fraction of the way from a try line to halfway: from the top, or (mirrored) from the bottom. */
function at(fraction: number, from: "top" | "bottom") {
  const pos = `calc(${RUGBY_IN_GOAL_PX}px + (50% - ${RUGBY_IN_GOAL_PX}px) * ${fraction})`;
  return from === "top" ? { top: pos } : { bottom: pos };
}

/** The posts, front on: two uprights and the crossbar, standing on the try line. */
function Posts({ end }: { end: "top" | "bottom" }) {
  return (
    <div
      data-testid="rugby-posts"
      className={`absolute left-1/2 h-[30px] w-[34px] -translate-x-1/2 ${end === "bottom" ? "rotate-180" : ""}`}
      style={end === "top" ? { top: RUGBY_IN_GOAL_PX - 31 } : { bottom: RUGBY_IN_GOAL_PX - 31 }}
    >
      <span className="absolute bottom-0 left-0 top-0 w-[3px] rounded-full bg-mark/60" />
      <span className="absolute bottom-0 right-0 top-0 w-[3px] rounded-full bg-mark/60" />
      <span className="absolute bottom-[9px] left-0 right-0 h-[3px] rounded-full bg-mark/60" />
    </div>
  );
}

/**
 * A try-line field for FieldLines (the live field and the break): the
 * grass, this code's lines, and the in-goals and posts kept clear of the
 * kids, plus a little air.
 */
export function rugbyField(sport: TryLineCode, look: { tileWidth?: number; dense?: boolean } = {}): FieldSurface {
  return { surface: "field", marks: <RugbyMarks sport={sport} />, endsPx: RUGBY_IN_GOAL_PX + 6, ...look };
}

export function RugbyMarks({ sport }: { sport: TryLineCode }) {
  const code = CODES[sport];
  return (
    <div aria-hidden data-testid="rugby-markings" className="pointer-events-none absolute inset-0">
      {/* The in-goals, a shade lighter, to the try lines. */}
      <div data-testid="rugby-try-line" className="absolute inset-x-0 top-0 border-b-2 border-mark/25 bg-mark/[0.05]" style={{ height: RUGBY_IN_GOAL_PX }} />
      <div data-testid="rugby-try-line" className="absolute inset-x-0 bottom-0 border-t-2 border-mark/25 bg-mark/[0.05]" style={{ height: RUGBY_IN_GOAL_PX }} />
      {/* Halfway. */}
      <div className={`absolute inset-x-0 top-1/2 ${SOLID}`} />
      {code.lines.flatMap(({ m, dashed }) =>
        (["top", "bottom"] as const).map((from) => (
          <div key={`${from}-${m}`} className={`absolute inset-x-0 ${dashed ? DASHED : SOLID}`} style={at(m / code.half, from)} />
        )),
      )}
      {code.posts && <Posts end="top" />}
      {code.posts && <Posts end="bottom" />}
    </div>
  );
}
