import { describe, expect, it } from "vitest";
import { cycleLineup, netballAllowed, partnerOf, type NetballPlaybookInput } from "@/lib/sports/netball/engine";

const BIBS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"];

const input = (over: Partial<NetballPlaybookInput> = {}): NetballPlaybookInput => ({
  strategy: "position-cycle",
  seasonWeight: 0,
  unit: "bib",
  periodMs: 600_000,
  roleUnit: "position",
  roles: {},
  ...over,
});

describe("position cycle (UX plan 5.2)", () => {
  const prev = {
    positions: { gs: ["a"], ga: ["b"], wa: ["c"], c: ["d"], wd: ["e"], gd: ["f"], gk: ["g"] },
    bench: ["h", "i"],
  };

  it("moves everyone along by the bench size, so the whole bench comes on", () => {
    const next = cycleLineup(prev, BIBS, ["a", "b", "c", "d", "e", "f", "g", "h", "i"]);
    expect(next.positions).toEqual({ gs: ["h"], ga: ["i"], wa: ["a"], c: ["b"], wd: ["c"], gd: ["d"], gk: ["e"] });
    expect(next.bench).toEqual(["f", "g"]);
  });

  it("steps one along when nobody's on the bench", () => {
    const full = { positions: prev.positions, bench: [] };
    const next = cycleLineup(full, BIBS, ["a", "b", "c", "d", "e", "f", "g"]);
    expect(next.positions.gs).toEqual(["g"]);
    expect(next.positions.ga).toEqual(["a"]);
  });

  it("drops kids who've gone and adds arrivals to the bench", () => {
    const next = cycleLineup(prev, BIBS, ["a", "b", "c", "d", "e", "f", "g", "h", "z"]);
    expect(next.positions.gs).toEqual(["h"]);
    expect(next.positions.ga).toEqual(["z"]);
    expect(next.bench).toEqual(["f", "g"]);
  });

  it("never sends a kid to a bib they never play", () => {
    const next = cycleLineup(prev, BIBS, ["a", "b", "c", "d", "e", "f", "g", "h", "i"], input({
      roles: { a: { home: null, also: [], never: ["ga"], keepOn: false } },
    }));
    expect(next.positions.ga).not.toEqual(["a"]);
    expect(Object.values(next.positions).flat()).toContain("a");
  });
});

describe("partners (UX plan 5.4)", () => {
  it("pairs the shooters and the keepers, and rotates the centre court", () => {
    expect(partnerOf("gs", BIBS)).toBe("ga");
    expect(partnerOf("gk", BIBS)).toBe("gd");
    expect(partnerOf("wa", BIBS)).toBe("c");
    expect(partnerOf("wd", BIBS)).toBe("wa");
    // NetSetGo's five bibs: C has no partner.
    expect(partnerOf("c", ["gs", "ga", "c", "gd", "gk"])).toBe("c");
  });
});

describe("never plays", () => {
  it("rules out a bib or a whole third", () => {
    const i = input({
      roles: {
        a: { home: null, also: [], never: ["gk"], keepOn: false },
        b: { home: null, also: [], never: ["attack-third"], keepOn: false },
      },
    });
    expect(netballAllowed(i, "a", "gk")).toBe(false);
    expect(netballAllowed(i, "a", "gd")).toBe(true);
    expect(netballAllowed(i, "b", "ga")).toBe(false);
    expect(netballAllowed(i, "b", "c")).toBe(true);
  });
});

// ─── The five styles through the real suggester ──────────────
import { suggestNetballLineup, type GenericLineup } from "@/lib/sports/netball/fairness";
import { primaryThirdFor } from "@/lib/sports/netball";

const SQUAD = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
type Role = { home: string | null; also: string[]; never: string[]; keepOn: boolean };
const r = (over: Partial<Role>): Role => ({ home: null, also: [], never: [], keepOn: false, ...over });

function play(pb: NetballPlaybookInput, quarters = 4, season: Record<string, Record<string, number>> = {}): GenericLineup[] {
  const thisGame: Record<string, Record<string, number>> = {};
  let lastThird: Record<string, "attack-third" | "centre-third" | "defence-third"> = {};
  let prev: GenericLineup | null = null;
  const out: GenericLineup[] = [];
  for (let q = 1; q <= quarters; q++) {
    const lineup = suggestNetballLineup({
      playerIds: SQUAD,
      positions: BIBS,
      season,
      thisGame,
      isAllowed: () => true,
      seed: q,
      thirdOf: primaryThirdFor as never,
      lastQuarterThird: lastThird,
      playbook: { ...pb, previousLineup: prev },
    });
    out.push(lineup);
    lastThird = {};
    for (const [bib, ids] of Object.entries(lineup.positions)) {
      for (const pid of ids) {
        thisGame[pid] ??= {};
        thisGame[pid][bib] = (thisGame[pid][bib] ?? 0) + 1;
        lastThird[pid] = primaryThirdFor(bib) as never;
      }
    }
    prev = lineup;
  }
  return out;
}
const bibOf = (l: GenericLineup, pid: string) => Object.entries(l.positions).find(([, ids]) => ids.includes(pid))?.[0] ?? "bench";

