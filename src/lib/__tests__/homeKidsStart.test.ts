// Set positions / named positions: at kickoff, kids with a home
// position start in it (Stagehand usability run: the U15 coach's full
// forward sat out Q1 while another kid wore FF; Steve: "home kids
// start"). After kickoff the usual rotation decides who sits.

import { describe, expect, it } from "vitest";
import { suggestStartingLineup, type ZoneCaps } from "@/lib/fairness";
import type { AflPlaybookInput } from "@/lib/sports/afl/engine";
import { suggestNetballLineup } from "@/lib/sports/netball/fairness";
import type { NetballPlaybookInput } from "@/lib/sports/netball/engine";
import { primaryThirdFor } from "@/lib/sports/netball";
import { suggestLeagueLineup } from "@/lib/sports/rugby_league/fairness";
import type { LeaguePlaybookInput } from "@/lib/sports/rugby_league/engine";
import type { Player } from "@/lib/types";

function players(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    team_id: "t",
    full_name: `P${i + 1}`,
    jersey_number: i + 1,
    is_active: true,
    created_by: "o",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  })) as Player[];
}
const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];

describe("home kids start", () => {
  it("AFL set positions: every kid with a home position starts on the field", () => {
    const caps: ZoneCaps = { back: 5, hback: 0, mid: 5, hfwd: 0, fwd: 5 };
    const squad = players(20);
    const home = { p16: "ff", p17: "fb", p18: "c", p19: "chf", p20: "chb" } as Record<string, string>;
    const playbook: AflPlaybookInput = {
      strategy: "set-positions",
      seasonWeight: 0,
      roles: {},
      positions: [
        { key: "ff", label: "FF", line: "fwd" },
        { key: "chf", label: "CHF", line: "fwd" },
        { key: "c", label: "C", line: "mid" },
        { key: "chb", label: "CHB", line: "back" },
        { key: "fb", label: "FB", line: "back" },
      ],
      positionRoles: Object.fromEntries(Object.entries(home).map(([pid, key]) => [pid, { home: key, also: [], never: [] }])),
    };
    for (const seed of SEEDS) {
      const lineup = suggestStartingLineup(squad, {}, seed, caps, {}, {}, {}, {}, {}, {}, {}, 12 * 60_000, playbook);
      for (const pid of Object.keys(home)) expect(lineup.bench, `seed ${seed}`).not.toContain(pid);
    }
  });

  it("netball set positions: a girl with a home bib starts", () => {
    const squad = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
    const playbook: NetballPlaybookInput = {
      strategy: "set-positions",
      seasonWeight: 0,
      unit: "bib",
      periodMs: 600_000,
      roleUnit: "position",
      roles: {
        h: { home: "gs", also: [], never: [], keepOn: false },
        i: { home: "gk", also: [], never: [], keepOn: false },
      },
    };
    for (const seed of SEEDS) {
      const lineup = suggestNetballLineup({
        playerIds: squad,
        positions: ["gs", "ga", "wa", "c", "wd", "gd", "gk"],
        season: {},
        thisGame: {},
        isAllowed: () => true,
        seed,
        thirdOf: primaryThirdFor as never,
        playbook,
      });
      expect(lineup.positions.gs, `seed ${seed}`).toEqual(["h"]);
      expect(lineup.positions.gk, `seed ${seed}`).toEqual(["i"]);
    }
  });

  it("league named positions: a kid with a home position starts", () => {
    const squad = players(13);
    const playbook: LeaguePlaybookInput = {
      strategy: "named-positions",
      seasonWeight: 0,
      periodMs: 20 * 60_000,
      roles: { p12: { home: "forwards", also: [], never: [], keepOn: false }, p13: { home: "backs", also: [], never: [], keepOn: false } },
      vestStrategy: "auto",
      positions: [
        { key: "hk", label: "HK", line: "forwards" },
        { key: "fb", label: "FB", line: "backs" },
      ],
      positionRoles: { p12: { home: "hk", also: [], never: [] }, p13: { home: "fb", also: [], never: [] } },
    };
    const result = suggestLeagueLineup({
      players: squad,
      defaultOnFieldSize: 11,
      forwardCount: 6,
      seasonEvents: [],
      requiredUnbrokenPeriods: 0,
      playbook,
    });
    expect(result.lineup.bench).not.toContain("p12");
    expect(result.lineup.bench).not.toContain("p13");
  });
});
