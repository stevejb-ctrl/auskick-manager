// Every sport's starting-lineup picker is the live v3 field (Steve, 10
// Nov 2026: "ensure all sports are all on the same design"). Each picker
// draws its lineup with the shared PickerField on the ground helper its
// live screen uses, and lists lent kids with the shared LentList; the
// pickers' own old fields and benches stay deleted, so a sport can't
// quietly grow its own again. Reads each picker's source, as
// liveChromeContract.test.ts does for the live screens.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/** Each picker and the ground helper its live screen draws on. */
const PICKERS: [path: string, ground: string][] = [
  ["src/components/live/LineupPicker.tsx", "ovalField"],
  ["src/components/netball/LineupPicker.tsx", "netballCourt"],
  ["src/components/league/LeagueLineupPicker.tsx", "rugbyField"],
  ["src/components/soccer/SoccerLineupPicker.tsx", "soccerField"],
  ["src/components/basketball/BasketballLineupPicker.tsx", "woodCourt"],
  ["src/components/touch/TouchLineupPicker.tsx", "rugbyField"],
];

/** The old picker fields and benches (white cards, zone tags, bars). */
const RETIRED = [
  "src/components/live/Bench.tsx",
  "src/components/live/ZoneTimeLegend.tsx",
  "src/components/netball/Court.tsx",
  "src/components/netball/PositionToken.tsx",
  "src/components/league/LeagueField.tsx",
  "src/components/league/LeagueBenchStrip.tsx",
  "src/components/league/LeaguePlayerTile.tsx",
  "src/components/soccer/SoccerBench.tsx",
  "src/components/basketball/BasketballCourt.tsx",
  "src/components/basketball/BasketballBench.tsx",
  "src/components/touch/TouchField.tsx",
  "src/components/touch/TouchBench.tsx",
];

describe("the lineup pickers on live v3", () => {
  for (const [path, ground] of PICKERS) {
    it(`${path} draws on PickerField and the live screen's ground`, () => {
      const source = src(path);
      expect(source).toMatch(/<PickerField\b/);
      expect(source).toMatch(new RegExp(`ground=\\{${ground}\\(`));
      expect(source).toMatch(/<LentList\b/);
      // No old field of its own: no <Field>, <Court>, <SoccerField>…
      expect(source).not.toMatch(/<(Field|Bench|Court|LeagueField|LeagueBenchStrip|SoccerField|SoccerBench|BasketballCourt|BasketballBench|TouchField|TouchBench)\b/);
    });
  }

  it("the old picker fields stay deleted", () => {
    for (const path of RETIRED) expect(existsSync(join(process.cwd(), path)), path).toBe(false);
  });
});
