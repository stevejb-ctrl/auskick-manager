// ─── Rugby (league and union): the break's Suggested and Rotate ─
// Who plays the next period, and in which line, from the game as it
// stands. It used to be the planner's cold projection of the next period
// (the plan-ahead modal's), given no events or minutes, so after live
// subs it broke the rules its own check enforces (round 2 usability,
// 24 Oct 2026, league P1): at U10 half time it benched two kids who
// still owed their unbroken half and kept on two who'd had theirs; at
// U9 it benched Tyler at Q3 and again at Q4 (8:00 of 32); it benched
// the kid planned to wear the DH vest.
//
// Now, in order:
//   1. Kids a Must can't wait for: their unbroken periods (Law 6) or
//      their game-time floor need every period left.
//   2. The next period's planned vest wearers.
//   3. Kids How we play keeps on.
//   4. The least slack: periods a kid can still sit and keep both rules.
//   5. Kids who sat out the last period, then the least time this game.
// If that order would leave a later break no legal lineup, the least
// slack goes first instead (least slack first always finds one when
// there is one). A restricted spot in force (union's front row) keeps a
// kid picked for it on, as the planner does. Lines split by the kids'
// roles (How we play), ties evening each kid's forwards and backs time.
// The kids who can't play go at the end of the bench. Rotate (lines
// swap) is here too, so union's front row stays where it's picked.

import { rotateGroups } from "@/lib/live/break/rotateGroups";
import { benchSidelinedInLeagueLineup } from "@/lib/live/lineupOps";
import { rugbyForwards } from "@/lib/sports/rugby/lines";
import {
  assignLeagueLines,
  canPlayPosition,
  restrictedKeysInForce,
  type LeaguePlaybookInput,
} from "@/lib/sports/rugby_league/engine";
import type { RugbySport } from "@/lib/sports/registry";
import type { AgeGroupConfig } from "@/lib/sports/types";

type Lineup = { forwards: string[]; backs: string[]; bench: string[] };

export interface LeagueBreakSuggestionInput {
  sport: RugbySport;
  ageGroup: AgeGroupConfig;
  /** The lineup at the end of the period just played. */
  previousLineup: Lineup;
  injured: ReadonlySet<string>;
  loaned: ReadonlySet<string>;
  onFieldSize: number;
  /** The period just played (1-based). */
  currentQuarter: number;
  leaguePlaybook?: LeaguePlaybookInput;
  /** Game time so far, ms. */
  msByPlayer: Readonly<Record<string, number>>;
  /** Time so far in each line, ms: ties go to the line a kid has played less. */
  lineMs?: Readonly<Record<string, { forwards: number; backs: number }>>;
  periodMs: number;
  /** Law 6: completed unbroken periods per kid, and how many the age group needs. */
  unbroken?: { required: number; done: Readonly<Record<string, number>> };
  /** The next period's planned vest wearers (vest_assigned for it). */
  vests?: { fr?: string; dh?: string };
  /** ms each kid couldn't play so far (late, hurt, lent): their floor is over the rest. */
  awayMs?: Readonly<Record<string, number>>;
  /** The game-time floor, %. Defaults to How we play's, else 50. */
  minGameTimePct?: number;
}

/**
 * Whole periods each kid still has to play, out of the `left` to come,
 * for Law 6 and the game-time floor (the larger), counting only the
 * rules they can still keep.
 */
export function leaguePeriodsOwed(input: {
  ids: readonly string[];
  left: number;
  periodCount: number;
  periodMs: number;
  msByPlayer: Readonly<Record<string, number>>;
  minGameTimePct: number;
  unbroken?: { required: number; done: Readonly<Record<string, number>> };
  awayMs?: Readonly<Record<string, number>>;
}): Record<string, number> {
  const out: Record<string, number> = {};
  const gameMs = input.periodCount * input.periodMs;
  for (const pid of input.ids) {
    const unbroken = input.unbroken ? Math.max(0, input.unbroken.required - (input.unbroken.done[pid] ?? 0)) : 0;
    const could = Math.max(0, gameMs - (input.awayMs?.[pid] ?? 0));
    const shortMs = (input.minGameTimePct / 100) * could - (input.msByPlayer[pid] ?? 0);
    const floor = shortMs > 0 && input.periodMs > 0 ? Math.ceil(shortMs / input.periodMs - 1e-9) : 0;
    out[pid] = Math.max(unbroken <= input.left ? unbroken : 0, floor <= input.left ? floor : 0);
  }
  return out;
}

