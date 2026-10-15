// Invariants every sport keeps (cross-sport audit, 14 Oct 2026). Each
// sport owns its words and settings; these pin that they agree with
// themselves, so a new sport or age group can't quietly borrow another's.

import { describe, expect, it } from "vitest";
import { ALL_SPORTS, getSportConfig, periodLabels } from "@/lib/sports";
import { getSportPlaybook } from "@/lib/playbook";
import { PLAYHQ_TENANT } from "@/lib/playhq";

describe("every sport", () => {
  for (const sport of ALL_SPORTS) {
    describe(sport.id, () => {
      it("names each age group's periods to match how many it plays", () => {
        for (const ag of [...sport.ageGroups, ...(sport.legacyAgeGroups ?? [])]) {
          const { label, plural } = periodLabels(sport.id, ag);
          if (label === "quarter") expect(ag.periodCount, `${sport.id} ${ag.id}`).toBe(4);
          if (label === "half") expect(ag.periodCount, `${sport.id} ${ag.id}`).toBe(2);
          expect(plural, `${sport.id} ${ag.id}`).toBe(label === "half" ? "halves" : `${label}s`);
        }
      });

      it("decides its own jersey numbers, team song and PlayHQ tenant", () => {
        const cfg = getSportConfig(sport.id);
        expect(typeof cfg.jerseyNumbers).toBe("boolean");
        expect(typeof cfg.teamSong).toBe("boolean");
        expect(sport.id in PLAYHQ_TENANT).toBe(true);
      });

      it("has its own playbook, with rules its engine acts on", () => {
        const playbook = getSportPlaybook(sport.id);
        expect(playbook.sport).toBe(sport.id);
        expect(playbook.engineRuleKinds.length).toBeGreaterThan(0);
      });
    });
  }

  it("keeps each sport's own answers", () => {
    expect(getSportConfig("afl")).toMatchObject({ jerseyNumbers: true, teamSong: true });
    expect(getSportConfig("netball")).toMatchObject({ jerseyNumbers: false, teamSong: true });
    expect(getSportConfig("rugby_league")).toMatchObject({ jerseyNumbers: true, teamSong: false });
    expect(getSportConfig("rugby_union")).toMatchObject({ jerseyNumbers: true, teamSong: false });
    expect(PLAYHQ_TENANT).toEqual({ afl: "afl", netball: "netball-australia", rugby_league: null, rugby_union: null });
  });
});
