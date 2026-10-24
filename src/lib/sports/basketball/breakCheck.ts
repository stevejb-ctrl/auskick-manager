// ─── Basketball: the break's rule check ──────────────────────
// What the period break screen shows as broken rules for a basketball
// lineup. Basketball's engine acts on no catalogue rule yet, so the
// check is the shared 50% game-time floor, over guards and forwards or
// the one Court zone under Equal minutes. Kids who can't play (fouled
// out, injured, lent) aren't held to it.

import { checkRules, type RuleCheckItem } from "@/lib/playbook/ruleCheck";
import { benchOutInBasketballLineup } from "@/lib/sports/basketball/live";
import type { BasketballLineup } from "@/lib/sports/basketball/lineup";
import type { BasketballGameState } from "@/lib/sports/basketball/replay";

const GROUPS = ["forward", "guard", "court"] as const;
const LINE_LABEL: Record<string, string> = { guard: "Guards", forward: "Forwards", court: "Court" };

export interface BasketballBreakCheckInput {
  /** The staged lineup for the next period. */
  lineup: BasketballLineup;
  /** The game at the break. */
  state: BasketballGameState;
  /** Kids who can't play now. */
  sidelined: ReadonlySet<string>;
  /** Equal minutes: one Court zone, no positions. */
  court: boolean;
  /** The period about to start (1-based) and how many there are. */
  period: number;
  periodCount: number;
  periodMs: number;
  names: Record<string, string>;
}

export function basketballBreakCheck(c: BasketballBreakCheckInput): RuleCheckItem[] {
  const benched = benchOutInBasketballLineup(c.lineup, c.sidelined);
  const lu = { ...benched, bench: benched.bench.filter((id) => !c.sidelined.has(id)) };
  const onField: Record<string, string> = {};
  for (const g of GROUPS) for (const pid of lu.lines[g]) onField[pid] = g;
  const playedThisGame: Record<string, Record<string, number>> = {};
  for (const pid of [...Object.keys(onField), ...lu.bench]) {
    playedThisGame[pid] = Object.fromEntries(
      Object.entries(c.state.ms[pid] ?? {}).filter(([, v]) => typeof v === "number"),
    ) as Record<string, number>;
  }
  const previous = c.state.lineup;
  return checkRules({
    onField,
    bench: lu.bench,
    lines: c.court ? ["court"] : ["guard", "forward"],
    lineLabel: (k) => LINE_LABEL[k] ?? k,
    name: (pid) => c.names[pid] ?? "A player",
    playedThisGame,
    benchedLastPeriod: previous ? previous.bench : [],
    period: c.period,
    periodCount: c.periodCount,
    periodMs: c.periodMs,
    periodWord: c.periodCount === 4 ? "quarter" : "half",
    lineWord: "line",
    minGameTimePct: 50,
    rules: [],
  });
}
