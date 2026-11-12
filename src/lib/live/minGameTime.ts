// ─── The game-time minimum, live ─────────────────────────────
// Where a sport holds kids to a minimum share of the game (AFL's
// rotation rule, minGameTimePct; rugby's 50 %), the live screen says
// who's in danger of missing it: "Needs 6′ more" under the kid, "3 under
// 50%" in the info line, "62% of game · min 50%" in the kid bar.
//
// A kid is flagged only when they're at risk by full time, not when
// they're behind right now: at the first bounce every bench kid has
// played 0 % of 0 minutes, and none of them is in trouble. The test is
// the break check's ("can't reach 50% now", playbook/ruleCheck), run
// from the live clock: the minimum is a share of the time the kid could
// play (the game, less the time they were late, hurt or lent), and a kid
// is at risk once the time left in the game, less what they still need,
// is shorter than the wait for their next chance to come on. Pure.

export interface MinTimeInput {
  /** ms the kid has played this game so far, the open stint included. */
  playedMs: number;
  /**
   * ms the kid couldn't play so far: late, hurt, lent (awayMsSoFar /
   * awayMsByPeriod, with the period in progress cut at now).
   */
  awayMs?: number;
  /** The whole game's length in ms (periods × period length). */
  gameMs: number;
  /** Game time gone, in ms (earlier periods + the clock in this one). */
  elapsedMs: number;
  /** The minimum, as a percent of the game (50 = half). 0: no minimum. */
  minPct: number;
  /**
   * How long until the kid's next chance to come on: the sub interval
   * where subs roll, the rest of the period where they wait for the break.
   */
  soonMs: number;
  /** Out right now (hurt, lent, fouled out): not flagged, there's nothing to do. */
  out?: boolean;
}

export interface MinTimeState {
  /** Share of the game so far the kid has played, 0–100, rounded. */
  pct: number;
  minPct: number;
  /** ms still to play to reach the minimum by full time (0 once there). */
  neededMs: number;
  /** Whole minutes still needed, rounded up (≥ 1 while any is needed). */
  neededMin: number;
  /** Can still reach it if they play the rest of the game. */
  canReach: boolean;
  /** Will miss it unless they come on (or stay on) at the next chance. */
  atRisk: boolean;
}

/** Share of the game so far the kid has played, 0–100, rounded. 0 before any time has gone. */
export function pctOfGame(playedMs: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((playedMs / elapsedMs) * 100)));
}

/** Whole minutes for `ms`, rounded up: 1 for any time at all, 0 for none. */
export function minutesNeeded(ms: number): number {
  return ms > 0 ? Math.max(1, Math.ceil(ms / 60_000)) : 0;
}

export function minTimeState(input: MinTimeInput): MinTimeState {
  const { playedMs, gameMs, elapsedMs, minPct, soonMs } = input;
  const pct = pctOfGame(playedMs, elapsedMs);
  const could = Math.max(0, gameMs - Math.max(0, input.awayMs ?? 0));
  const neededMs = minPct > 0 ? Math.max(0, Math.ceil((minPct / 100) * could - playedMs)) : 0;
  const leftMs = Math.max(0, gameMs - Math.max(0, elapsedMs));
  // How long the kid can still sit and make it.
  const slackMs = leftMs - neededMs;
  const atRisk = !input.out && could > 0 && neededMs > 0 && slackMs < Math.max(0, soonMs);
  return { pct, minPct, neededMs, neededMin: minutesNeeded(neededMs), canReach: neededMs <= leftMs, atRisk };
}

/** Kids at risk of missing the minimum. */
export function atRiskCount(states: readonly MinTimeState[]): number {
  return states.filter((s) => s.atRisk).length;
}

/** The info line's part: "3 under 50%", or null when nobody is at risk. */
export function underMinText(count: number, minPct: number): string | null {
  return count > 0 ? `${count} under ${minPct}%` : null;
}

/** The kid bar's line: "62% of game · min 50%". */
export function minBarText(state: Pick<MinTimeState, "pct" | "minPct">): string {
  return `${state.pct}% of game · min ${state.minPct}%`;
}
