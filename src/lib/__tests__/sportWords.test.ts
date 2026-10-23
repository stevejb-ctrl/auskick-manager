// Shared screens speak each sport's own words (ten-sport UX audit,
// 23 Oct 2026). The clock menu said "When the siren beats the app's
// clock" in every sport, the end-early confirm said "the clock is
// paused" while it ran, AFL's last quarter ended on "the final
// whistle", halves sports were told about "quarter breaks", every
// squad was "15–20 kids", and netball, futsal and basketball set
// "Players on the field". Every word now comes from the sport's config;
// these walk every sport and age group and fail on another sport's word.

import { describe, expect, it } from "vitest";
import {
  ALL_SPORTS,
  getAgeGroupConfig,
  getSportConfig,
  isRugby,
  isSoccer,
  periodLabels,
  type AgeGroupConfig,
  type SportConfig,
} from "@/lib/sports";
import { periodEndLine } from "@/lib/sports/break";
import {
  clockEndEarlyHint,
  endPeriodEarlyCopy,
  onSurfaceLabel,
  playersOnSurfaceLabel,
  restartGameHint,
  sportsInASentence,
  squadSizeHint,
  subsAtBreaksOnly,
  type EndEarlyClock,
} from "@/lib/sports/words";
import { teamAgeGroup } from "@/lib/sports/teamAgeGroup";
import { buildLeagueWalkthroughSteps } from "@/components/league/leagueWalkthroughSteps";
import { soccerFamilyRules } from "@/lib/sports/soccer/family";

/** The words one sport may use and another may not. */
const CUES = ["siren", "whistle", "buzzer", "hooter", "umpire", "referee", "ball goes up"];
const SURFACES = ["field", "court", "pitch", "oval"];
const PERIODS = ["quarter", "half", "halves", "period"];
const AFL_ONLY = ["afl", "footy", "behind", "auskick"];

function ownWords(sport: SportConfig, ag: AgeGroupConfig): string {
  const { label, plural } = periodLabels(sport.id, ag);
  const w = sport.words;
  return [w.surface, w.startCue, w.endCue, label, plural, sport.id === "afl" ? AFL_ONLY.join(" ") : ""]
    .join(" ")
    .toLowerCase();
}

/**
 * Another sport's words in `text`. Half-time is every sport's; league's
 * "unbroken period" (its §6 law) and "Dummy Half" (a vest) are names,
 * not period words.
 */
function foreignWords(text: string, sport: SportConfig, ag: AgeGroupConfig): string[] {
  const own = ownWords(sport, ag);
  const t = text.toLowerCase().replace(/half-time|unbroken[- ]period|dummy half/g, "");
  return [...CUES, ...SURFACES, ...PERIODS, ...AFL_ONLY].filter(
    (word) => new RegExp(`\\b${word}`).test(t) && !new RegExp(`\\b${word}`).test(own),
  );
}

const CLOCKS: EndEarlyClock[] = ["running", "paused", "hooter"];

/** Every line of shared copy a sport's screens show for this age group. */
function sharedCopy(sport: SportConfig, ag: AgeGroupConfig): string[] {
  const { label } = periodLabels(sport.id, ag);
  const out: string[] = [
    clockEndEarlyHint(sport.id),
    restartGameHint(label),
    squadSizeHint(ag),
    onSurfaceLabel(sport.id),
    playersOnSurfaceLabel(sport.id),
  ];
  for (let n = 1; n <= ag.periodCount; n++) {
    out.push(periodEndLine(sport.id, label, n, ag.periodCount));
    for (const clock of CLOCKS) {
      const c = endPeriodEarlyCopy({ sport: sport.id, periodLabel: label, period: n, clock });
      out.push(c.title, c.body, c.confirm);
    }
  }
  if (isRugby(sport.id)) {
    for (const s of buildLeagueWalkthroughSteps({
      sport: sport.id,
      trackScoring: true,
      periodLabel: label,
      vests: { fr: ag.vestRequirements?.fr ?? false, dh: ag.vestRequirements?.dh ?? false },
      kickingAllowed: ag.kickingAllowed === true,
      trackZoneTime: true,
      enforceUnbrokenPeriods: true,
      goalsFromPlay: ag.goalsFromPlay,
      kickRotations: ag.kickRotations,
      unbrokenPeriods: ag.unbrokenPeriods,
    })) {
      out.push(s.title, s.body);
    }
  }
  return out;
}

