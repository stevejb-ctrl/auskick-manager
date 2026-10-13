// Sideline combos: a model-based random walk over a sport's in-game
// actions. Steve (Oct 2026): most sideline bugs came from combinations
// (a kid lent, then another injured, then swaps at the break), so each
// walk mixes every action a coach can take, in random legal orders,
// replays the event log after each step and checks the sport's
// invariants. A failure reports the seed and the action trace, so it
// replays exactly.

import type { GameEvent, GameEventType } from "@/lib/types";

/** Deterministic PRNG (mulberry32): the same seed gives the same walk. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    pick<T>(xs: readonly T[]): T {
      if (xs.length === 0) throw new Error("pick from empty");
      return xs[Math.floor(next() * xs.length)];
    },
    chance: (p: number) => next() < p,
  };
}
export type Rng = ReturnType<typeof rng>;

/** Builds events with strictly increasing created_at, as the server would. */
export function eventLog(gameId = "g1") {
  const events: GameEvent[] = [];
  let ms = Date.UTC(2026, 9, 10, 9, 0, 0);
  let n = 0;
  return {
    events,
    add(type: GameEventType, metadata: Record<string, unknown> = {}, playerId: string | null = null): GameEvent {
      ms += 1000;
      const ev: GameEvent = {
        id: `e${++n}`,
        game_id: gameId,
        type,
        player_id: playerId,
        metadata,
        created_by: null,
        created_at: new Date(ms).toISOString(),
      };
      events.push(ev);
      return ev;
    },
  };
}

/** Thrown by a walk's checks; carries the trace for the report. */
export class InvariantError extends Error {}

export interface WalkResult {
  seed: number;
  steps: number;
  trace: string[];
}

/**
 * Run `walk` for many seeds. On a failure, rethrow with the seed and the
 * last actions so the combination is obvious and replayable.
 */
export function runWalks(
  seeds: number,
  walk: (r: Rng, trace: string[]) => void,
  { firstSeed = 1 }: { firstSeed?: number } = {},
): void {
  for (let seed = firstSeed; seed < firstSeed + seeds; seed++) {
    const trace: string[] = [];
    try {
      walk(rng(seed), trace);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`seed ${seed}: ${msg}\n  after: ${trace.slice(-15).join(" → ")}`);
    }
  }
}

/** Assert helper that fails with a readable message. */
export function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new InvariantError(msg);
}

/** Duplicates in a list, for "a kid in two places". */
export function dupes(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out = new Set<string>();
  for (const id of ids) (seen.has(id) ? out : seen).add(id);
  return Array.from(out);
}
