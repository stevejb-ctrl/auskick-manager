// Game plan follows How we play in league too (Stagehand usability run:
// the plan disagreed with the lineup). The league projection used to
// split forwards and backs at random, ignoring roles.

import { describe, expect, it } from "vitest";
import { projectGamePlan } from "@/lib/game-plan/project";
import { getAgeGroupConfig } from "@/lib/sports";
import type { LeaguePlaybookInput } from "@/lib/sports/rugby_league/engine";

const players = Array.from({ length: 13 }, (_, i) => ({ id: `p${i + 1}`, full_name: `P${i + 1}`, jersey_number: i + 1 }));
const role = (r: Partial<LeaguePlaybookInput["roles"][string]>) => ({ home: null, also: [], never: [], keepOn: false, ...r });

describe("league Game plan with How we play", () => {
  it("keeps kids out of a line they never play, and leans to their home line", () => {
    const playbook: LeaguePlaybookInput = {
      strategy: "preferred-line",
      seasonWeight: 0,
      periodMs: 20 * 60_000,
      vestStrategy: "auto",
      roles: { p1: role({ never: ["forwards"] }), p2: role({ home: "forwards" }), p3: role({ home: "forwards" }) },
    };
    for (const seed of [1, 2, 3, 4, 5]) {
      const plan = projectGamePlan({
        sport: "rugby_league",
        ageGroup: getAgeGroupConfig("rugby_league", "U10"),
        players,
        onFieldSize: 11,
        seed,
        leaguePlaybook: playbook,
      });
      for (const period of plan.periods) {
        const forwards = period.groups.find((g) => g.groupId === "forwards")!.playerIds;
        expect(forwards, `seed ${seed} ${period.label}`).not.toContain("p1");
        for (const pid of ["p2", "p3"]) {
          if (!period.bench.includes(pid)) expect(forwards, `seed ${seed} ${period.label} ${pid}`).toContain(pid);
        }
      }
    }
  });
});
