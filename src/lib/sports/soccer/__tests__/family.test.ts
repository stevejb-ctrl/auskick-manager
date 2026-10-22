// The soccer family (.planning/FOUR-SPORTS-PLAN.md): Football (soccer),
// futsal and hockey share one engine, and each reads its own rules from
// its own config. These guard the clean-up's soccer-only assumptions:
// a futsal or hockey team must never get soccer's rules or words.

import { describe, expect, it } from "vitest";
import { periodLabels } from "@/lib/sports";
import {
  soccerFamilyAgeGroup,
  soccerFamilyAgeGroupForTeam,
  soccerFamilyRules,
  soccerFamilySport,
} from "@/lib/sports/soccer/family";
import { soccerFamilyPlaybook, soccerKeeperStrategy } from "@/lib/sports/soccer/playbook";
import { SOCCER_RULES } from "@/lib/sports/soccer";
import { FUTSAL_RULES } from "@/lib/sports/futsal";
import { HOCKEY_RULES } from "@/lib/sports/hockey";
import { gridUnits } from "@/lib/playbook/seasonGrid";
import { buildSoccerSummary } from "@/lib/sports/soccer/summary";
import { replaySoccerGame } from "@/lib/sports/soccer/replay";
import { periodBreakName } from "@/lib/live/periodBreakName";
import { newGameDefaults } from "@/lib/games/newGameDefaults";
import type { EffectivePolicy } from "@/lib/playbook/types";

const policy = (ageGroup: string) => ({ ageGroup }) as EffectivePolicy;

describe("soccerFamilyAgeGroup", () => {
  it("reads the sport's own age group, never soccer's", () => {
    // Regression: soccerAgeGroup(id) searched soccer's ages only, so a
    // futsal U10 got soccer's 9 a side with no score kept.
    const futsal = soccerFamilyAgeGroup("futsal", "U10");
    expect(futsal.defaultOnFieldSize).toBe(5);
    expect(futsal.periodSeconds).toBe(20 * 60);
    expect(futsal.tracksScoreDefault).toBe(true);
    const soccer = soccerFamilyAgeGroup("soccer", "U10");
    expect(soccer.defaultOnFieldSize).toBe(9);
    expect(soccer.tracksScoreDefault).toBe(false);
    expect(soccerFamilyAgeGroup("hockey", "U13").periodCount).toBe(4);
  });

  it("refuses an age the sport doesn't play, and a sport off the engine", () => {
    // Hockey starts at U7: soccer's U6 is not hockey's.
    expect(() => soccerFamilyAgeGroup("hockey", "U6")).toThrow(/Unknown Hockey age group "U6"/);
    expect(() => soccerFamilyAgeGroup("futsal", null)).toThrow(/Unknown Futsal age group/);
    expect(() => soccerFamilyAgeGroup("basketball", "U10")).toThrow(/Basketball isn't on the soccer family's engine/);
    expect(() => soccerFamilySport("touch")).toThrow(/isn't on the soccer family's engine/);
  });
});

describe("soccerFamilyAgeGroupForTeam", () => {
  it("plays hockey's quarters as halves for a team that chose them (VIC's 2 × 30)", () => {
    const halves = soccerFamilyAgeGroupForTeam("hockey", "U13", 2);
    expect(halves.periodCount).toBe(2);
    expect(halves.periodSeconds).toBe(30 * 60);
    expect(periodLabels("hockey", halves)).toEqual({ label: "half", plural: "halves" });
    expect(halves.keeper).toBe("keepers");
  });

  it("plays hockey's halves as quarters for a team that chose them", () => {
    const quarters = soccerFamilyAgeGroupForTeam("hockey", "U9", 4);
    expect(quarters.periodCount).toBe(4);
    expect(quarters.periodSeconds).toBe(10 * 60);
    expect(periodLabels("hockey", quarters)).toEqual({ label: "quarter", plural: "quarters" });
  });

  it("leaves the age group as it is with no choice, or the age's own", () => {
    const u13 = soccerFamilyAgeGroup("hockey", "U13");
    expect(soccerFamilyAgeGroupForTeam("hockey", "U13", null)).toBe(u13);
    expect(soccerFamilyAgeGroupForTeam("hockey", "U13", 4)).toBe(u13);
    expect(periodLabels("hockey", u13)).toEqual({ label: "quarter", plural: "quarters" });
  });

  it("sizes a new game's subs to the team's halves or quarters", () => {
    // 4 × 15: a change every 5 minutes; 2 × 30 (VIC): every 5 too.
    expect(newGameDefaults("hockey", "U13")).toEqual({ on_field_size: 11, sub_interval_seconds: 300 });
    expect(newGameDefaults("hockey", "U13", null, 2)).toEqual({ on_field_size: 11, sub_interval_seconds: 300 });
    // 2 × 20 halves: every 4 minutes; as 4 × 10 quarters, every 5.
    expect(newGameDefaults("hockey", "U9")).toEqual({ on_field_size: 7, sub_interval_seconds: 240 });
    expect(newGameDefaults("hockey", "U9", null, 4)).toEqual({ on_field_size: 7, sub_interval_seconds: 300 });
    // Soccer's don't move.
    expect(newGameDefaults("soccer", "U10", null, 4)).toEqual(newGameDefaults("soccer", "U10"));
  });

  it("never splits soccer's or futsal's halves: they don't choose", () => {
    expect(soccerFamilyAgeGroupForTeam("soccer", "U10", 4)).toBe(soccerFamilyAgeGroup("soccer", "U10"));
    expect(soccerFamilyAgeGroupForTeam("futsal", "U10", 4)).toBe(soccerFamilyAgeGroup("futsal", "U10"));
  });
});

