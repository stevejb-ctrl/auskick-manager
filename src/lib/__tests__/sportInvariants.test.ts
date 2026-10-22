// Invariants every sport keeps (cross-sport audit, 14 Oct 2026). Each
// sport owns its words and settings; these pin that they agree with
// themselves, so a new sport or age group can't quietly borrow another's.

import { describe, expect, it } from "vitest";
import { ALL_SPORTS, getSportConfig, periodLabels } from "@/lib/sports";
import { getSportPlaybook } from "@/lib/playbook";
import { PLAYHQ_TENANT } from "@/lib/playhq";
import type { SportId } from "@/lib/sports/types";

/** Sports whose How we play isn't built yet (.planning/FOUR-SPORTS-PLAN.md). */
const NOT_BUILT: SportId[] = ["hockey", "touch", "oztag"];

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
        // The four-sports plan's sports get theirs in tracks A and B;
        // until then every question fails by name (sportBranches.test).
        if (NOT_BUILT.includes(sport.id)) {
          expect(() => playbook.agePolicy(sport.ageGroups[0].id)).toThrow(/isn't built yet/);
          return;
        }
        // The soccer family's (soccer, futsal, hockey) and basketball's
        // engines act on no catalogue rule yet, so their Rules editors
        // offer none rather than rules that do nothing.
        if (sport.family === "soccer" || sport.id === "basketball") {
          expect(playbook.engineRuleKinds).toEqual([]);
          return;
        }
        expect(playbook.engineRuleKinds.length).toBeGreaterThan(0);
      });
    });
  }

  it("keeps each sport's own answers", () => {
    expect(getSportConfig("afl")).toMatchObject({ jerseyNumbers: true, teamSong: true });
    expect(getSportConfig("netball")).toMatchObject({ jerseyNumbers: false, teamSong: true });
    expect(getSportConfig("rugby_league")).toMatchObject({ jerseyNumbers: true, teamSong: false });
    expect(getSportConfig("rugby_union")).toMatchObject({ jerseyNumbers: true, teamSong: false });
    expect(getSportConfig("soccer")).toMatchObject({ jerseyNumbers: true, teamSong: false });
    expect(getSportConfig("basketball")).toMatchObject({ jerseyNumbers: true, teamSong: false });
    for (const id of ["futsal", "hockey", "touch", "oztag"] as const) {
      expect(getSportConfig(id), id).toMatchObject({ jerseyNumbers: true, teamSong: false });
    }
    expect(PLAYHQ_TENANT).toEqual({
      afl: "afl",
      netball: "netball-australia",
      rugby_league: null,
      rugby_union: null,
      soccer: null,
      basketball: "basketball-victoria",
      // None of the four-sports plan's sports is on PlayHQ.
      futsal: null,
      hockey: null,
      touch: null,
      oztag: null,
    });
  });
});
