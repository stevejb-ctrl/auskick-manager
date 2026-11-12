// ─── An undone swap leaves no "just subbed" mark ──────────────────
// Each sport's replay stamps when a kid last came on and went off
// (`lastSubbedOnMs` / `lastSubbedOffMs`), so the suggester gives a kid
// just benched a rest and leaves a kid just on alone. A swap put back by
// Undo (`undo: true`, the exact reverse of the swap before it) must not
// count as a sub: the kid back on the bench hasn't been rested, and the
// kid back on hasn't just come on. Without this, undoing one pair of a
// planned sub dropped that pair from the plan (Stagehand round 10,
// 10 Nov 2026).
//
// Usage in a replay's swap branch:
//   const settle = recency.swap(state, off, on, undo);
//   …move the kids, stamp lastSubbedOnMs / lastSubbedOffMs…
//   settle();

export interface SubbedStamps {
  lastSubbedOnMs: Record<string, number>;
  lastSubbedOffMs: Record<string, number>;
}

interface Stamp {
  on?: number;
  off?: number;
}

const read = (s: SubbedStamps, id: string): Stamp => ({ on: s.lastSubbedOnMs[id], off: s.lastSubbedOffMs[id] });

function write(s: SubbedStamps, id: string, v: Stamp) {
  if (v.on === undefined) delete s.lastSubbedOnMs[id];
  else s.lastSubbedOnMs[id] = v.on;
  if (v.off === undefined) delete s.lastSubbedOffMs[id];
  else s.lastSubbedOffMs[id] = v.off;
}

/** One per replay: remembers the last swap so an undo of it can put its stamps back. */
export function createSwapRecency() {
  let last: { off: string; on: string; was: Record<string, Stamp> } | null = null;
  return {
    /**
     * Call before applying a swap; call what it returns after. For an
     * undo of the swap just before, that puts both kids' stamps back to
     * what they were before that swap.
     */
    swap(state: SubbedStamps, off: string | null | undefined, on: string, undo: boolean): () => void {
      const restore = undo && last && off && last.off === on && last.on === off ? last.was : null;
      last = off ? { off, on, was: { [off]: read(state, off), [on]: read(state, on) } } : null;
      if (!restore) return () => {};
      last = null;
      return () => {
        for (const [id, v] of Object.entries(restore)) write(state, id, v);
      };
    },
  };
}

/** A swap event's `undo` flag, as stored. */
export const isUndoSwap = (meta: unknown): boolean => (meta as { undo?: unknown } | null)?.undo === true;
