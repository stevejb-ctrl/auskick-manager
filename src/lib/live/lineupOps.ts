// ─── Pure lineup operations (AFL zones) ───────────────────────────
// Small, side-effect-free transforms on the AFL Lineup shape, so the
// live components can stay declarative and the logic is unit-testable.

import type { Lineup } from "@/lib/types";
import { ALL_ZONES } from "@/lib/fairness";
import {
  availablePlayersForPlan,
  seedNextPeriodLineup,
  type PlannedRotation,
} from "@/lib/game-plan";

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
 * Bench every sidelined (injured / lent / out) player who is on the field.
 * The AFL break commits this at the Start tap, so however the draft got
 * there ("Keep last quarter" picked after a kid was lent, say) a sidelined
 * kid never starts the next quarter on the field. Returns the SAME object
 * when nobody sidelined is on the field.
 */
export function benchSidelinedInLineup(
  lineup: Lineup,
  sidelined: ReadonlySet<string>,
): Lineup {
  let next = lineup;
  for (const z of ALL_ZONES) {
    for (const pid of lineup[z]) {
      if (sidelined.has(pid)) next = benchPlayerInLineup(next, pid);
    }
  }
  return next;
}

/**
 * A bench player replaces an on-field one in `zone`, taking their spot;
 * the player coming off goes to the bench. The AFL break's mark-out
 * replacement used to ADD the replacement beside the out player, leaving
 * both on (sideline combos).
 */
export function replaceInLineup(
  lineup: Lineup,
  outId: string,
  inId: string,
  zone: (typeof ALL_ZONES)[number],
): Lineup {
  const benched = benchPlayerInLineup(lineup, outId);
  const next: Lineup = { ...benched, bench: benched.bench.filter((id) => id !== inId) };
  for (const z of ALL_ZONES) next[z] = benched[z].filter((id) => id !== inId);
  const at = lineup[zone].indexOf(outId);
  const spot = [...next[zone]];
  spot.splice(at < 0 ? spot.length : at, 0, inId);
  next[zone] = spot;
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
 * Repeat at the break: last period's court again, for the kids who can
 * still play (`pool`). A kid who joined during the period (a late
 * arrival) isn't in last period's lineup, so they join the end of the
 * bench rather than vanish from both. A kid no longer in the pool
 * (hurt, lent) leaves their spot empty. Never mutates `previous`.
 */
export function repeatPositionLineup<
  T extends { positions: Record<string, string[]>; bench: string[] },
>(previous: T, pool: readonly string[]): T {
  const canPlay = new Set(pool);
  const positions: Record<string, string[]> = {};
  for (const [pos, ids] of Object.entries(previous.positions)) {
    positions[pos] = ids.filter((id) => canPlay.has(id));
  }
  const placed = new Set(Object.values(positions).flat());
  const bench = previous.bench.filter((id) => canPlay.has(id) && !placed.has(id));
  for (const id of pool) if (!placed.has(id) && !bench.includes(id)) bench.push(id);
  return { ...previous, positions, bench };
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

interface LeagueLineupShape {
  forwards: string[];
  backs: string[];
  bench: string[];
}

/**
 * Rugby league: the coming period's lineup from the coach's plan, as the
 * break shows it and Start commits it. The plan is reconciled first
 * (`seedNextPeriodLineup`), so a kid who can't play now is never
 * fielded. The bench is the planned bench, then anyone available the
 * plan never placed (a late arrival), then the hurt and lent kids,
 * parked there so they stay in the game (AFL parity). Kids who aren't
 * in `lineup` (never turned up) stay out. Null when nothing is planned
 * for the period.
 */
export function plannedLeagueLineup(input: {
  pin: PlannedRotation | null | undefined;
  /** 0-based index of the period about to start. */
  periodIndex: number;
  /** The lineup the last period ended on: who is in the game. */
  lineup: LeagueLineupShape;
  squad: readonly { id: string }[];
  injured: ReadonlySet<string>;
  loaned: ReadonlySet<string>;
}): LeagueLineupShape | null {
  const { lineup, injured, loaned } = input;
  const inGameIds = new Set([...lineup.forwards, ...lineup.backs, ...lineup.bench]);
  const availableIds = availablePlayersForPlan(input.squad, inGameIds, injured, loaned).map((p) => p.id);
  const seed = seedNextPeriodLineup({
    pin: input.pin,
    periodIndex: input.periodIndex,
    availableIds,
    groupIds: ["forwards", "backs"],
  });
  if (!seed) return null;
  const forwards = seed.groups.forwards ?? [];
  const backs = seed.groups.backs ?? [];
  const placed = new Set([...forwards, ...backs]);
  const bench = new Set(seed.bench.filter((id) => !placed.has(id)));
  for (const id of availableIds) {
    if (!placed.has(id)) bench.add(id);
  }
  inGameIds.forEach((id) => {
    if ((injured.has(id) || loaned.has(id)) && !placed.has(id)) bench.add(id);
  });
  return { forwards, backs, bench: Array.from(bench) };
}