describe("shared copy speaks the sport's own words", () => {
  for (const sport of ALL_SPORTS) {
    describe(sport.id, () => {
      it("states a surface and the cues that start and end play", () => {
        expect(["field", "court"]).toContain(sport.words.surface);
        expect(sport.words.startCue.length).toBeGreaterThan(0);
        expect(sport.words.endCue.length).toBeGreaterThan(0);
      });

      for (const ag of [...sport.ageGroups, ...(sport.legacyAgeGroups ?? [])]) {
        it(`${ag.id}: no other sport's words`, () => {
          for (const line of sharedCopy(sport, ag)) {
            expect(foreignWords(line, sport, ag), `${sport.id} ${ag.id}: "${line}"`).toEqual([]);
          }
        });
      }
    });
  }
});

describe("the clock menu and the end-early confirm", () => {
  it("names the sport's own end cue", () => {
    expect(clockEndEarlyHint("afl")).toBe("When the siren beats the app's clock.");
    expect(clockEndEarlyHint("soccer")).toBe("When the whistle beats the app's clock.");
    expect(clockEndEarlyHint("basketball")).toBe("When the buzzer beats the app's clock.");
    expect(clockEndEarlyHint("netball")).toBe("When the whistle beats the app's clock.");
  });

  it("fits a running clock, a paused one and the hooter, and starts with a capital", () => {
    const running = endPeriodEarlyCopy({ sport: "soccer", periodLabel: "half", period: 1, clock: "running" });
    expect(running.title).toBe("End H1 now?");
    expect(running.confirm).toBe("End H1");
    expect(running.body).not.toMatch(/paused/);
    expect(running.body).toMatch(/whistle/);

    const paused = endPeriodEarlyCopy({ sport: "netball", periodLabel: "quarter", period: 3, clock: "paused" });
    expect(paused.title).toBe("End Q3 now?");
    expect(paused.body).toMatch(/paused/);
    expect(paused.body).toMatch(/court/);

    const hooter = endPeriodEarlyCopy({ sport: "basketball", periodLabel: "half", period: 2, clock: "hooter" });
    expect(hooter.body).not.toMatch(/paused|beats/);

    for (const sport of ALL_SPORTS) {
      for (const clock of CLOCKS) {
        const { body } = endPeriodEarlyCopy({ sport: sport.id, periodLabel: sport.periodLabel, period: 1, clock });
        expect(body.charAt(0), `${sport.id} ${clock}`).toBe(body.charAt(0).toUpperCase());
      }
    }
  });
});

describe("AFL's end-of-quarter line", () => {
  it("ends on the final siren and calls the Q2 break half-time", () => {
    expect(periodEndLine("afl", "quarter", 4, 4)).toBe("That's the final siren!");
    expect(periodEndLine("afl", "quarter", 2, 4)).toBe("Half-time — Q3 is next.");
    expect(periodEndLine("afl", "quarter", 1, 4)).toBe("Quarter break — Q2 is next.");
    expect(periodEndLine("soccer", "half", 1, 2)).toBe("Half-time — 2nd half is next.");
  });
});

