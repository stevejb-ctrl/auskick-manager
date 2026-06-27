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

/**
 * Netball/positions analog of `benchPlayerInLineup`: move a player out of
 * their named court position onto the bench. The vacated position is left
 * empty — netball needs all positions filled to start, so this forces the
 * coach to pick a replacement before kickoff (rather than starting the
 * injured player on court). Structural over `{ positions, bench }` so it
 * works for any GenericLineup-shaped value without importing the netball
 * type. Returns the SAME object when the player isn't on court.
 */
export function benchPlayerInPositionLineup<
  T extends { positions: Record<string, string[]>; bench: string[] },
>(lineup: T, pid: string): T {
  const onCourt = Object.values(lineup.positions).some((ids) =>
    ids.includes(pid),
  );
  if (!onCourt) return lineup;
  const positions: Record<string, string[]> = {};
  for (const [pos, ids] of Object.entries(lineup.positions)) {
    positions[pos] = ids.filter((id) => id !== pid);
  }
  const bench = lineup.bench.includes(pid)
    ? [...lineup.bench]
    : [...lineup.bench, pid];
  return { ...lineup, positions, bench };
}

/**
 * Rugby-league reconcile: move every sidelined (injured / loaned) player
 * off the field (forwards + backs) onto the bench. Used when committing
 * the next period's lineup at the Start tap — league has no persistent
 * break draft, so this is where a mark-out-without-replacement player is
 * taken off so they don't start the next period on the field still
 * accruing minutes. Returns the SAME object when no on-field player is
 * sidelined (so the caller can skip the lineup write).
 */
export function benchSidelinedInLeagueLineup<
  T extends { forwards: string[]; backs: string[]; bench: string[] },
>(lineup: T, sidelined: ReadonlySet<string>): T {
  const movedOff = [...lineup.forwards, ...lineup.backs].filter((id) =>
    sidelined.has(id),
  );
  if (movedOff.length === 0) return lineup;
  return {
    ...lineup,
    forwards: lineup.forwards.filter((id) => !sidelined.has(id)),
    backs: lineup.backs.filter((id) => !sidelined.has(id)),
    bench: [
      ...lineup.bench,
      ...movedOff.filter((id) => !lineup.bench.includes(id)),
    ],
  };
}