/**
 * Whether `capacity` places a period over `periods` periods can give
 * every kid the periods they still owe: in the first j periods, each
 * kid needs at least what the last ones can't give them.
 */
function feasible(owed: readonly number[], periods: number, capacity: number): boolean {
  if (owed.some((n) => n > periods)) return false;
  for (let j = 1; j <= periods; j++) {
    const need = owed.reduce((s, n) => s + Math.max(0, n - (periods - j)), 0);
    if (need > capacity * j) return false;
  }
  return true;
}

export function leagueBreakSuggestion(input: LeagueBreakSuggestionInput): Lineup {
  const { previousLineup, injured, loaned, ageGroup, leaguePlaybook: pb } = input;
  const sidelined = new Set([...Array.from(injured), ...Array.from(loaned)]);
  const inGame = [...previousLineup.forwards, ...previousLineup.backs, ...previousLineup.bench];
  const healthy = inGame.filter((id) => !sidelined.has(id));
  const sidelinedInGame = inGame.filter((id) => sidelined.has(id));
  if (healthy.length === 0) return benchSidelinedInLeagueLineup(previousLineup, sidelined);

  const onCount = Math.min(input.onFieldSize, healthy.length);
  const left = Math.max(1, ageGroup.periodCount - input.currentQuarter);
  const owed = leaguePeriodsOwed({
    ids: healthy,
    left,
    periodCount: ageGroup.periodCount,
    periodMs: input.periodMs,
    msByPlayer: input.msByPlayer,
    minGameTimePct: input.minGameTimePct ?? pb?.minGameTimePct ?? 50,
    unbroken: input.unbroken,
    awayMs: input.awayMs,
  });
  const slack = (pid: string) => left - owed[pid];
  const vested = new Set([input.vests?.fr, input.vests?.dh].filter((id): id is string => !!id));
  const keepOn = (pid: string) => pb?.roles[pid]?.keepOn === true;
  const satLast = new Set(previousLineup.bench);
  const ms = (pid: string) => input.msByPlayer[pid] ?? 0;
  const at = new Map(healthy.map((pid, i) => [pid, i]));
  const rank = (keys: (pid: string) => number[]) =>
    [...healthy].sort((a, b) => {
      const ka = keys(a);
      const kb = keys(b);
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
      return (at.get(a) ?? 0) - (at.get(b) ?? 0);
    });
  const must = (pid: string) => (slack(pid) <= 0 ? 0 : 1);
  const vest = (pid: string) => (vested.has(pid) ? 0 : 1);
  const kept = (pid: string) => (keepOn(pid) ? 0 : 1);
  const sat = (pid: string) => (satLast.has(pid) ? 0 : 1);
  const preferred = rank((pid) => [must(pid), vest(pid), kept(pid), slack(pid), sat(pid), ms(pid)]);
  const leastSlack = rank((pid) => [slack(pid), vest(pid), kept(pid), sat(pid), ms(pid)]);
  const laterOk = (order: string[]) => {
    const on = new Set(order.slice(0, onCount));
    return feasible(
      healthy.map((pid) => Math.max(0, owed[pid] - (on.has(pid) ? 1 : 0))),
      left - 1,
      onCount,
    );
  };
  const order = laterOk(preferred) || !laterOk(leastSlack) ? preferred : leastSlack;
  const onField = order.slice(0, onCount);
  const bench = order.slice(onCount);

  // A restricted spot in force (union's front row) keeps a kid picked for
  // it on: if none is on and one sits out, they swap with the last kid in
  // who isn't picked for any and no rule holds on.
  if (pb?.positions) {
    const inForce = restrictedKeysInForce(pb);
    const pickedFor = (id: string, key: string) => canPlayPosition(pb, id, key, inForce);
    const held = (id: string) => slack(id) <= 0 || vested.has(id) || keepOn(id);
    inForce.forEach((key) => {
      if (onField.some((id) => pickedFor(id, key))) return;
      const sub = bench.find((id) => pickedFor(id, key));
      if (!sub) return;
      const out = [...onField].reverse().find((id) => !held(id) && !Array.from(inForce).some((k) => pickedFor(id, k)));
      if (!out) return;
      onField[onField.indexOf(out)] = sub;
      bench[bench.indexOf(sub)] = out;
    });
  }

  // Lines: by the kids' roles; a tie to the line the kid has played less.
  const fwdCount = Math.min(onField.length, rugbyForwards(ageGroup, input.onFieldSize));
  const lean = (pid: string) => (input.lineMs?.[pid]?.forwards ?? 0) - (input.lineMs?.[pid]?.backs ?? 0);
  const starters = [...onField].sort((a, b) => lean(a) - lean(b) || (at.get(a) ?? 0) - (at.get(b) ?? 0));
  const { forwards, backs } = pb
    ? assignLeagueLines(starters, fwdCount, onField.length - fwdCount, pb)
    : { forwards: starters.slice(0, fwdCount), backs: starters.slice(fwdCount) };
  const placed = new Set([...forwards, ...backs]);
  return { forwards, backs, bench: [...healthy.filter((id) => !placed.has(id)), ...sidelinedInGame] };
}

