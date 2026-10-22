// ─── Period break board ──────────────────────────────────────
// The break screen's lineup as slots: each zone's slots in the sport's
// display order (lib/sports/break.ts), then one slot per bench kid. A
// sport hands its lineup over as a staged draft (the same
// `{ groups, bench }` the persisted break draft keeps): groups keyed by
// zone ("fwd", "att"), or by position where a slot is a bib (netball's
// "gs"). Everything here is sport-neutral: swapping two slots, saying
// where a kid has come from, spotting low game time, and looking for the
// single swap that clears a broken rule.

import type { BreakZoneColor, BreakZoneDef } from "@/lib/sports/types";

export const BENCH = "bench";

/** A lineup as the break draft keeps it. */
export interface StagedLineup {
  groups: Record<string, string[]>;
  bench: string[];
}

export interface BoardSlot {
  /** The zone this slot is in, or "bench". */
  zone: string;
  /**
   * The lineup group holding it: a netball position ("gs"), else the
   * zone key; "bench" on the bench.
   */
  group: string;
  /** Where in its group's list the slot sits. */
  index: number;
  /** Netball: the bib printed on the slot. */
  label?: string;
  playerId: string | null;
}

/**
 * The slots for a staged lineup: every zone's (at least as many as the
 * zone has; a kid over the count gets a slot rather than vanishing),
 * then the bench, kids who can play first and anyone sidelined last.
 */
export function buildBoard(
  zones: readonly BreakZoneDef[],
  staged: StagedLineup,
  sidelined: ReadonlySet<string> = new Set(),
): BoardSlot[] {
  const out: BoardSlot[] = [];
  for (const z of zones) {
    if (z.slotIds) {
      z.slotIds.forEach((pos, i) =>
        out.push({ zone: z.key, group: pos, index: 0, label: z.slotLabels?.[i], playerId: staged.groups[pos]?.[0] ?? null }),
      );
      continue;
    }
    const ids = staged.groups[z.key] ?? [];
    for (let i = 0; i < Math.max(z.slots, ids.length); i++) {
      out.push({ zone: z.key, group: z.key, index: i, playerId: ids[i] ?? null });
    }
  }
  const bench = staged.bench.map((id, index) => ({ id, index }));
  for (const { id, index } of [...bench.filter((b) => !sidelined.has(b.id)), ...bench.filter((b) => sidelined.has(b.id))]) {
    out.push({ zone: BENCH, group: BENCH, index, playerId: id });
  }
  return out;
}

/**
 * Swap what two slots hold. Two kids trade places (a bib stays with its
 * slot); a kid and an empty slot: the kid moves into it, leaving theirs
 * empty. Returns the same draft when there's nothing to do.
 */
export function swapInStaged(staged: StagedLineup, a: BoardSlot, b: BoardSlot): StagedLineup {
  const groups: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(staged.groups)) groups[k] = [...v];
  const bench = [...staged.bench];
  const list = (g: string) => (g === BENCH ? bench : (groups[g] ??= []));
  const pa = a.playerId;
  const pb = b.playerId;
  if (pa && pb) {
    const la = list(a.group);
    const lb = list(b.group);
    const ia = la.indexOf(pa);
    const ib = lb.indexOf(pb);
    if (ia < 0 || ib < 0 || pa === pb) return staged;
    la[ia] = pb;
    lb[ib] = pa;
    return { groups, bench };
  }
  if (!pa && !pb) return staged;
  const [from, to, pid] = pa ? [a, b, pa] : [b, a, pb as string];
  const lf = list(from.group);
  const at = lf.indexOf(pid);
  if (at < 0) return staged;
  lf.splice(at, 1);
  const lt = list(to.group);
  lt.splice(Math.min(to.index, lt.length), 0, pid);
  return { groups, bench };
}

/** Where each kid is in a staged lineup: their group, or "bench". */
export function placesOf(staged: StagedLineup): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [group, ids] of Object.entries(staged.groups)) for (const id of ids) out[id] = group;
  for (const id of staged.bench) out[id] = BENCH;
  return out;
}