describe("restart and squad copy", () => {
  it("wipes the game's own periods", () => {
    expect(restartGameHint("quarter")).toBe("Wipes every quarter, swap and score.");
    expect(restartGameHint("half")).toBe("Wipes every half, swap and score.");
  });

  it("suggests a squad between a few subs and the age group's cap", () => {
    expect(squadSizeHint(getAgeGroupConfig("afl", "U10"))).toMatch(/^15–20 kids /);
    expect(squadSizeHint(getAgeGroupConfig("soccer", "U9"))).toMatch(/^9–11 kids /);
    expect(squadSizeHint(getAgeGroupConfig("basketball", "U12"))).toMatch(/^7–12 kids /);
    expect(squadSizeHint(getAgeGroupConfig("rugby_union", "U12"))).toMatch(/^19–23 kids /);
    for (const sport of ALL_SPORTS) {
      for (const ag of sport.ageGroups) {
        const [low, high] = squadSizeHint(ag).match(/^(\d+)(?:–(\d+))? kids/)!.slice(1).map(Number);
        expect(low, `${sport.id} ${ag.id}`).toBeGreaterThan(ag.defaultOnFieldSize);
        expect(high || low, `${sport.id} ${ag.id}`).toBe(ag.maxSquadSize);
      }
    }
  });

  it("puts court sports on the court", () => {
    expect(onSurfaceLabel("netball")).toBe("on court");
    expect(onSurfaceLabel("futsal")).toBe("on court");
    expect(onSurfaceLabel("basketball")).toBe("on court");
    expect(onSurfaceLabel("afl")).toBe("on field");
    expect(playersOnSurfaceLabel("basketball")).toBe("Players on the court");
  });

  it("agrees with the soccer family's own word for the whole surface", () => {
    for (const sport of ALL_SPORTS.filter((s) => isSoccer(s.id))) {
      const rules = soccerFamilyRules(sport.id as "soccer" | "futsal" | "hockey");
      expect(sport.words.surface, sport.id).toBe(rules.lineLabels.field.label.toLowerCase());
    }
  });
});

describe("a team's own periods", () => {
  it("follows the team's halves or quarters", () => {
    expect(periodLabels("hockey", teamAgeGroup("hockey", "U13", 2)).label).toBe("half");
    expect(periodLabels("basketball", teamAgeGroup("basketball", "U10", 4)).label).toBe("quarter");
    expect(periodLabels("touch", teamAgeGroup("touch", "U10", 1)).label).toBe("period");
    expect(periodLabels("afl", teamAgeGroup("afl", "U10", null)).label).toBe("quarter");
  });
});

describe("pictures and brand words", () => {
  it("draws only AFL on an oval", () => {
    for (const sport of ALL_SPORTS) {
      expect(sport.surfaceArt === "oval", sport.id).toBe(sport.id === "afl");
    }
  });

  it("says Junior AFL on no brand but AFL's own sport", () => {
    // The main Siren brand (sirenfooty.com.au) serves every sport.
    expect(getSportConfig("afl").brand.audience).toBe("Junior sport");
    expect(getSportConfig("netball").brand.audience).toBe("Junior netball");
    for (const sport of ALL_SPORTS) expect(sport.brand.audience, sport.id).not.toMatch(/AFL|footy/i);
  });

  it("lists every sport for Help, and the sports that sub only at breaks", () => {
    const list = sportsInASentence();
    for (const sport of ALL_SPORTS) expect(list).toContain(sport.words.sportName);
    expect(list).toMatch(/, (and|or) [^,]+$/);
    expect(subsAtBreaksOnly().map((s) => s.id)).toEqual(["netball"]);
  });
});

describe("rugby's walkthrough", () => {
  it("promises no keep-on, lock, line move or positionless play", () => {
    for (const id of ["rugby_league", "rugby_union"] as const) {
      for (const ag of getSportConfig(id).ageGroups) {
        const text = sharedCopy(getSportConfig(id), ag).join("\n");
        expect(text, `${id} ${ag.id}`).not.toMatch(/keep on|\block|move to forwards|positionless/i);
      }
    }
  });
});

describe("the soccer family's own words", () => {
  it("names keepers without the old 'home:' jargon", () => {
    for (const id of ["soccer", "futsal", "hockey"] as const) {
      const copy = JSON.stringify(soccerFamilyRules(id).strategyCopy);
      expect(copy, id).not.toMatch(/home:/);
    }
  });

  it("calls futsal's subs flying, and the others rolling", () => {
    expect(soccerFamilyRules("futsal").rollingSubs.label).toBe("Flying subs");
    expect(soccerFamilyRules("soccer").rollingSubs.label).toBe("Rolling subs");
    expect(soccerFamilyRules("hockey").rollingSubs.label).toBe("Rolling subs");
  });
});
