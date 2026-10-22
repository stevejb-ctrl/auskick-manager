// ─── Football (soccer): the half-time rule check ─────────────
// What the period break screen shows as broken rules and warnings for a
// half-time plan. Soccer states its own rules (sports are independent):
//
//   - The lineup fits the age group: a keeper where the age plays with
//     one, nobody in two places, not too many on (validateSoccerLineup's
//     errors; its warnings are warnings).
//   - The game-time floor (the shared check, FA's equal-time 50 %).
//   - "Everyone has a turn" (U8–U11): last half's keeper plays out in the
//     field. The suggester already does it; a coach's edit can undo it.
//   - A kid marked "not in goal" isn't put there.

import { checkRules, type RuleCheckItem } from "@/lib/playbook/ruleCheck";
import { soccerUnitOf, validateSoccerLineup, type SoccerLineup } from "@/lib/sports/soccer/lineup";
import type { SoccerGameState } from "@/lib/sports/soccer/replay";
import type { SoccerKeeperPrefs } from "@/lib/sports/soccer/keeper";
import type { SoccerAgeGroupConfig, SoccerKeeperStrategy } from "@/lib/sports/soccer/types";

const LINE_LABEL: Record<string, string> = { att: "Attack", mid: "Midfield", def: "Defence", gk: "Keeper", field: "Field" };

export interface SoccerBreakCheckInput {
  lineup: SoccerLineup;
  /** The game at the break (last half's lineup, keeper, time per line). */
  state: SoccerGameState;
  ageGroup: SoccerAgeGroupConfig;
  onFieldSize: number;
  /** The half about to start (1-based). */
  period: number;
  periodMs: number;
  names: Record<string, string>;
  keeperStrategy: SoccerKeeperStrategy;
  prefs?: SoccerKeeperPrefs;
  minGameTimePct?: number;
}

export function soccerBreakCheck(c: SoccerBreakCheckInput): RuleCheckItem[] {
  const name = (pid: string) => c.names[pid] ?? "A player";
  const items: RuleCheckItem[] = [];

  const valid = validateSoccerLineup(c.lineup, c.ageGroup, c.onFieldSize);
  valid.issues.forEach((issue, i) => {
    if (issue.kind === "error") {
      items.push({
        id: `lineup-${i}`,
        status: "fail",
        text: issue.message,
        rule: `${c.ageGroup.label} plays ${c.ageGroup.keeper === "none" ? "without a keeper" : "with a keeper"}, one place each`,
      });
    } else {
      items.push({ id: `lineup-${i}`, status: "warn", text: issue.message });
    }
  });

  const onField: Record<string, string> = {};
  for (const pid of [c.lineup.keeper, ...Object.values(c.lineup.lines).flat()]) {
    if (!pid) continue;
    const unit = soccerUnitOf(c.lineup, pid);
    if (unit) onField[pid] = unit;
  }
  const playedThisGame: Record<string, Record<string, number>> = {};
  for (const pid of [...Object.keys(onField), ...c.lineup.bench]) {
    const ms = c.state.ms[pid] ?? {};
    playedThisGame[pid] = Object.fromEntries(Object.entries(ms).filter(([, v]) => typeof v === "number")) as Record<string, number>;
  }
  const lastLineup = c.state.lineup;
  items.push(
    ...checkRules({
      onField,
      bench: c.lineup.bench,
      lines: ["att", "mid", "def"],
      lineLabel: (k) => LINE_LABEL[k] ?? k,
      name,
      playedThisGame,
      benchedLastPeriod: lastLineup ? lastLineup.bench : [],
      period: c.period,
      periodCount: c.ageGroup.periodCount,
      periodMs: c.periodMs,
      periodWord: "half",
      lineWord: "line",
      minGameTimePct: c.minGameTimePct ?? 50,
      rules: [],
    }),
  );

  const keeper = c.lineup.keeper;
  if (keeper) {
    const lastKeeper = c.state.keeperAtEnd[c.period - 1] ?? lastLineup?.keeper ?? null;
    if (c.keeperStrategy === "turns" && keeper === lastKeeper) {
      items.push({
        id: "keeper-turns",
        status: "fail",
        text: `${name(keeper)} kept goal last half`,
        rule: "Everyone has a turn: one half in goal each",
        playerIds: [keeper],
      });
    }
    if (c.prefs?.notInGoal?.includes(keeper)) {
      items.push({
        id: "not-in-goal",
        status: "fail",
        text: `${name(keeper)} would rather not go in goal`,
        rule: "Kids marked “not in goal” stay out of goal",
        playerIds: [keeper],
      });
    }
  }
  return items;
}
