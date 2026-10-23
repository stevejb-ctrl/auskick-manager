// ─── §6 is always the law where the grade plays it ───────────
// UX audit, 23 Oct 2026 (league P1): How we play shows "At least 1
// unbroken half each — NRL Junior League Laws §6" as a locked Must,
// but "Enforce unbroken periods" was a switch, off by default, so the
// live screen and the planner ignored it. The rule now follows the age
// group: on wherever the laws have it, with no switch. The live screen
// says who must stay on (UnbrokenPeriodWarning, which was never shown).

import { describe, expect, it } from "vitest";
import type { GameEvent, GameEventType } from "@/lib/types";
import { getAgeGroupConfig, periodLabels } from "@/lib/sports";
import { rugbyLeagueSport } from "@/lib/sports/rugby_league";
import { rugbyUnionSport } from "@/lib/sports/rugby_union";
import { unbrokenPeriodNeeds, unbrokenPeriodsRequired } from "@/lib/sports/rugby_league/fairness";
import { buildLeagueWalkthroughSteps } from "@/components/league/leagueWalkthroughSteps";

const MIN = 60_000;
let ts = 0;
function ev(type: GameEventType, metadata: Record<string, unknown> = {}): GameEvent {
  ts++;
  return {
    id: `e${ts}`,
    game_id: "g1",
    type,
    player_id: null,
    metadata,
    created_at: new Date(Date.UTC(2026, 9, 23, 9, 0, 0, ts)).toISOString(),
    created_by: null,
  } as GameEvent;
}

describe("unbrokenPeriodsRequired", () => {
  it("is the age group's §6 count in Mini Footy and Mod League, none past it", () => {
    const byAge = Object.fromEntries(rugbyLeagueSport.ageGroups.map((ag) => [ag.id, unbrokenPeriodsRequired(ag)]));
    expect(byAge).toMatchObject({ U6: 2, U7: 2, U8: 2, U9: 2, U10: 1, U11: 1, U12: 1, U13: 0, U17: 0 });
  });

  it("union has no unbroken-period law", () => {
    for (const ag of rugbyUnionSport.ageGroups) expect(unbrokenPeriodsRequired(ag), ag.id).toBe(0);
  });
});

describe("the walkthrough's §6 step", () => {
  const steps = (ageGroup: string) => {
    const ag = getAgeGroupConfig("rugby_league", ageGroup);
    return buildLeagueWalkthroughSteps({
      sport: "rugby_league",
      trackScoring: true,
      periodLabel: periodLabels("rugby_league", ag).label,
      vests: { fr: ag.vestRequirements?.fr ?? false, dh: ag.vestRequirements?.dh ?? false },
      kickingAllowed: ag.kickingAllowed === true,
      unbrokenPeriods: ag.unbrokenPeriods === true,
      trackZoneTime: false,
    });
  };

  it("is there wherever the grade plays §6, with no switch to turn it off", () => {
    const step = steps("U10").find((s) => s.title === "Unbroken-period rule");
    expect(step).toBeDefined();
    expect(step!.body).not.toMatch(/turn it off/i);
    expect(steps("U13").some((s) => s.title === "Unbroken-period rule")).toBe(false);
  });
});

describe("unbrokenPeriodNeeds — who the live screen names", () => {
  // U10, H2 five minutes in: T sat out H1 and started H2; B sat out H1
  // and still sits; F played the whole of H1 and plays on.
  const events = [
    ev("lineup_set", { lineup: { forwards: ["F"], backs: [], bench: ["T", "B"] } }),
    ev("quarter_start", { quarter: 1 }),
    ev("quarter_end", { quarter: 1, elapsed_ms: 20 * MIN }),
    ev("lineup_set", { lineup: { forwards: ["F", "T"], backs: [], bench: ["B"] } }),
    ev("quarter_start", { quarter: 2 }),
  ];

  it("in the last half: T must stay on; B can't get one now; F is done", () => {
    const needs = unbrokenPeriodNeeds(events, { required: 1, currentQuarter: 2, periodCount: 2, elapsedMs: 5 * MIN });
    expect(needs.mustStay).toEqual(["T"]);
    expect(needs.missed).toEqual(["B"]);
    expect(needs.mustStartNext).toEqual([]);
  });

  it("in H1: the bench must start H2; nobody on has to stay", () => {
    const h1 = events.slice(0, 2);
    const needs = unbrokenPeriodNeeds(h1, { required: 1, currentQuarter: 1, periodCount: 2, elapsedMs: 5 * MIN });
    expect(needs.mustStay).toEqual([]);
    expect(needs.mustStartNext.sort()).toEqual(["B", "T"]);
  });
});
