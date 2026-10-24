// ─── Rugby (league and union): the break's rule check ────────
// What the period break screen shows as broken rules and warnings for a
// rugby lineup. Each rugby sport states its own rules (the age group's
// knobs, the team's How we play rules); this only reads them:
//
//   - The lineup fits (validateRugbyLineup: too many on, a kid twice).
//   - The game-time floor and the team's rules (the shared check, lines
//     = forwards and backs).
//   - League's unbroken-period law (Law 6), where the age group has it:
//     a kid who can no longer get their unbroken periods is a broken
//     rule.
//   - A kid on the bench who now needs every period left, for Law 6 or
//     the floor, is a warning: one more sit and they can't (round 2
//     usability, 24 Oct 2026: U9 Tyler was benched at Q3 with no word,
//     then again at Q4).
//   - Named positions with restricted spots (union's front row): a kid
//     dealt one they aren't picked for, while a kid who is sits out or
//     plays elsewhere, is a broken rule; with nobody picked to hand, a
//     warning.

import { checkRules, type RuleCheckItem } from "@/lib/playbook/ruleCheck";
import type { RuleInstance } from "@/lib/playbook/rules";
import { leaguePeriodsOwed } from "@/lib/sports/rugby/breakSuggestion";
import { validateRugbyLineup } from "@/lib/sports/rugby/lineup";
import {
  assignLeaguePositions,
  canPlayPosition,
  restrictedKeysInForce,
  restrictedMisfits,
  type LeaguePlaybookInput,
} from "@/lib/sports/rugby_league/engine";
import type { AgeGroupConfig } from "@/lib/sports/types";

const LINE_LABEL: Record<string, string> = { forwards: "Forwards", backs: "Backs" };

export interface RugbyBreakCheckInput {
  lineup: { forwards: string[]; backs: string[]; bench: string[] };
  ageGroup: AgeGroupConfig;
  names: Record<string, string>;
  /** ms each kid has played this game, per line. */
  playedThisGame: Record<string, Record<string, number>>;
  /** Kids who sat out the whole of the last period. */
  benchedLastPeriod: string[];
  /** The period about to start (1-based). */
  period: number;
  periodMs: number;
  periodWord: string;
  rules?: RuleInstance[];
  minGameTimePct?: number;
  homeLine?: Record<string, string | null>;
  /** Law 6: completed unbroken periods per kid, and how many are needed. */
  unbroken?: { required: number; done: Record<string, number> };
  /** Named positions: the lineup's positions are dealt from these, as Start records them. */
  positions?: LeaguePlaybookInput;
  /** Named positions: the slots kids keep (Repeat), as Start records them. */
  held?: Record<string, string>;
  /** ms each kid couldn't play so far (late, hurt, lent): their floor is over the rest. */
  awayMs?: Readonly<Record<string, number>>;
}

const joinNames = (names: string[]) =>
  names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

