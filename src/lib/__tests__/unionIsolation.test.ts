// Sports are independent (14 Oct 2026; rugby union plan, phase 6). A
// union team's How we play, rule packs, strategies, positions, scores
// and copy come from union's own config and contain nothing from
// league or AFL, though union shares the rugby engine's code.

import { describe, expect, it } from "vitest";
import { effectivePolicy, getSportPlaybook } from "@/lib/playbook";
import { rulePacksFor } from "@/lib/playbook/rulePacks";
import { aflSport, netballSport, rugbyLeagueSport, rugbyUnionSport } from "@/lib/sports";
import { unionCatalogue } from "@/lib/sports/rugby_union/playbook";
import { rugbyScoreWords } from "@/lib/sports/rugby_league/fairness";
import { scoreFromEvents, scorersFromEvents } from "@/lib/results";
import { buildLeagueWalkthroughSteps } from "@/components/league/leagueWalkthroughSteps";
import type { GameEvent, GameEventType } from "@/lib/types";

const LEAGUE_WORDS = /\bNRL\b|Mod League|Mini Footy|rugby league|\bleague\b|First Receiver|Dummy Half|\bFR\b|\bDH\b|field goal|second row|5\/8|\bFG\b|§/;
const AFL_WORDS = /\bAFL\b|Auskick|behind|goal kicker|zone|ruck|wing back/i;

// What a coach reads: every string, less ids, keys and colour tokens
// (config, not copy).
function words(value: unknown): string {
  const out: string[] = [];
  const walk = (v: unknown, key = ""): void => {
    if (typeof v === "string") {
      if (!["id", "key", "colorToken"].includes(key)) out.push(v);
    } else if (Array.isArray(v)) {
      for (const x of v) walk(x, key);
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) walk(x, k);
    }
  };
  walk(value);
  return out.join("\n");
}

let ts = 0;
const ev = (type: GameEventType, playerId: string | null = null, metadata: Record<string, unknown> = {}): GameEvent => ({
  id: `e${++ts}`,
  game_id: "g1",
  type,
  player_id: playerId,
  metadata,
  created_by: null,
  created_at: new Date(2026, 9, 18, 9, 0, ts).toISOString(),
});

describe("a union team reads only union", () => {
  it("How we play: union's strategies, positions and laws", () => {
    const playbook = getSportPlaybook("rugby_union");
    for (const ag of rugbyUnionSport.ageGroups) {
      const policy = effectivePolicy("rugby_union", ag.id);
      const text = words([
        playbook.strategies(policy),
        playbook.positionModel(policy, ag.defaultOnFieldSize),
        playbook.lawRules(policy, playbook.agePolicy(ag.id)),
        playbook.agePolicy(ag.id),
      ]);
      expect(text, ag.id).not.toMatch(LEAGUE_WORDS);
      expect(text, ag.id).not.toMatch(AFL_WORDS);
    }
  });

  it("no rule pack from another sport", () => {
    for (const ag of rugbyUnionSport.ageGroups) {
      expect(rulePacksFor("rugby_union", ag.id).filter((p) => p.sport !== "rugby_union"), ag.id).toEqual([]);
    }
  });

  it("union's positions, not league's", () => {
    expect(words(unionCatalogue(15))).not.toMatch(LEAGUE_WORDS);
    for (const league of ["PR", "2R", "CE", "WG", "5/8"]) {
      expect(unionCatalogue(15).map((p) => p.label)).not.toContain(league);
    }
  });

  it("its age notes, score names and walkthrough", () => {
    for (const ag of rugbyUnionSport.ageGroups) {
      expect(`${ag.label} ${ag.notes}`, ag.id).not.toMatch(LEAGUE_WORDS);
      const steps = buildLeagueWalkthroughSteps({
        sport: "rugby_union",
        trackScoring: true,
        periodLabel: "half",
        vests: { fr: false, dh: false },
        kickingAllowed: ag.kickingAllowed === true,
        goalsFromPlay: ag.goalsFromPlay === true,
        kickRotations: ag.kickRotations === true,
        unbrokenPeriods: ag.unbrokenPeriods === true,
        trackZoneTime: true,
      });
      const text = words(steps);
      expect(text, ag.id).not.toMatch(LEAGUE_WORDS);
      // League's laws: goal-kick turns and vests.
      expect(text, ag.id).not.toMatch(/goal-kick rotation|kicking rotation|vest/i);
    }
    expect(words(rugbyScoreWords("rugby_union"))).not.toMatch(LEAGUE_WORDS);
  });

  it("scores and scorers in union's points", () => {
    const events = [
      ev("try", "p1"),
      ev("conversion_attempt", "p2", { made: true }),
      ev("penalty_goal", "p2"),
      ev("field_goal", "p3"),
      ev("opponent_try"),
    ];
    expect(scoreFromEvents("rugby_union", events)).toEqual({ us: 5 + 2 + 3 + 3, them: 5 });
    // Most points first; level on points, in the order they scored.
    expect(scorersFromEvents("rugby_union", events)).toEqual([
      { playerId: "p1", detail: "1T", points: 5, showPoints: true },
      { playerId: "p2", detail: "1C · 1PG", points: 5, showPoints: true },
      { playerId: "p3", detail: "1DG", points: 3, showPoints: true },
    ]);
  });
});

