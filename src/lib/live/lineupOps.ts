// ─── Pure lineup operations (AFL zones) ───────────────────────────
// Small, side-effect-free transforms on the AFL Lineup shape, so the
// live components can stay declarative and the logic is unit-testable.

import type { Lineup } from "@/lib/types";
import { ALL_ZONES } from "@/lib/fairness";

/**
 * Move a player out of every on-field zone and onto the bench.
 *
 * Used when a player is marked injured at the quarter break: an injured
 * player must not start the next quarter on the field (where they'd keep
 * accruing minutes despite the INJ badge — Steve 2026-06-15). Returns the
 * SAME object when the player isn't on the field (already benched / not in
 * this lineup), so callers can skip a no-op state update.
 *
 * Pure: never mutates its input.
 */
export function benchPlayerInLineup(lineup: Lineup, pid: string): Lineup {
  if (!ALL_ZONES.some((z) => lineup[z].includes(pid))) return lineup;
  const next: Lineup = { ...lineup, bench: [...lineup.bench] };
  for (const z of ALL_ZONES) {
    if (next[z].includes(pid)) {
      next[z] = next[z].filter((id) => id !== pid);
    }
  }
  if (!next.bench.includes(pid)) next.bench.push(pid);
  return next;
}
