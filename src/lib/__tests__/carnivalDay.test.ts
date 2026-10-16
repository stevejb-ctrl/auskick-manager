// Netball Carnival day (UX plan §7.4): "every player plays every third
// across the day's games". The day is the team's other games started
// within 12 hours of this one.

import { describe, expect, it } from "vitest";
import { resolveTeamPlaybook } from "@/lib/playbook/team";
import { newRule, ruleCatalogue, ruleSentence, ruleWords } from "@/lib/playbook/rules";
import { rulePacksFor } from "@/lib/playbook/rulePacks";
import { ruleScore, LINE_RULE_WEIGHT } from "@/lib/playbook/ruleScore";
import { checkRules, type RuleCheckInput } from "@/lib/playbook/ruleCheck";
import { linesEarlierToday } from "@/lib/playbook/dayLines";
import { repairDayThirds } from "@/lib/sports/netball/fairness";
import type { GameEvent, GameEventType } from "@/lib/types";

let ts = 0;
function ev(gameId: string, at: string, type: GameEventType, metadata: Record<string, unknown> = {}): GameEvent {
  ts++;
  return { id: `e${ts}`, game_id: gameId, type, player_id: null, metadata, created_by: null, created_at: at };
}
const keys = ["gs", "ga", "wa", "c", "wd", "gd", "gk"];
const lineup = (order: string[]) => ({ positions: Object.fromEntries(keys.map((k, i) => [k, [order[i]]])), bench: [] });
/** One quarter of netball starting at `at`, kid "k" at bib `bib`. */
function quarter(gameId: string, at: string, bib: string): GameEvent[] {
  const order = ["a", "b", "c", "d", "e", "f", "g"];
  order[keys.indexOf(bib)] = "k";
  return [
    ev(gameId, at, "lineup_set", { lineup: lineup(order) }),
    ev(gameId, at, "quarter_start", { quarter: 1 }),
    ev(gameId, at, "quarter_end", { quarter: 1, elapsed_ms: 600_000 }),
  ];
}

describe("Carnival day", () => {
  it("is a netball rule, and a netball pack", () => {
    const nb = resolveTeamPlaybook({
      sport: "netball",
      ageGroup: "11u",
      onFieldSize: 7,
      row: { strategy: null, policy_overrides: {}, season_balance: null, season_balance_since: null },
    });
    expect(ruleCatalogue(nb).map((d) => d.kind)).toContain("every-line-per-day");
    expect(ruleSentence(newRule("every-line-per-day"), ruleWords("netball", "quarter", false), () => "")).toBe(
      "Every player plays each third across the day's games",
    );
    expect(rulePacksFor("netball", "11u").map((p) => p.id)).toContain("netball-carnival-day");
  });

  it("the day is the games started within 12 hours", () => {
    const events = [
      ...quarter("morning", "2026-03-07T22:30:00.000Z", "c"),
      ...quarter("lastWeek", "2026-02-28T23:00:00.000Z", "gs"),
    ];
    // Only this morning counts: the kid played centre, not last week's GS.
    expect(linesEarlierToday("netball", events, "third", "2026-03-08T01:00:00.000Z", 600).k).toEqual(["centre-third"]);
  });

  it("pulls a kid to a third they haven't played today", () => {
    const rule = { ...newRule("every-line-per-day"), strength: "prefer" as const };
    const thisGame = new Set<string>();
    const today = new Set(["centre-third", "defence-third"]);
    const score = (third: string) => ruleScore([rule], "k", third, thisGame, 3, undefined, null, 1, today);
    expect(score("attack-third")).toBe(LINE_RULE_WEIGHT.prefer);
    expect(score("defence-third")).toBe(0);
  });

  it("repair swaps a kid into the third they still need today", () => {
    const third: Record<string, string> = { gs: "attack-third", c: "centre-third", gk: "defence-third" };
    const lineup = { positions: { gs: ["a"], c: ["k"], gk: ["b"] }, bench: [] };
    // k has played centre and defence today; a has played attack.
    repairDayThirds(lineup, { k: ["centre-third", "defence-third"], a: ["attack-third"] }, {}, (p) => third[p], () => true);
    expect(lineup.positions).toEqual({ gs: ["k"], c: ["a"], gk: ["b"] });
    // Never onto a bib the kid can't play.
    const stuck = { positions: { gs: ["a"], c: ["k"], gk: ["b"] }, bench: [] };
    repairDayThirds(stuck, { k: ["centre-third", "defence-third"], a: ["attack-third"] }, {}, (p) => third[p], (pid, bib) => !(pid === "k" && bib === "gs"));
    expect(stuck.positions.c).toEqual(["k"]);
  });

  it("the check warns only once this game can't make it up", () => {
    const base: RuleCheckInput = {
      onField: { k: "centre-third" },
      bench: [],
      lines: ["attack-third", "centre-third", "defence-third"],
      lineLabel: (k) => k,
      name: () => "Kai",
      playedThisGame: {},
      benchedLastPeriod: [],
      period: 1,
      periodCount: 4,
      periodMs: 600_000,
      periodWord: "quarter",
      lineWord: "third",
      minGameTimePct: 0,
      rules: [newRule("every-line-per-day")],
      playedEarlierToday: { k: ["defence-third"] },
    };
    const item = (input: RuleCheckInput) => checkRules(input).find((i) => i.id !== "min-game-time")!;
    expect(item(base)).toMatchObject({ status: "ok", text: "Kai still to play every third today" });
    expect(item({ ...base, period: 4 })).toMatchObject({ status: "warn" });
    expect(item({ ...base, playedEarlierToday: { k: ["defence-third", "attack-third"] } })).toMatchObject({
      status: "ok",
      text: "Everyone has played every third today",
    });
  });
});
