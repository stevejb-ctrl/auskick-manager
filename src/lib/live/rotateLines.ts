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
import { rotateGroups } from "@/lib/live/break/rotateGroups";

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
  // Cycle order = the zones in field order, so the "next zone" wraps
  // Back → … → Forward → Back. The shared rotation does the placing
  // (every sport's break Rotate runs on it).
  const zm = (pid: string): ZoneMinutes => zoneMins[pid] ?? emptyZoneMs();
  const { groups, bench } = rotateGroups({
    players,
    cycle: ALL_ZONES,
    caps,
    timeIn: (pid, z) => zm(pid)[z as Zone] ?? 0,
    total: (pid) => ALL_ZONES.reduce((s, z) => s + (zm(pid)[z] ?? 0), 0),
    lastGroup: lastZone,
    sidelinedIds,
  });
  return {
    back: groups.back ?? [],
    hback: groups.hback ?? [],
    mid: groups.mid ?? [],
    hfwd: groups.hfwd ?? [],
    fwd: groups.fwd ?? [],
    bench,
  };
}