describe("netball styles through the suggester (UX plan 5.1–5.5)", () => {
  it("By thirds: season balance sends a kid to the third they're owed", () => {
    const season = { a: { "attack-third": 6 * 600_000, "centre-third": 4 * 600_000 } };
    const [q1] = play(input({ strategy: "by-thirds", unit: "third", seasonWeight: 20_000, season }), 1);
    expect(primaryThirdFor(bibOf(q1, "a"))).toBe("defence-third");
  });

  it("Position by position: a new bib each quarter", () => {
    const game = play(input({ strategy: "position-by-position" }));
    for (const pid of SQUAD) {
      const worn = game.map((l) => bibOf(l, pid)).filter((b) => b !== "bench");
      expect(new Set(worn).size).toBe(worn.length);
    }
  });

  it("Position cycle: Q2 is Q1 moved along by the bench size", () => {
    const [q1, q2] = play(input({ strategy: "position-cycle" }), 2);
    const seq = [...BIBS.map((b) => q1.positions[b][0]), ...q1.bench];
    const rotated = [...seq.slice(-2), ...seq.slice(0, -2)];
    expect(BIBS.map((b) => q2.positions[b][0])).toEqual(rotated.slice(0, 7));
    expect(q2.bench.some((p) => q1.bench.includes(p))).toBe(false);
  });

  it("Partners: kids keep their third and swap bibs", () => {
    const roles: Record<string, Role> = {
      a: r({ home: "gs" }),
      b: r({ home: "ga" }),
      f: r({ home: "gd" }),
      g: r({ home: "gk" }),
    };
    const [q1, q2] = play(input({ strategy: "partners", roles }), 2);
    for (const pid of ["a", "b", "f", "g"]) {
      if (bibOf(q1, pid) === "bench" || bibOf(q2, pid) === "bench") continue;
      expect(primaryThirdFor(bibOf(q2, pid))).toBe(primaryThirdFor(bibOf(q1, pid)));
      expect(bibOf(q2, pid)).not.toBe(bibOf(q1, pid));
    }
  });

  it("Set positions: everyone at home every quarter", () => {
    const roles: Record<string, Role> = {};
    BIBS.forEach((b, i) => (roles[SQUAD[i]] = r({ home: b })));
    const game = play(input({ strategy: "set-positions", roles }));
    for (const l of game) {
      for (const b of BIBS) {
        if (l.positions[b][0] && roles[l.positions[b][0]]) expect(roles[l.positions[b][0]].home).toBe(b);
      }
    }
    // The home GS is on at GS whenever they play.
    for (const l of game) if (bibOf(l, "a") !== "bench") expect(bibOf(l, "a")).toBe("gs");
  });

  it("never puts a kid in a bib they never play", () => {
    const game = play(input({ strategy: "by-thirds", unit: "third", roles: { a: r({ never: ["attack-third"] }) } }));
    // GS and GA are the attack third (WA counts as centre).
    for (const l of game) expect(["gs", "ga"]).not.toContain(bibOf(l, "a"));
  });
});

describe("netball rules at netball's scale", () => {
  const coverage = (game: GenericLineup[]) => {
    let total = 0;
    for (const pid of SQUAD) {
      total += new Set(
        game.map((l) => bibOf(l, pid)).filter((b) => b !== "bench").map((b) => primaryThirdFor(b)),
      ).size;
    }
    return total / SQUAD.length;
  };
  const everyThird = (strength: "must" | "prefer") => [
    { id: "r", kind: "every-line-per-game" as const, params: {}, strength, enabled: true },
  ];

  it("a Prefer every-third rule beats Partners' keep-your-third pull", () => {
    // Partners holds a kid in their third (+60,000); unscaled, a Prefer
    // rule (1,500) would never move them.
    const without = coverage(play(input({ strategy: "partners", roleUnit: "line" })));
    const prefer = coverage(play(input({ strategy: "partners", roleUnit: "line", rules: everyThird("prefer") })));
    expect(prefer).toBeGreaterThan(without);
  });
});