// And the other way: union's laws, positions and goal names never reach
// another sport through the code it shares (the rugby How we play, the
// rugby walkthrough, score words, scorer chips). League shares Hooker,
// Lock, Halfback, Five-eighth and Fullback, so only union's own words.
const UNION_WORDS = /Rugby Australia|rugby union|\bunion\b|Loosehead|Tighthead|flanker|Number 8|Inside centre|Outside centre|Drop goal|\bDG\b/i;

describe("no other sport reads union", () => {
  it("(the check catches union's own words)", () => {
    expect(words(unionCatalogue(15))).toMatch(UNION_WORDS);
    expect(words(rugbyScoreWords("rugby_union"))).toMatch(UNION_WORDS);
    const policy = effectivePolicy("rugby_union", "U12");
    expect(words(getSportPlaybook("rugby_union").positionModel(policy, 15))).toMatch(UNION_WORDS);
  });

  for (const sport of [aflSport, netballSport, rugbyLeagueSport]) {
    it(`${sport.id}: How we play, rule packs and age notes`, () => {
      const playbook = getSportPlaybook(sport.id);
      for (const ag of sport.ageGroups) {
        const policy = effectivePolicy(sport.id, ag.id);
        const text = words([
          playbook.strategies(policy),
          playbook.positionModel(policy, ag.defaultOnFieldSize),
          playbook.lawRules(policy, playbook.agePolicy(ag.id)),
          playbook.agePolicy(ag.id),
          rulePacksFor(sport.id, ag.id),
          `${ag.label} ${ag.notes ?? ""}`,
        ]);
        expect(text, ag.id).not.toMatch(UNION_WORDS);
      }
    });
  }

  it("rugby_league: its walkthrough, score words and scorer chips", () => {
    for (const ag of rugbyLeagueSport.ageGroups) {
      const steps = buildLeagueWalkthroughSteps({
        sport: "rugby_league",
        trackScoring: true,
        periodLabel: ag.periodCount === 2 ? "half" : "quarter",
        vests: { fr: ag.vestRequirements?.fr === true, dh: ag.vestRequirements?.dh === true },
        kickingAllowed: ag.kickingAllowed === true,
        goalsFromPlay: ag.goalsFromPlay === true,
        kickRotations: ag.kickRotations === true,
        unbrokenPeriods: ag.unbrokenPeriods === true,
        trackZoneTime: true,
      });
      expect(words(steps), ag.id).not.toMatch(UNION_WORDS);
    }
    expect(words(rugbyScoreWords("rugby_league"))).not.toMatch(UNION_WORDS);
    expect(
      scorersFromEvents("rugby_league", [ev("try", "p1"), ev("penalty_goal", "p2"), ev("field_goal", "p2")]),
    ).toEqual([
      { playerId: "p1", detail: "1T", points: 4, showPoints: true },
      { playerId: "p2", detail: "1PG · 1FG", points: 3, showPoints: true },
    ]);
  });
});
