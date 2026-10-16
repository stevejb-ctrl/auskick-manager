import { describe, expect, it } from "vitest";
import {
  assignLeagueLines,
  assignLeaguePositionLabels,
  lastVestWearer,
  leagueLineScores,
  nextInOrder,
  type LeaguePlaybookInput,
  type LeagueRole,
} from "@/lib/sports/rugby_league/engine";
import { withKickoffSnapshot } from "@/lib/playbook/seasonBalance";
import type { GameEvent } from "@/lib/types";

const P = 20 * 60_000;
const role = (r: Partial<LeagueRole>): LeagueRole => ({ home: null, also: [], never: [], keepOn: false, ...r });
const input = (over: Partial<LeaguePlaybookInput> = {}): LeaguePlaybookInput => ({
  strategy: "both-lines",
  seasonWeight: 300,
  periodMs: P,
  roles: {},
  vestStrategy: "auto",
  ...over,
});

describe("league lines from How we play (UX plan 5.6)", () => {
  it("Both lines: season balance sends a kid to the line they're owed", () => {
    const s = leagueLineScores(input({ season: { a: { forwards: 4 * P } } }), "a");
    expect(s.backs).toBeGreaterThan(s.forwards);
  });

  it("Preferred line leans home; never-plays rules a line out", () => {
    const pref = leagueLineScores(input({ strategy: "preferred-line", roles: { a: role({ home: "backs" }) } }), "a");
    expect(pref.backs).toBeGreaterThan(pref.forwards);
    const never = leagueLineScores(input({ roles: { a: role({ never: ["forwards"] }) } }), "a");
    expect(never.forwards).toBe(-Infinity);
  });

  it("fills the lines to size, one-line kids first", () => {
    const pb = input({
      strategy: "preferred-line",
      roles: {
        a: role({ never: ["backs"] }),
        b: role({ never: ["backs"] }),
        c: role({ home: "forwards" }),
        d: role({ home: "backs" }),
      },
    });
    const { forwards, backs } = assignLeagueLines(["c", "d", "a", "b"], 2, 2, pb);
    expect(forwards.sort()).toEqual(["a", "b"]);
    expect(backs.sort()).toEqual(["c", "d"]);
  });
});

describe("vests in a fixed order", () => {
  it("goes round in squad order after the last wearer", () => {
    const order = ["p1", "p2", "p3", "p4"];
    expect(nextInOrder(["p1", "p3", "p4"], order, "p1")).toBe("p3");
    expect(nextInOrder(["p1", "p3"], order, "p4")).toBe("p1");
    expect(nextInOrder(["p1", "p3"], order, null)).toBe("p1");
    expect(nextInOrder(["p1", "p3"], order, "p1", "p3")).toBe("p1");
  });

  it("finds who wore it last", () => {
    const ev = (pid: string, vest: string, t: string): GameEvent => ({
      id: t,
      game_id: "g",
      type: "vest_assigned",
      player_id: pid,
      metadata: { vest },
      created_by: null,
      created_at: t,
    });
    expect(lastVestWearer([ev("a", "fr", "2026-01-01"), ev("b", "fr", "2026-02-01"), ev("c", "dh", "2026-03-01")], "fr")).toBe("b");
  });
});

describe("named positions (UX plan 5.7)", () => {
  const positions = [
    { key: "pr1", label: "PR", line: "forwards" as const },
    { key: "hk", label: "HK", line: "forwards" as const },
    { key: "fb", label: "FB", line: "backs" as const },
    { key: "hb", label: "HB", line: "backs" as const },
  ];
  it("labels kids home first within their line", () => {
    const labels = assignLeaguePositionLabels(
      { forwards: ["a", "b"], backs: ["c", "d"] },
      input({ positions, positionRoles: { b: { home: "pr1", also: [], never: [] }, d: { home: "fb", also: [], never: [] } } }),
    );
    expect(labels).toEqual({ b: "PR", a: "HK", d: "FB", c: "HB" });
  });

  it("holds a kid to their home position's line", () => {
    const pb = input({ strategy: "named-positions", roles: { a: role({ home: "backs" }) } });
    const s = leagueLineScores(pb, "a");
    expect(s.backs - s.forwards).toBeGreaterThanOrEqual(3000);
  });
});

// A league game in progress plays what it kicked off with, as AFL and
// netball do (cross-sport audit, 14 Oct 2026): league read the live
// How we play, so a mid-game change to the strategy or season balance
// changed a running game.
describe("the kickoff snapshot", () => {
  it("holds a league game to the strategy and balance it kicked off with", () => {
    const live = input({ strategy: "preferred-line", seasonWeight: 600 });
    const snapshot = {
      strategy: "both-lines",
      seasonBalance: "off" as const,
      seasonBalanceSince: null,
      positions: [],
      policy: {} as never,
      takenAt: new Date(0).toISOString(),
    };
    expect(withKickoffSnapshot("rugby_league", live, snapshot)).toMatchObject({ strategy: "both-lines", seasonWeight: 0 });
    expect(withKickoffSnapshot("rugby_league", live, { ...snapshot, seasonBalance: "light" }).seasonWeight).toBe(150);
    expect(withKickoffSnapshot("rugby_league", live, null)).toBe(live);
  });
});
