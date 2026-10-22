// ─── The lineup staged at a period break ──────────────────────────
//
// What the coach builds at a break (swaps, fills, the mode they picked)
// used to live only in the break screen's state, so leaving the live
// screen (the team page and back, a reload, the phone evicting the tab)
// threw it away and the auto-suggestion came back (Stagehand round 5).
// The draft is now kept in the live store's persisted `breakDraft`
// slice, keyed by game and break, and restored by `useStagedBreakDraft`.
//
// Sport-neutral, like the plan-ahead pin: `groups` are AFL zones,
// netball positions, or a sport's lines. A sport whose kids also hold a
// named position inside their line (basketball's PG to C) keeps it in
// `slots`, so a restored draft doesn't lose it.

export interface StagedBreakDraft {
  gameId: string;
  /** The period the draft starts (1-based): it's staged at the break before it. */
  period: number;
  /** groupId -> player ids, as staged. */
  groups: Record<string, string[]>;
  bench: string[];
  /** Named positions, player id -> position, for sports that have them. */
  slots?: Record<string, string>;
  /** The break's lineup mode when it was staged ("keep", "manual", …). */
  mode: string;
}

export interface RestoredBreakDraft {
  groups: Record<string, string[]>;
  bench: string[];
  /** Positions of the kids restored to a group; absent when none were staged. */
  slots?: Record<string, string>;
  mode: string;
}

export interface RestoreBreakDraftInput {
  gameId: string;
  /** The period this break leads into (1-based). */
  period: number;
  /** Every group the break draws, so each gets an entry. */
  groupIds: readonly string[];
  /** Kids who can play the next period. Only they may stay on the field. */
  availableIds: readonly string[];
  /** Kids still in the game who can't play (hurt, lent): bench only. */
  benchOnlyIds?: readonly string[];
}

/**
 * The staged draft for this game's break, reconciled with who can play
 * now, or null when there's none for it. A kid hurt or lent since comes
 * off the field (onto the bench when `benchOnlyIds` lists them), a kid
 * no longer in the game is dropped, and anyone who can play but isn't
 * placed (arrived, or back since) joins the bench, so nobody is lost.
 * Kids back on the field keep their staged position (`slots`).
 */
export function restoreBreakDraft(
  draft: StagedBreakDraft | null | undefined,
  input: RestoreBreakDraftInput,
): RestoredBreakDraft | null {
  if (!draft || draft.gameId !== input.gameId || draft.period !== input.period) {
    return null;
  }
  const available = new Set(input.availableIds);
  const benchOnly = new Set(input.benchOnlyIds ?? []);
  const placed = new Set<string>();

  const groups: Record<string, string[]> = {};
  for (const groupId of input.groupIds) {
    groups[groupId] = [];
    for (const id of draft.groups[groupId] ?? []) {
      if (!available.has(id) || placed.has(id)) continue;
      groups[groupId].push(id);
      placed.add(id);
    }
  }
  // A position stays with a kid still on the field; one benched since
  // gives theirs up.
  let slots: Record<string, string> | undefined;
  if (draft.slots) {
    slots = {};
    for (const [id, slot] of Object.entries(draft.slots)) if (placed.has(id)) slots[id] = slot;
  }

  const bench: string[] = [];
  const toBench = (id: string) => {
    if (placed.has(id)) return;
    placed.add(id);
    bench.push(id);
  };
  for (const id of draft.bench) {
    if (available.has(id) || benchOnly.has(id)) toBench(id);
  }
  for (const ids of Object.values(draft.groups)) {
    for (const id of ids) if (benchOnly.has(id)) toBench(id);
  }
  for (const id of input.availableIds) toBench(id);
  for (const id of input.benchOnlyIds ?? []) toBench(id);

  return { groups, bench, ...(slots ? { slots } : {}), mode: draft.mode };
}
