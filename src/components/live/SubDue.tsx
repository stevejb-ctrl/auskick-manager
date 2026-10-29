"use client";

// ─── Sub due: one voice, in every sport ──────────────────────
// When a sub falls due, the sub card itself is the alert: an amber ring,
// the "Sub due — N swaps" eyebrow, "Rotate a player off" (or the sport's
// own words), and role="alert". The top-bar SubDueBanner speaks only when
// a sub is due with nothing to suggest (design session 17 Oct 2026, "one
// event, one voice").
//
// AFL's SwapCard and the other sports' NextSubCard (its fork, extracted
// for league and soccer before the re-skin) both take their due chrome
// from here, so the two cards can't drift into announcing it twice again
// (Steve 2026-10-23, UI polish round 2 R2: basketball, league, union,
// soccer, futsal, hockey and touch showed the banner AND the card).

import type { ReactNode } from "react";

/** The top-bar banner speaks only for a due sub with no card to show it, and someone to bring on (lib/live/subDueBanner). */
export { subDueBannerShows } from "@/lib/live/subDueBanner";

/** The card's ring: amber while due, a lift shadow otherwise. */
export const SUB_DUE_RING = "shadow-[0_0_0_2px_#A8590F,0_8px_24px_rgba(26,30,26,0.18)]";
export const SUB_IDLE_SHADOW = "shadow-[0_4px_12px_rgba(26,30,26,0.12)]";

/** The card root: the screen-reader alert while due, a plain box otherwise. */
export function SubDueRoot({ due, className, children }: { due: boolean; className: string; children: ReactNode }) {
  return due ? (
    <section role="alert" aria-label="Sub due" className={className}>
      {children}
    </section>
  ) : (
    <div className={className}>{children}</div>
  );
}

/**
 * The card's eyebrow and sub-line: "SUB DUE — N SWAPS" with a dot and
 * the call to act while due; "SUGGESTED — N SWAPS" and who's swapping
 * otherwise.
 */
export function SubDueHeading({
  due,
  count,
  hint = "Rotate a player off",
  summary,
}: {
  due: boolean;
  count: number;
  /** What to do when it's due, in the sport's words. */
  hint?: string;
  /** Who swaps, shown before it's due. */
  summary: ReactNode;
}) {
  const countLabel = `${count} ${count === 1 ? "swap" : "swaps"}`;
  return (
    <span className="min-w-0 flex-1">
      {due ? (
        <span className="flex items-center gap-1.5 font-mono text-nano font-bold uppercase leading-4 tracking-micro text-due-dark">
          <span
            aria-hidden
            className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-due-dark shadow-[0_0_0_3px_rgba(242,166,90,0.25)]"
          />
          Sub due — {countLabel}
        </span>
      ) : (
        <span className="block font-mono text-nano font-bold uppercase leading-4 tracking-micro text-warm/[0.64]">
          Suggested — {countLabel}
        </span>
      )}
      {due ? (
        <span className="block text-sm font-medium leading-5 text-warm/[0.92]">{hint}</span>
      ) : (
        <span className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-sm font-medium leading-5 text-warm/[0.92]">
          {summary}
        </span>
      )}
    </span>
  );
}