describe("soccerFamilyRules", () => {
  it("is each sport's own", () => {
    expect(soccerFamilyRules("soccer")).toBe(SOCCER_RULES);
    expect(soccerFamilyRules("futsal")).toBe(FUTSAL_RULES);
    expect(soccerFamilyRules("hockey")).toBe(HOCKEY_RULES);
  });

  it("names the lines in each sport's words", () => {
    const labels = (rules: typeof SOCCER_RULES) => [rules.lineLabels.def.label, rules.lineLabels.mid.label, rules.lineLabels.att.label];
    expect(labels(SOCCER_RULES)).toEqual(["Defence", "Midfield", "Attack"]);
    expect(labels(FUTSAL_RULES)).toEqual(["Back", "Wings", "Front"]);
    expect(labels(HOCKEY_RULES)).toEqual(["Defenders", "Midfield", "Strikers"]);
    for (const rules of [SOCCER_RULES, FUTSAL_RULES, HOCKEY_RULES]) {
      expect(rules.lineLabels.gk.short).toBe("GK");
      expect(rules.lineLabels.field.short).toBe("");
    }
  });

  it("draws each sport's surface", () => {
    expect(SOCCER_RULES.surface).toBe("pitch");
    expect(FUTSAL_RULES.surface).toBe("court");
    expect(HOCKEY_RULES.surface).toBe("hockey");
  });

  it("swaps keepers mid-period in soccer and futsal, only at a break in hockey", () => {
    expect(SOCCER_RULES.keeperSwapMidPeriod).toBe(true);
    expect(FUTSAL_RULES.keeperSwapMidPeriod).toBe(true);
    expect(HOCKEY_RULES.keeperSwapMidPeriod).toBe(false);
    // Hockey's next keeper hears two minutes before the break.
    expect(HOCKEY_RULES.keeperKitUpSeconds).toBe(120);
    expect(SOCCER_RULES.keeperKitUpSeconds).toBeNull();
    expect(FUTSAL_RULES.keeperKitUpSeconds).toBeNull();
  });

  it("lets only hockey choose halves or quarters", () => {
    expect([SOCCER_RULES, FUTSAL_RULES, HOCKEY_RULES].map((r) => r.halvesOrQuarters)).toEqual([false, false, true]);
  });

  it("keeps Football Victoria's lines warning to soccer", () => {
    expect(SOCCER_RULES.minLines?.ages).toEqual(["U12", "U13"]);
    expect(FUTSAL_RULES.minLines).toBeNull();
    expect(HOCKEY_RULES.minLines).toBeNull();
  });
});

