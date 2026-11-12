// ─── The break re-plans when who can play changes ────────────
// A kid back at the break (from loan, a late arrival, over an injury),
// or one who can't play now: the break applies its strategy's lineup
// again, so Suggested includes them (round 3 edge cases, 24 Oct 2026:
// league and basketball left a kid back from loan on the bench, in
// league the one kid who had to play the half). Not once the coach has
// placed kids by hand, or a pinned or staged plan opened the break. The
// same in every sport's break.
//
// `replanned` counts the re-plans, for the break to say so (PeriodBreak's
// "Lineup re-planned: 3 kids moved.", Stagehand round 11, #2: the lineup
// changed under the coach without a word).
//
// `undo` puts back the lineup the break had before it re-planned (Steve,
// 12 Nov 2026): the coach's own, from before the first of a run of
// re-plans with no change of theirs between. It goes through the sport's
// `fit`, which benches any kid who can't play now (their spot left empty,
// as at Start) and adds any kid who can and wasn't in it to the bench.
// Undone, the lineup counts as the coach's: the break won't re-plan over
// it. Offered until the coach next changes the lineup themselves.

import { useEffect, useRef, useState } from "react";

export interface BreakReplanLineup<L> {
  /** The lineup on screen this render. */
  draft: L;
  setDraft: (next: L) => void;
  /** The strategy's lineup, applied afresh. */
  plan: () => L;
  /** A lineup from before, made fit for who can play now. */
  fit: (before: L) => L;
}

export function useBreakReplan<L>(healthy: readonly string[], lineup: BreakReplanLineup<L>) {
  const handPlaced = useRef(false);
  const key = healthy.join(",");
  const last = useRef(key);
  const [replanned, setReplanned] = useState(0);
  // The lineup before the first re-plan of this run; null when there's
  // nothing to undo.
  const [before, setBefore] = useState<{ lineup: L } | null>(null);
  const draftNow = useRef(lineup.draft);
  draftNow.current = lineup.draft;
  useEffect(() => {
    if (last.current === key) return;
    last.current = key;
    if (!handPlaced.current) {
      const was = draftNow.current;
      setBefore((b) => b ?? { lineup: was });
      lineup.setDraft(lineup.plan());
      setReplanned((n) => n + 1);
    }
    // The replan of the render where who can play changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return {
    /** How many times the break has re-planned on its own (pass to PeriodBreak). */
    replanned,
    /** Put back the lineup from before the re-plan; absent when there's none. */
    undo: before
      ? () => {
          handPlaced.current = true;
          setBefore(null);
          lineup.setDraft(lineup.fit(before.lineup));
        }
      : undefined,
    /** The coach moved kids, or a pinned or staged plan was laid out. */
    placedByHand: () => {
      handPlaced.current = true;
      setBefore(null);
    },
    /** A strategy's lineup was applied afresh. */
    strategyApplied: () => {
      handPlaced.current = false;
      setBefore(null);
    },
  };
}

/**
 * A `fit`'s second half: kids who can play now and aren't anywhere in
 * the lineup join its bench (after the sport has benched who can't).
 */
export function withHealthyOnBench<L extends { bench: string[] }>(
  lineup: L,
  healthy: readonly string[],
  placed: (lineup: L, id: string) => boolean,
): L {
  const missing = healthy.filter((id) => !lineup.bench.includes(id) && !placed(lineup, id));
  return missing.length > 0 ? { ...lineup, bench: [...lineup.bench, ...missing] } : lineup;
}
