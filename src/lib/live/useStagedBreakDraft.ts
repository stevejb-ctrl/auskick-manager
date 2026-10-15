"use client";

// ─── useStagedBreakDraft ──────────────────────────────────────────
// Keeps a break screen's staged lineup in the live store so it survives
// leaving the live screen (see `breakDraft.ts`). Shared by the AFL and
// netball breaks (CLAUDE.md: one mechanism across sports).
//
//   1. Once the store has hydrated from disk and the break knows who's
//      in the game, restore this game's draft for this break (if any),
//      reconciled with who can play now, through `onRestore`.
//   2. From then on, save the draft and mode whenever they change.
//   3. `clear()` when the period starts: the draft is spent, and nothing
//      is saved after it (the store's period moves on before unmount).

import { useEffect, useRef, useState } from "react";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import { restoreBreakDraft, type RestoredBreakDraft } from "@/lib/live/breakDraft";

export interface UseStagedBreakDraftOptions {
  gameId: string;
  /** The period this break leads into (1-based). */
  period: number;
  /** False until the break knows who's in the game; restore waits for it. */
  ready?: boolean;
  /** Every group the break draws (AFL zones, netball positions). */
  groupIds: readonly string[];
  /** Kids who can play the next period. */
  availableIds: readonly string[];
  /** Kids in the game who can't play (hurt, lent), kept on the bench. */
  benchOnlyIds?: readonly string[];
  /** The draft as it stands. Memoise it: a new object saves again. */
  staged: { groups: Record<string, string[]>; bench: string[] };
  mode: string;
  /** Apply a restored draft (and its mode) to the break's state. */
  onRestore: (restored: RestoredBreakDraft) => void;
}

/** True once the live store has rehydrated its persisted slice. */
function useLiveStoreHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const persist = useLiveGame.persist;
    if (persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsubscribe = persist.onFinishHydration(() => setHydrated(true));
    if (persist.hasHydrated()) setHydrated(true);
    return unsubscribe;
  }, []);
  return hydrated;
}

export function useStagedBreakDraft(options: UseStagedBreakDraftOptions): { clear: () => void } {
  const { gameId, period, ready = true, staged, mode } = options;
  const latest = useRef(options);
  latest.current = options;
  const setBreakDraft = useLiveGame((s) => s.setBreakDraft);
  const hydrated = useLiveStoreHydrated();
  const [restoreDone, setRestoreDone] = useState(false);
  const clearedRef = useRef(false);

  useEffect(() => {
    if (restoreDone || !hydrated || !ready) return;
    const o = latest.current;
    const restored = restoreBreakDraft(useLiveGame.getState().breakDraft, o);
    if (restored) o.onRestore(restored);
    setRestoreDone(true);
  }, [restoreDone, hydrated, ready]);

  useEffect(() => {
    // Not before the restore: saving first would overwrite the draft
    // the coach left with the fresh suggestion.
    if (!restoreDone || clearedRef.current) return;
    setBreakDraft({ gameId, period, groups: staged.groups, bench: staged.bench, mode });
  }, [restoreDone, gameId, period, staged, mode, setBreakDraft]);

  return {
    clear: () => {
      clearedRef.current = true;
      setBreakDraft(null);
    },
  };
}