describe("soccerFamilyPlaybook", () => {
  const futsal = soccerFamilyPlaybook("futsal", FUTSAL_RULES);
  const hockey = soccerFamilyPlaybook("hockey", HOCKEY_RULES);
  const soccer = soccerFamilyPlaybook("soccer", SOCCER_RULES);

  it("is each sport's own How we play", () => {
    expect(futsal.sport).toBe("futsal");
    expect(hockey.sport).toBe("hockey");
    // Futsal's U10 keeps score; soccer's (MiniRoos) doesn't.
    expect(futsal.agePolicy("U10").tracksScoreDefault).toBe(true);
    expect(soccer.agePolicy("U10").tracksScoreDefault).toBe(false);
    expect(hockey.agePolicy("U10").tracksScoreDefault).toBe(false);
    expect(hockey.agePolicy("U11").tracksScoreDefault).toBe(true);
  });

  it("offers each sport's keeper strategies by age", () => {
    const ids = (pb: typeof futsal, age: string) => pb.strategies(policy(age)).map((s) => s.id);
    // Futsal has a keeper at every age.
    expect(ids(futsal, "U6")).toEqual(["turns", "keepers"]);
    expect(futsal.recommendedStrategy(policy("U11"))).toBe("turns");
    expect(futsal.recommendedStrategy(policy("U12"))).toBe("keepers");
    // Hockey's minis have none.
    expect(ids(hockey, "U8")).toEqual(["minutes"]);
    expect(hockey.recommendedStrategy(policy("U9"))).toBe("turns");
    expect(hockey.recommendedStrategy(policy("U12"))).toBe("turns");
    expect(hockey.recommendedStrategy(policy("U13"))).toBe("keepers");
    expect(soccerKeeperStrategy("hockey", "U7", "keepers")).toBe("none");
    expect(soccerKeeperStrategy("futsal", "U6", null)).toBe("turns");
  });

  it("quotes each sport's own laws, at the ages they cover", () => {
    const laws = (pb: typeof futsal, age: string) => pb.lawRules(policy(age), pb.agePolicy(age)).map((r) => r.source);
    expect(laws(soccer, "U9")).toEqual(Array(3).fill("Football Australia MiniRoos"));
    expect(laws(soccer, "U12")).toEqual([]);
    // No MiniRoos in futsal or hockey.
    expect(laws(futsal, "U8")).toEqual(["FIFA Futsal Laws of the Game", "FIFA Futsal Laws of the Game", "Capital Football Minis"]);
    expect(laws(futsal, "U12")).toEqual(["FIFA Futsal Laws of the Game", "FIFA Futsal Laws of the Game"]);
    expect(laws(hockey, "U9")).toEqual(["FIH Rules of Hockey", "Hockey NSW, Under 8 to Under 10"]);
    expect(laws(hockey, "U13")).toEqual(["FIH Rules of Hockey"]);
    expect(hockey.agePolicy("U13").minGameTimePct.source).toBe("Hockey NSW: equal time on the field");
  });

  it("names goal in the role sheet where the age has a keeper", () => {
    expect(hockey.positionModel(policy("U8"), 6).lines).toEqual([]);
    expect(hockey.positionModel(policy("U9"), 7).lines.map((l) => l.id)).toEqual(["gk"]);
  });
});

describe("the family's words elsewhere", () => {
  it("heads the season grid with each sport's line words", () => {
    expect(gridUnits("soccer", "line").columns.map((c) => c.label)).toEqual(["Att", "Mid", "Def"]);
    expect(gridUnits("futsal", "line").columns.map((c) => c.label)).toEqual(["Front", "Wing", "Back"]);
    expect(gridUnits("hockey", "line").columns.map((c) => c.label)).toEqual(["Str", "Mid", "Def"]);
    expect(gridUnits("hockey", "line").columns.map((c) => c.key)).toEqual(["att", "mid", "def"]);
  });

  it("shares the result under the sport's emoji", () => {
    const summary = (emoji: string) =>
      buildSoccerSummary({
        emoji,
        teamName: "Owls",
        opponentName: "Bats",
        trackScoring: false,
        state: replaySoccerGame([]),
        squad: [],
        presentIds: [],
      });
    expect(summary(SOCCER_RULES.emoji)).toBe("⚽ Full time — Owls v Bats");
    expect(summary(HOCKEY_RULES.emoji)).toBe("🏑 Full time — Owls v Bats");
  });

  it("calls the breaks as AFL does, halves or quarters", () => {
    expect(periodBreakName(1, 2)).toBe("Half time");
    expect(periodBreakName(2, 2)).toBe("Full time");
    expect([1, 2, 3, 4].map((p) => periodBreakName(p, 4))).toEqual([
      "Quarter time",
      "Half time",
      "Three-quarter time",
      "Full time",
    ]);
  });
});
