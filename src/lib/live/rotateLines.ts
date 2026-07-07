// ─── "Rotate lines" quarter rotation (Idea 2) ────────────────
// A simpler, more predictable alternative to the fairness rebalancer:
// at each quarter break everyone shifts one line up the ground —
// Back → Mid → Forward → Back — so a coach can tell the kids "you're
// moving up a line". Steve 2026-07-07.
//
// Zone SIZES stay fixed (the coach's 3/4/3). Each player's destination
// is the next zone in the cycle from where they just played. For EVEN
// zones that's a clean full rotation (nobody repeats). For UNEVEN zones
// (e.g. 4 mids can't all fit 3 forward slots) the destination is
// oversubscribed, so it's filled by "who's spent least time in that
// zone" and the overflow drops into whatever slot is still open — rule
// (b). Within the quarter the normal rolling-sub interchange still runs
// (an incoming bench player inherits the vacated zone), so this only
// decides the START-of-quarter shape.
//
// Bench handling: when there are more available players than on-field
// slots, the players with the MOST total on-field time sit (bench time
// equalises); the least-played come on and join the rotation.
//
// Pure + deterministic: equal inputs yield a deep-equal lineup.

import type { Lineup, Zone } from "@/lib/types";
import { ALL_ZONES, emptyZoneMs, type ZoneCaps, type ZoneMinutes } from "@/lib/fairness";

export interface RotateLinesInput {
  /** Available, healthy player ids to place. */
  players: string[];
  /** Zone sizes to fill (the coach's current shape, e.g. 3/4/3). */
  caps: ZoneCaps;
  /** Per-player time-in-each-zone so far this game (minutes). */
  zoneMins: Record<string, ZoneMinutes>;
  /** Zone each player ended the just-finished quarter in (bench → undefined). */
  lastZone: Record<string, Zone | undefined>;
  /** Sidelined (injured / loaned) ids to keep parked on the bench. */
  sidelinedIds?: string[];
}

export function rotateLines({
  players,
  caps,
  zoneMins,
  lastZone,
  sidelinedIds = [],
}: RotateLinesInput): Lineup {
  const lineup: Lineup = { back: [], hback: [], mid: [], hfwd: [], fwd: [], bench: [] };
  // Cycle order = the active zones (caps > 0) in field order, so the
  // "next zone" wraps Back → … → Forward → Back.
  const cycle = ALL_ZONES.filter((z) => (caps[z] ?? 0) > 0);
  if (cycle.length === 0) {
    lineup.bench = [...players, ...sidelinedIds];
    return lineup;
  }
  const onFieldSize = cycle.reduce((n, z) => n + (caps[z] ?? 0), 0);
  const nextZone = (z: Zone): Zone => cycle[(cycle.indexOf(z) + 1) % cycle.length];

  const zm = (pid: string): ZoneMinutes => zoneMins[pid] ?? emptyZoneMs();
  const total = (pid: string) => ALL_ZONES.reduce((s, z) => s + (zm(pid)[z] ?? 0), 0);
  const leastInZone = (z: Zone) => (a: string, b: string) =>
    (zm(a)[z] ?? 0) - (zm(b)[z] ?? 0) || (a < b ? -1 : a > b ? 1 : 0);

  // Field vs bench: least total on-field time comes on (the most-played
  // rest), so bench time evens out. Deterministic id tiebreak.
  const byLeastPlayed = [...players].sort(
    (a, b) => total(a) - total(b) || (a < b ? -1 : a > b ? 1 : 0),
  );
  const field = byLeastPlayed.slice(0, onFieldSize);
  const benched = byLeastPlayed.slice(onFieldSize);

  // Pass 1 — send each player to their cycle destination. A destination
  // that's oversubscribed keeps the players with the LEAST time there;
  // the rest (and anyone with no active last-zone, e.g. off the bench)
  // spill into the pool for pass 2.
  const wanting: Record<string, string[]> = {};
  for (const z of cycle) wanting[z] = [];
  const pool: string[] = [];
  for (const pid of field) {
    const last = lastZone[pid];
    const dest = last && cycle.includes(last) ? nextZone(last) : null;
    if (dest) wanting[dest].push(pid);
    else pool.push(pid);
  }
  for (const z of cycle) {
    const cap = caps[z] ?? 0;
    const sorted = wanting[z].sort(leastInZone(z));
    lineup[z] = sorted.slice(0, cap);
    pool.push(...sorted.slice(cap)); // overflow waits for pass 2
  }

  // Pass 2 — fill whatever slots are still open from the pool, each by
  // who's spent least time in that zone.
  for (const z of cycle) {
    const open = (caps[z] ?? 0) - lineup[z].length;
    if (open <= 0) continue;
    pool.sort(leastInZone(z));
    lineup[z].push(...pool.splice(0, open));
  }

  lineup.bench = [...pool, ...benched, ...sidelinedIds];
  return lineup;
}
