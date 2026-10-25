// ─── The soccer family: the break's rule check ───────────────
// What the period break screen shows as broken rules and warnings for a
// soccer, futsal or hockey break, in the sport's own words (its
// SoccerFamilyRules) and its age group's halves or quarters:
//
//   - The lineup fits the age group: a keeper where the age plays with
//     one, nobody in two places, not too many on (validateSoccerLineup's
//     errors; its warnings are warnings).
//   - The game-time floor (the shared check, FA's equal-time 50 %). A kid
//     who starts the half on the bench can still come on in it: rolling
//     subs any time, windows from the first one. Counting only the halves
//     after made Suggested fail its own floor ("can't reach 50% now") and
//     forced "Start anyway" (futsal audit, 23 Oct 2026).
//   - "Everyone has a turn" (U8–U11): last half's keeper plays out in the
//     field. The suggester already does it; a coach's edit can undo it.
//   - A kid marked "not in goal" isn't put there.
//   - A kid isn't placed in a line their "Plays as" leaves out (round 2
//     usability, 24 Oct 2026: futsal's Rotate put a wings-only kid at
//     Back, and nothing said so).

import { benchReachMs as reachFrom } from "@/lib/live/break/floor";
import { checkRules, type RuleCheckItem } from "@/lib/playbook/ruleCheck";
import { soccerUnitOf, validateSoccerLineup, type SoccerLineup } from "@/lib/sports/soccer/lineup";
import type { SoccerGameState } from "@/lib/sports/soccer/replay";
import type { SoccerKeeperPrefs } from "@/lib/sports/soccer/keeper";
import { soccerSubWindowsMs } from "@/lib/sports/soccer/suggest";
import type { SoccerAgeGroupConfig, SoccerFamilyRules, SoccerKeeperStrategy } from "@/lib/sports/soccer/types";

export interface SoccerBreakCheckInput {
  lineup: SoccerLineup;
  /** The game at the break (last half's lineup, keeper, time per line). */
  state: SoccerGameState;
  ageGroup: SoccerAgeGroupConfig;
  /** The sport's line words and line rules. */
  rules: Pick<SoccerFamilyRules, "lineLabels" | "minLines">;
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
  const periodWord = c.ageGroup.periodLabel ?? "half";

  const valid = validateSoccerLineup(c.lineup, c.ageGroup, c.onFieldSize, c.rules);
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
  const mode = c.ageGroup.subMode;
  const benchReachMs = reachFrom(c.periodMs, mode.kind === "windows" ? (soccerSubWindowsMs(mode, c.periodMs)[0] ?? null) : 0);
  items.push(
    ...checkRules({
      onField,
      bench: c.lineup.bench,
      lines: ["att", "mid", "def"],
      lineLabel: (k) => c.rules.lineLabels[k as keyof SoccerFamilyRules["lineLabels"]]?.label ?? k,
      name,
      playedThisGame,
      benchedLastPeriod: lastLineup ? lastLineup.bench : [],
      period: c.period,
      periodCount: c.ageGroup.periodCount,
      periodMs: c.periodMs,
      benchReachMs,
      periodWord,
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
        text: `${name(keeper)} kept goal last ${periodWord}`,
        rule: `Everyone has a turn: one ${periodWord} in goal each`,
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

  // "Plays as": a kid placed in an outfield line their role leaves out.
  for (const line of ["def", "mid", "att"] as const) {
    for (const pid of c.lineup.lines[line]) {
      const left = c.prefs?.notInLine?.[pid];
      if (!left?.includes(line)) continue;
      const plays = (["def", "mid", "att"] as const).filter((l) => !left.includes(l)).map((l) => c.rules.lineLabels[l].label);
      if (plays.length === 0) continue;
      items.push({
        id: `plays-as-${pid}`,
        status: "fail",
        text: `${name(pid)} plays ${plays.join(" or ")} only`,
        rule: "Kids play the lines their “Plays as” names",
        playerIds: [pid],
      });
    }
  }
  return items;
}
