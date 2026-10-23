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
//   - Named positions with restricted spots (union's front row): a kid
//     dealt one they aren't picked for, while a kid who is sits out or
//     plays elsewhere, is a broken rule; with nobody picked to hand, a
//     warning.

import { checkRules, type RuleCheckItem } from "@/lib/playbook/ruleCheck";
import type { RuleInstance } from "@/lib/playbook/rules";
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
  items.push(
    ...checkRules({
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
      minGameTimePct: c.minGameTimePct ?? 50,
      rules: c.rules ?? [],
      homeLine: c.homeLine,
    }),
  );

  if (c.unbroken && c.unbroken.required > 0) {
    const remainingAfter = c.ageGroup.periodCount - c.period;
    const squad = [...Object.keys(onField), ...c.lineup.bench];
    const short = squad.filter((pid) => {
      const done = c.unbroken!.done[pid] ?? 0;
      return done < c.unbroken!.required && done + (onField[pid] ? 1 : 0) + remainingAfter < c.unbroken!.required;
    });
    if (short.length > 0) {
      const n = c.unbroken.required;
      items.push({
        id: "unbroken-periods",
        status: "fail",
        text: `${joinNames(short.map(name))} can't get ${n} unbroken ${c.periodWord}${n === 1 ? "" : "s"} now`,
        rule: `Everyone plays ${n} unbroken ${c.periodWord}${n === 1 ? "" : "s"} (Law 6)`,
        playerIds: short,
      });
    }
  }
  if (c.positions) {
    const slots = assignLeaguePositions(c.lineup, c.positions);
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
