// Saved lineup drafts, against today's availability: shared by the
// coach's live page and the runner's (both seed the picker from the
// coach's saved plan, so the two phones start from the same lineup).

import type { GenericLineup } from "@/lib/sports/netball/fairness";

/**
 * B1 / AVAIL-01 (UX half): strip every player id not in `availableIds`
 * out of a saved draft lineup so a now-unavailable player visibly drops
 * off the field when the picker hydrates. Structural + recursive so it
 * covers AFL/league flat zone arrays AND netball's nested `positions`
 * map with one impl — mirroring the server-side
 * reconcileLineupToAvailability filter. Correctness is enforced
 * server-side at kickoff; this is purely the visible echo for the coach.
 */
export function filterLineupToAvailable<T>(
  lineup: T,
  availableIds: Set<string> | string[],
): T {
  const has = (id: string): boolean =>
    Array.isArray(availableIds)
      ? availableIds.includes(id)
      : availableIds.has(id);
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.filter((id) => typeof id === "string" && has(id));
    }
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = walk(v);
      }
      return out;
    }
    return node;
  };
  return walk(lineup) as T;
}

/**
 * B1 / AVAIL-01 (netball UX half): after `filterLineupToAvailable`
 * strips a now-unavailable player out of a netball draft, the court
 * is left with a NAMED empty position. Unlike AFL/league flat zone
 * arrays (where a removed player just shortens the array), netball's
 * `validateNetballLineup` blocks kickoff while any targeted court
 * position is empty — so the coach would be stranded at "Need 7 on
 * court". This backfills each empty court position, in canonical
 * order, from the available bench (any available id not already on
 * court). Mirrors D-04's "the normal rotation fills the vacated spot"
 * rule for netball's named-position model, keeping the silent
 * auto-remove startable. Server-side `reconcileLineupToAvailability`
 * remains the authoritative correctness backstop at kickoff.
 */
export function backfillNetballCourt(
  lineup: GenericLineup,
  courtPositions: readonly string[],
  availableIds: Set<string> | string[],
): GenericLineup {
  const availArr = Array.isArray(availableIds)
    ? availableIds
    : Array.from(availableIds);
  const positions = { ...lineup.positions };
  // Everyone currently placed on court (post-filter) — never double-place.
  const onCourt = new Set<string>();
  for (const pid of courtPositions) {
    const occ = positions[pid]?.[0];
    if (occ) onCourt.add(occ);
  }
  const bench = (lineup.bench ?? []).filter((id) => availArr.includes(id));
  // Candidate pool to draw from: available bench players first, then
  // any other available id not yet on court (defensive — covers a
  // draft whose bench list was itself stale).
  const pool = [
    ...bench,
    ...availArr.filter((id) => !onCourt.has(id) && !bench.includes(id)),
  ].filter((id) => !onCourt.has(id));
  const filledBench = new Set<string>();
  for (const pid of courtPositions) {
    const occupied = (positions[pid]?.length ?? 0) > 0;
    if (occupied) continue;
    const next = pool.find((id) => !onCourt.has(id));
    if (!next) break; // not enough available players — leave it empty
    positions[pid] = [next];
    onCourt.add(next);
    filledBench.add(next);
  }
  return {
    positions,
    bench: bench.filter((id) => !filledBench.has(id)),
  };
}