export function rugbyBreakCheck(c: RugbyBreakCheckInput): RuleCheckItem[] {
  const name = (pid: string) => c.names[pid] ?? "A player";
  const items: RuleCheckItem[] = [];

  validateRugbyLineup(c.lineup, c.ageGroup).issues.forEach((issue, i) => {
    items.push(
      issue.kind === "error"
        ? { id: `lineup-${i}`, status: "fail", text: issue.message, rule: `${c.ageGroup.label}: one place each, no more than the field holds` }
        : { id: `lineup-${i}`, status: "warn", text: issue.message },
    );
  });

  const onField: Record<string, string> = {};
  for (const pid of c.lineup.forwards) onField[pid] = "forwards";
  for (const pid of c.lineup.backs) onField[pid] = "backs";
  const remainingAfter = c.ageGroup.periodCount - c.period;
  const floorPct = c.minGameTimePct ?? 50;
  const playedMs = (pid: string) => Object.values(c.playedThisGame[pid] ?? {}).reduce((a, b) => a + b, 0);
  // A kid on the bench who'd keep a rule by playing the next period "must
  // play" it; "can't" is for a kid who can't either way (round 3 edge
  // cases, 24 Oct 2026: a kid back from loan read "can't reach 50%" and
  // "can't get 1 unbroken half", and Fix fixed both).
  const nextPeriod = `the next ${c.periodWord}`;
  const mustOrCant = (
    item: RuleCheckItem,
    couldIfOn: (pid: string) => boolean,
    must: (who: string) => string,
    cant: (who: string) => string,
  ): RuleCheckItem[] => {
    const ids = item.playerIds ?? [];
    const could = ids.filter((pid) => !onField[pid] && couldIfOn(pid));
    const not = ids.filter((pid) => !could.includes(pid));
    const who = (list: string[]) => joinNames(list.map(name));
    return [
      ...(could.length > 0 ? [{ ...item, text: must(who(could)), playerIds: could }] : []),
      ...(not.length > 0 ? [{ ...item, id: could.length > 0 ? `${item.id}-out` : item.id, text: cant(who(not)), playerIds: not }] : []),
    ];
  };
  const gameMs = c.ageGroup.periodCount * c.periodMs;
  const reachesIfOn = (pid: string) =>
    playedMs(pid) + (remainingAfter + 1) * c.periodMs >= (floorPct / 100) * (gameMs - (c.awayMs?.[pid] ?? 0));
  const ruleItems = checkRules({
    onField,
    bench: c.lineup.bench,
    lines: ["forwards", "backs"],
    lineLabel: (k) => LINE_LABEL[k] ?? k,
    name,
    playedThisGame: c.playedThisGame,
    benchedLastPeriod: c.benchedLastPeriod,
    period: c.period,
    periodCount: c.ageGroup.periodCount,
    periodMs: c.periodMs,
    periodWord: c.periodWord,
    lineWord: "line",
    minGameTimePct: floorPct,
    rules: c.rules ?? [],
    homeLine: c.homeLine,
    awayMs: c.awayMs,
  });
  for (const item of ruleItems) {
    if (item.id !== "min-game-time" || item.status !== "fail") items.push(item);
    else
      items.push(
        ...mustOrCant(
          item,
          reachesIfOn,
          (who) => `${who} must play ${nextPeriod} to reach ${floorPct}%`,
          (who) => `${who} can't reach ${floorPct}% now`,
        ),
      );
  }

  if (c.unbroken && c.unbroken.required > 0) {
    const n = c.unbroken.required;
    const done = (pid: string) => c.unbroken!.done[pid] ?? 0;
    const squad = [...Object.keys(onField), ...c.lineup.bench];
    const short = squad.filter((pid) => done(pid) < n && done(pid) + (onField[pid] ? 1 : 0) + remainingAfter < n);
    if (short.length > 0) {
      const units = `${n} unbroken ${c.periodWord}${n === 1 ? "" : "s"}`;
      items.push(
        ...mustOrCant(
          { id: "unbroken-periods", status: "fail", text: "", rule: `Everyone plays ${units} (Law 6)`, playerIds: short },
          (pid) => done(pid) + 1 + remainingAfter >= n,
          (who) => `${who} must play ${nextPeriod} for ${units}`,
          (who) => `${who} can't get ${units} now`,
        ),
      );
    }
  }
  if (remainingAfter >= 1 && c.lineup.bench.length > 0) {
    const owed = leaguePeriodsOwed({
      ids: c.lineup.bench,
      left: remainingAfter,
      periodCount: c.ageGroup.periodCount,
      periodMs: c.periodMs,
      msByPlayer: Object.fromEntries(c.lineup.bench.map((pid) => [pid, playedMs(pid)])),
      minGameTimePct: floorPct,
      unbroken: c.unbroken,
      awayMs: c.awayMs,
    });
    const tight = c.lineup.bench.filter((pid) => owed[pid] > 0 && owed[pid] === remainingAfter);
    if (tight.length > 0) {
      const rest = remainingAfter === 1 ? c.periodWord : `${remainingAfter} ${c.periodWord}s`;
      items.push({
        id: "must-play-out",
        status: "warn",
        text: `${joinNames(tight.map(name))} must play all of the last ${rest}`,
        playerIds: tight,
      });
    }
  }
  if (c.positions) {
    const slots = assignLeaguePositions(c.lineup, c.positions, c.held);
    const inForce = restrictedKeysInForce(c.positions);
    const squad = [...c.lineup.forwards, ...c.lineup.backs, ...c.lineup.bench];
    for (const m of restrictedMisfits(slots, c.positions)) {
      // Someone picked for it who isn't holding another such spot.
      const pickedFree = squad.some(
        (pid) => pid !== m.playerId && canPlayPosition(c.positions, pid, m.key, inForce) && !inForce.has(slots[pid] ?? ""),
      );
      items.push({
        id: `front-row-${m.key}`,
        status: pickedFree ? "fail" : "warn",
        text: pickedFree
          ? `${name(m.playerId)} is at ${m.label} but isn't picked to play there`
          : `Nobody picked for ${m.label} can play it: ${name(m.playerId)} is there`,
        rule: pickedFree ? "Front-row spots go to kids picked for them" : undefined,
        playerIds: [m.playerId],
      });
    }
  }
  return items;
}
