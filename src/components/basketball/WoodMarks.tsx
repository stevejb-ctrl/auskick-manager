"use client";

// ─── The basketball court ────────────────────────────────────
// Basketball's ground for FieldLines, shared by the live court
// (BasketballLiveGame) and the half-time break (BasketballBreak), so the
// break draws the wood exactly as the game does.

import type { FieldSurface } from "@/components/live/FieldLines";

/** The wood and its paint, with the wider tile (a name beside its fouls). */
export function woodCourt(): FieldSurface {
  return { surface: "wood", marks: <WoodMarks />, tileWidth: 112 };
}

/**
 * The court's paint, faint chalk on the wood under the kids: the key and
 * the free-throw circle at the top (the basket the forwards attack), the
 * halfway line's centre circle at the foot. Decoration only.
 */
export function WoodMarks() {
  return (
    <>
      <span data-testid="wood-markings" className="absolute left-1/2 top-0 h-[30%] w-[36%] -translate-x-1/2 border-[1.5px] border-t-0 border-mark/[0.08]" />
      <span className="absolute left-1/2 top-[calc(30%-28px)] h-14 w-14 -translate-x-1/2 rounded-full border-[1.5px] border-mark/[0.08]" />
      <span className="absolute left-1/2 top-0 h-[58%] w-[84%] -translate-x-1/2 rounded-b-full border-[1.5px] border-t-0 border-mark/[0.06]" />
      <span className="absolute -bottom-8 left-1/2 h-16 w-16 -translate-x-1/2 rounded-full border-[1.5px] border-mark/[0.08]" />
    </>
  );
}
