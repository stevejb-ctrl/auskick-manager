"use client";

// ─── The netball court ───────────────────────────────────────
// Netball's ground for FieldLines, shared by the live court
// (NetballLiveGame) and the quarter break (NetballQuarterBreak), so the
// break draws the court exactly as the game does: the court's blue, the
// centre circle and the two shooting circles, and each third's bibs a
// row each, zigzagging down the court.

import type { ReactNode } from "react";
import type { FieldLine, FieldSurface } from "@/components/live/FieldLines";

/** Where each bib stands across the court: the zigzag down it. */
export const NETBALL_SIDE: Record<string, "left" | "center" | "right"> = {
  gs: "center",
  ga: "right",
  wa: "left",
  c: "center",
  wd: "right",
  gd: "left",
  gk: "center",
};

/**
 * The court's surface and markings, and its tile width: in rem, so the
 * bibs grow with the phone's text size (at 150–200% a 104 px bib cut
 * "Charlotte" to "Ch…", Steve, 10 Nov 2026). 9rem is 144 px at 100%.
 */
export function netballCourt(): FieldSurface {
  return { surface: "court", marks: <CourtMarks />, tileWidth: "9rem" };
}

/**
 * A third's bibs staggered down the court, a bib a row, zigzagging
 * across it as the old court did (Steve, 10 Nov 2026): GS centre in the
 * shooting circle, GA right; WA left, C centre, WD right; GD left, GK
 * centre in the circle at the bottom. `bibs` are the positions, in the
 * tiles' order.
 */
export function netballCourtLine(bibs: readonly string[], tiles: readonly ReactNode[]): Pick<FieldLine, "rows" | "rowsAlign" | "rowSide"> {
  return {
    rows: tiles.map((t) => [t]),
    rowsAlign: "spread",
    rowSide: bibs.map((posId) => NETBALL_SIDE[posId] ?? "center"),
  };
}

/**
 * The court's markings under the kids: the centre circle, faint, and
 * the two shooting circles, plain to see (Steve, 10 Nov 2026), with GS
 * and GK standing in them. A real circle is 4.9 m on a 15.25 m wide
 * court: about two-thirds of the width across. In rem, as the bibs, so
 * GS and GK stay in them at large text.
 */
export function CourtMarks() {
  return (
    <>
      <span className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-mark/[0.07]" />
      <span
        data-testid="shooting-circle"
        className="absolute -top-[6.5rem] left-[17%] right-[17%] h-[13rem] rounded-[50%] border-2 border-mark/30 bg-mark/[0.04]"
      />
      <span
        data-testid="shooting-circle"
        className="absolute -bottom-[6.5rem] left-[17%] right-[17%] h-[13rem] rounded-[50%] border-2 border-mark/30 bg-mark/[0.04]"
      />
    </>
  );
}