export interface LeagueBreakRotationInput {
  ageGroup: AgeGroupConfig;
  /** The lineup at the end of the period just played. */
  previousLineup: Lineup;
  injured: ReadonlySet<string>;
  loaned: ReadonlySet<string>;
  onFieldSize: number;
  leaguePlaybook?: LeaguePlaybookInput;
  /** Game time so far, ms. */
  msByPlayer: Readonly<Record<string, number>>;
  /** Time so far in each line, ms. */
  lineMs?: Readonly<Record<string, { forwards: number; backs: number }>>;
}

/**
 * Rotate: forwards and backs swap lines, the split kept, the least-played
 * on (rotateGroups). A kid How we play never plays in a line isn't sent
 * there, and kids picked for a restricted spot in force (union's front
 * row) stay forwards (round 2 usability, 24 Oct 2026: Rotate sent the
 * whole front row to the wings and dealt LHP1 to an unpicked late
 * arrival). If least-played-on would sit everyone picked for a spot, the
 * one who's played least comes on for the last forward in who isn't
 * picked for any.
 */
export function leagueBreakRotation(input: LeagueBreakRotationInput): Lineup {
  const { previousLineup, ageGroup, leaguePlaybook: pb } = input;
  const sidelined = new Set([...Array.from(input.injured), ...Array.from(input.loaned)]);
  const inGame = [...previousLineup.forwards, ...previousLineup.backs, ...previousLineup.bench];
  const healthy = inGame.filter((id) => !sidelined.has(id));
  const sidelinedInGame = inGame.filter((id) => sidelined.has(id));
  const onField = Math.min(input.onFieldSize, healthy.length);
  const fwd = rugbyForwards(ageGroup, input.onFieldSize);
  const inForce = restrictedKeysInForce(pb);
  const pickedFor = (pid: string, key: string) => canPlayPosition(pb, pid, key, inForce);
  const frontRow = (pid: string) => Array.from(inForce).some((key) => pickedFor(pid, key));
  const out = rotateGroups({
    players: healthy,
    cycle: ["forwards", "backs"],
    caps: { forwards: Math.min(fwd, onField), backs: Math.max(0, onField - fwd) },
    timeIn: (pid, g) => input.lineMs?.[pid]?.[g as "forwards" | "backs"] ?? 0,
    total: (pid) => input.msByPlayer[pid] ?? 0,
    lastGroup: Object.fromEntries(
      healthy.map((pid) => [
        pid,
        previousLineup.forwards.includes(pid) ? "forwards" : previousLineup.backs.includes(pid) ? "backs" : undefined,
      ]),
    ),
    sidelinedIds: sidelinedInGame,
    plays: (pid, line) => !pb?.roles[pid]?.never.includes(line) && !(line === "backs" && frontRow(pid)),
  });
  const forwards = [...(out.groups.forwards ?? [])];
  const backs = [...(out.groups.backs ?? [])];
  const bench = [...out.bench];
  inForce.forEach((key) => {
    if (forwards.some((id) => pickedFor(id, key))) return;
    const sub = bench
      .filter((id) => !sidelined.has(id) && pickedFor(id, key))
      .sort((a, b) => (input.msByPlayer[a] ?? 0) - (input.msByPlayer[b] ?? 0))[0];
    const off = [...forwards].reverse().find((id) => !frontRow(id));
    if (!sub || !off) return;
    forwards[forwards.indexOf(off)] = sub;
    bench[bench.indexOf(sub)] = off;
  });
  return { forwards, backs, bench };
}
