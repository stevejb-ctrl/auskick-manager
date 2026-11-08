// ─── Rugby's 50% floor, live ─────────────────────────────────
// League and union hold every kid to a share of the game (How we play's
// minGameTimePct, Siren's 50% by default). The live screen says who's at
// risk of missing it: "Needs 8′ more" under the kid, "2 under 50%" in the
// info line (lib/live/minGameTime's rule: at risk by full time, not
// behind right now, so nobody is flagged at the kickoff).
//
// Counted as the sub suggester counts it (mustStayOn in fairness.ts): the
// kid's time on the field from the event log (playerMsOnField), against
// the same percentage of the whole game (periods × period length). The
// one difference is the time a kid couldn't play (late, hurt, lent),
// which comes off their game, as the break check takes it off: a kid who
// turned up at half time isn't flagged for the half they missed. Pure.

import { awayMsByPeriod } from "@/lib/playbook/awayTime";
import { minTimeState, type MinTimeState } from "@/lib/live/minGameTime";
import { playerMsOnField } from "@/lib/sports/rugby_league/fairness";
import type { GameEvent } from "@/lib/types";

export interface LeagueMinTimeInput {
  events: GameEvent[];
  /** The period in play (1-based); 0 before kickoff. */
  currentQuarter: number;
  /** ms into the period in play. */
  elapsedMs: number;
  /** Game time gone: the periods played, plus `elapsedMs`. */
  gameElapsedMs: number;
  periodMs: number;
  periodCount: number;
  /** The floor, % of the game (0: none). */
  minPct: number;
  /** The wait for a kid's next chance to come on: the sub interval. */
  soonMs: number;
  /** The kids in the game (on the field and the bench). */
  playerIds: readonly string[];
  /** Out right now (hurt, lent): not flagged. */
  out: ReadonlySet<string>;
}

/** Each kid's state against the floor; empty before kickoff or with no floor. */
export function leagueMinTimeStates(input: LeagueMinTimeInput): Map<string, MinTimeState> {
  const out = new Map<string, MinTimeState>();
  if (input.minPct <= 0 || input.currentQuarter < 1 || input.periodMs <= 0) return out;
  const played = playerMsOnField(input.events, input.currentQuarter, input.elapsedMs);
  // The period in play runs to now; the ones before ran their length.
  const away = awayMsByPeriod(
    input.events,
    (p) => (p === input.currentQuarter ? input.elapsedMs : input.periodMs),
    input.currentQuarter,
  );
  const gameMs = input.periodCount * input.periodMs;
  for (const pid of input.playerIds) {
    const awayMs = Object.values(away[pid] ?? {}).reduce((t, ms) => t + ms, 0);
    out.set(
      pid,
      minTimeState({
        playedMs: played[pid] ?? 0,
        awayMs,
        gameMs,
        elapsedMs: input.gameElapsedMs,
        minPct: input.minPct,
        soonMs: input.soonMs,
        out: input.out.has(pid),
      }),
    );
  }
  return out;
}
