// ─── Touch and Oztag: the break's rule check ─────────────────
// What the period break screen shows as broken rules for a touch or
// Oztag lineup: the lineup's own rules (the lane shape, nobody twice, a
// mixed team's rule: touch/ruleCheck), then the shared 50% game-time
// floor over the lanes, or the one Field under Minutes only. Kids who
// can't play (injured, lent) aren't held to them. Subs roll on at any
// time, so a kid who starts the half on the bench can still play all of
// it, and a late arrival is held to the time they could play (lib/live/
// break/floor; round 2 usability, 24 Oct 2026: Suggested benched two
// kids on 9:08 of 30 and then said they "can't reach 50% now").

import { benchReachMs } from "@/lib/live/break/floor";
import { checkRules, type RuleCheckItem } from "@/lib/playbook/ruleCheck";
import { benchOutInTouchLineup } from "@/lib/sports/touch/live";
import type { TouchLineup } from "@/lib/sports/touch/lineup";
import type { TouchGameState } from "@/lib/sports/touch/replay";
import { touchLineupRuleItems } from "@/lib/sports/touch/ruleCheck";
import type { TouchMixed } from "@/lib/sports/touch/suggest";
import { TOUCH_LANES, type TouchAgeGroupConfig } from "@/lib/sports/touch/types";

const GROUPS = ["middle", "link", "wing", "field"] as const;
const LINE_LABEL: Record<string, string> = { middle: "Middles", link: "Links", wing: "Wings", field: "Field" };

export interface TouchBreakCheckInput {
  /** The staged lineup for the next half. */
  lineup: TouchLineup;
  /** The game at the break. */
  state: TouchGameState;
  ageGroup: TouchAgeGroupConfig;
  /** The side's size: the game's, or what a mixed team's rule allows. */
  size: number;
  mixed?: TouchMixed;
  /** Kids who can't play now. */
  sidelined: ReadonlySet<string>;
  /** Minutes only: one Field, no lanes. */
  field: boolean;
  /** The half about to start (1-based). */
  period: number;
  periodMs: number;
  names: Record<string, string>;
  /** ms each kid couldn't play so far (awayMsSoFar). */
  awayMs?: Readonly<Record<string, number>>;
}

export function touchBreakCheck(c: TouchBreakCheckInput): RuleCheckItem[] {
  const benched = benchOutInTouchLineup(c.lineup, c.sidelined);
  const lu = { ...benched, bench: benched.bench.filter((id) => !c.sidelined.has(id)) };
  const items: RuleCheckItem[] = touchLineupRuleItems({ lineup: lu, ageGroup: c.ageGroup, size: c.size, mixed: c.mixed });
  const onField: Record<string, string> = {};
  for (const g of GROUPS) for (const pid of lu.lines[g]) onField[pid] = g;
  const playedThisGame: Record<string, Record<string, number>> = {};
  for (const pid of [...Object.keys(onField), ...lu.bench]) {
    playedThisGame[pid] = Object.fromEntries(
      Object.entries(c.state.ms[pid] ?? {}).filter(([, v]) => typeof v === "number"),
    ) as Record<string, number>;
  }
  const previous = c.state.lineup;
  items.push(
    ...checkRules({
      onField,
      bench: lu.bench,
      lines: c.field ? ["field"] : [...TOUCH_LANES],
      lineLabel: (k) => LINE_LABEL[k] ?? k,
      name: (pid) => c.names[pid] ?? "A player",
      playedThisGame,
      benchedLastPeriod: previous ? previous.bench : [],
      period: c.period,
      periodCount: c.ageGroup.periodCount,
      periodMs: c.periodMs,
      benchReachMs: benchReachMs(c.periodMs, 0),
      awayMs: c.awayMs,
      periodWord: "half",
      lineWord: "lane",
      minGameTimePct: 50,
      rules: [],
    }),
  );
  return items;
}
