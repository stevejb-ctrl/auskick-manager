// ─── Rotate: everyone moves along one group ──────────────────
// The break screen's "Rotate" for any sport with lines: each kid who
// played last period moves to the next group in the cycle (AFL back →
// centre → forward → back; soccer defence → midfield → attack; rugby
// forwards ↔ backs), group sizes fixed. The least-played kids take the
// field; where more want a group than it holds, the ones with the least
// time there get it, and the rest fill the gaps by the same measure. A
// sport with one group (basketball's Equal minutes, soccer's 4 a side)
// just brings its least-played kids on. Started as AFL's rotateLines
// (Steve 2026-07-07), which now runs on this.
//
// A kid who doesn't play a group ("Plays as" in the soccer family,
// union's picked front row) moves on to the next group along they do
// play, or stays put; gaps go to kids who play there first (round 2
// usability, 24 Oct 2026: futsal's Rotate put a "Plays as: Wings" kid
// at Back, and union's sent the whole front row to the wings).

import type { StagedLineup } from "@/lib/live/break/board";

export interface RotateGroupsInput {
  /** Healthy kids to place. */
  players: readonly string[];
  /** Groups in rotation order: each kid moves to the next one. */
  cycle: readonly string[];
  /** Kids per group. */
  caps: Readonly<Record<string, number>>;
  /** Time a kid has had in a group this game (any unit). */
  timeIn: (playerId: string, group: string) => number;
  /** A kid's game time so far (same unit). */
  total: (playerId: string) => number;
  /** Group each kid ended last period in (bench: undefined). */
  lastGroup: Readonly<Record<string, string | undefined>>;
  /** Sidelined kids, kept at the end of the bench. */
  sidelinedIds?: readonly string[];
  /** Whether a kid plays a group at all. Every group when omitted. */
  plays?: (playerId: string, group: string) => boolean;
}

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function rotateGroups({
  players,
  cycle: allGroups,
  caps,
  timeIn,
  total,
  lastGroup,
  sidelinedIds = [],
  plays = () => true,
}: RotateGroupsInput): StagedLineup {
  const groups: Record<string, string[]> = {};
  const cycle = allGroups.filter((g) => (caps[g] ?? 0) > 0);
  for (const g of cycle) groups[g] = [];
  if (cycle.length === 0) return { groups, bench: [...players, ...sidelinedIds] };

  const onField = cycle.reduce((n, g) => n + (caps[g] ?? 0), 0);
  // The next group along this kid plays (their own last), else none.
  const next = (pid: string, g: string) => {
    const i = cycle.indexOf(g);
    for (let k = 1; k <= cycle.length; k++) {
      const to = cycle[(i + k) % cycle.length];
      if (plays(pid, to)) return to;
    }
    return null;
  };
  const leastIn = (g: string) => (a: string, b: string) => timeIn(a, g) - timeIn(b, g) || byId(a, b);

  const byLeastPlayed = [...players].sort((a, b) => total(a) - total(b) || byId(a, b));
  const field = byLeastPlayed.slice(0, onField);
  const benched = byLeastPlayed.slice(onField);

  // Pass 1: each kid who played last period wants the next group along.
  const wanting: Record<string, string[]> = {};
  for (const g of cycle) wanting[g] = [];
  const pool: string[] = [];
  for (const pid of field) {
    const last = lastGroup[pid];
    const to = last && cycle.includes(last) ? next(pid, last) : null;
    if (to) wanting[to].push(pid);
    else pool.push(pid);
  }
  // A kid who plays only this group goes first: anywhere else they'd misfit.
  const only = (pid: string) => cycle.filter((g) => plays(pid, g)).length === 1;
  for (const g of cycle) {
    const sorted = wanting[g].sort((a, b) => Number(only(b)) - Number(only(a)) || leastIn(g)(a, b));
    groups[g] = sorted.slice(0, caps[g]);
    pool.push(...sorted.slice(caps[g])); // overflow waits for pass 2
  }

  // Pass 2: the rest fill the gaps, least time in the group first:
  // kids who play there, then (the check flags them) anyone.
  for (const anyone of [false, true]) {
    for (const g of cycle) {
      const open = (caps[g] ?? 0) - groups[g].length;
      if (open <= 0) continue;
      pool.sort(leastIn(g));
      const fits = pool.filter((pid) => anyone || plays(pid, g)).slice(0, open);
      groups[g].push(...fits);
      for (const pid of fits) pool.splice(pool.indexOf(pid), 1);
    }
  }

  return { groups, bench: [...pool, ...benched, ...sidelinedIds] };
}
