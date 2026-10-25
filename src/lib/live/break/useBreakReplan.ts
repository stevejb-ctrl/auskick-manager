// ─── The break re-plans when who can play changes ────────────
// A kid back at the break (from loan, a late arrival, over an injury),
// or one who can't play now: the break applies its strategy's lineup
// again, so Suggested includes them (round 3 edge cases, 24 Oct 2026:
// league and basketball left a kid back from loan on the bench, in
// league the one kid who had to play the half). Not once the coach has
// placed kids by hand, or a pinned or staged plan opened the break. The
// same in every sport's break.

import { useEffect, useRef } from "react";

export function useBreakReplan(healthy: readonly string[], replan: () => void) {
  const handPlaced = useRef(false);
  const key = healthy.join(",");
  const last = useRef(key);
  useEffect(() => {
    if (last.current === key) return;
    last.current = key;
    if (!handPlaced.current) replan();
    // The replan of the render where who can play changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return {
    /** The coach moved kids, or a pinned or staged plan was laid out. */
    placedByHand: () => {
      handPlaced.current = true;
    },
    /** A strategy's lineup was applied afresh. */
    strategyApplied: () => {
      handPlaced.current = false;
    },
  };
}