export interface PlaceInfo {
  /** "Fwd", a netball bib "GS", or "Bench". */
  short: string;
  color: BreakZoneColor | "bench";
}

/** What to call each place (zone, netball bib, bench) and its colour. */
export function placeIndex(zones: readonly BreakZoneDef[]): Record<string, PlaceInfo> {
  const out: Record<string, PlaceInfo> = { [BENCH]: { short: "Bench", color: "bench" } };
  for (const z of zones) {
    out[z.key] = { short: z.short, color: z.color };
    z.slotIds?.forEach((pos, i) => {
      out[pos] = { short: z.slotLabels?.[i] ?? pos.toUpperCase(), color: z.color };
    });
  }
  return out;
}

/**
 * A tile's movement line: "Stays", "From bench" or "From Fwd" (netball:
 * "From GS"), against where the kid ended last period. A kid who wasn't
 * in last period's lineup comes from the bench.
 */
export function movementText(previous: string | undefined, now: string, places: Record<string, PlaceInfo>): string {
  const prev = previous ?? BENCH;
  if (prev === now) return "Stays";
  if (prev === BENCH) return "From bench";
  return `From ${places[prev]?.short ?? prev}`;
}

/** The team's average game time over the kids who can play. */
export function averageMs(ids: readonly string[], gameMs: Readonly<Record<string, number>>): number {
  if (ids.length === 0) return 0;
  return ids.reduce((sum, id) => sum + (gameMs[id] ?? 0), 0) / ids.length;
}

/** Game time this far (or more) under the average turns orange. */
export function isLowTime(ms: number, average: number, thresholdMs: number): boolean {
  return average - ms >= thresholdMs;
}

/** Whether two slots can be swapped (the break screen's tap-tap rule). */
export function canSwap(a: BoardSlot, b: BoardSlot, sidelined: ReadonlySet<string>): boolean {
  if (a === b) return false;
  if (a.zone === BENCH && b.zone === BENCH) return false;
  if (!a.playerId && !b.playerId) return false;
  if ((a.playerId && sidelined.has(a.playerId)) || (b.playerId && sidelined.has(b.playerId))) return false;
  return true;
}

export interface FixSearch {
  slots: readonly BoardSlot[];
  sidelined: ReadonlySet<string>;
  /** The broken rule to clear. */
  itemId: string;
  /** Kids the rule names: swaps involving them are tried first. */
  offenders?: readonly string[];
  /** Rules broken now. */
  failing: ReadonlySet<string>;
  /** Rules broken after swapping a and b. */
  failingAfter: (a: BoardSlot, b: BoardSlot) => ReadonlySet<string>;
  /** Most swaps to try (each one re-runs the rule check). */
  budget?: number;
}

/**
 * The single swap that clears a broken rule without breaking another, or
 * null. Not a solver: one swap, a bounded number of tries, offenders
 * first. When it finds nothing the screen hides Fix and keeps the rule.
 */
export function findFixSwap(search: FixSearch): [BoardSlot, BoardSlot] | null {
  const { slots, sidelined, itemId, failing, failingAfter } = search;
  const budget = search.budget ?? 400;
  const offenders = new Set(search.offenders ?? []);
  const named = (s: BoardSlot) => !!s.playerId && offenders.has(s.playerId);
  const pairs: [BoardSlot, BoardSlot][] = [];
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      if (canSwap(slots[i], slots[j], sidelined)) pairs.push([slots[i], slots[j]]);
    }
  }
  pairs.sort((p, q) => Number(named(q[0]) || named(q[1])) - Number(named(p[0]) || named(p[1])));
  let tries = 0;
  for (const [a, b] of pairs) {
    if (tries++ >= budget) break;
    const after = failingAfter(a, b);
    if (after.has(itemId)) continue;
    if (Array.from(after).every((id) => failing.has(id))) return [a, b];
  }
  return null;
}
