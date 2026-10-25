// ─── Union's front row goes to kids picked for it ────────────
// UX audit, 23 Oct 2026 (union P1). With named positions and season
// balance on (the defaults), the half-time "Suggested" moved eight of
// fifteen kids across lines and dealt the front row to whoever was
// left: the fullback at hooker, a lock at tighthead. The break only
// said Forwards / Backs, so nobody saw it. Now:
//
//   - The break's Suggested splits the lines by the kids' roles (it
//     never passed How we play to the planner) and keeps a kid picked
//     for each front-row spot on the field when one's available.
//   - Union's front row (LHP1, HK2, THP3) goes only to kids whose role
//     includes the spot, once the coach has picked anyone for it; a kid
//     playing elsewhere is moved up before anyone unpicked takes it.
//   - The break's check flags a front-row spot held by a kid not
//     picked for it, with the swap that fixes it.

import { describe, expect, it } from "vitest";
import { resolveTeamPlaybook } from "@/lib/playbook/team";
import {
  assignLeaguePositions,
  leaguePlaybookInput,
  restrictedMisfits,
  type LeaguePlaybookInput,
} from "@/lib/sports/rugby_league/engine";
import { getAgeGroupConfig } from "@/lib/sports";
import { rugbyBreakCheck } from "@/lib/sports/rugby/breakCheck";
import { leagueBreakSuggestion } from "@/lib/sports/rugby/breakSuggestion";
import type { PlayerPositionPrefRow } from "@/lib/playbook/types";

const P = 25 * 60_000;
type Pref = Pick<PlayerPositionPrefRow, "player_id" | "position_key" | "line" | "kind" | "rank">;
const home = (pid: string, key: string): Pref => ({ player_id: pid, position_key: key, line: null, kind: "home", rank: 0 });
const also = (pid: string, key: string, rank = 1): Pref => ({ player_id: pid, position_key: key, line: null, kind: "also", rank });

function unionInput(prefs: Pref[], positions: { id: string; label: string; name?: string; line: string }[] = []): LeaguePlaybookInput {
  const resolved = resolveTeamPlaybook({
    sport: "rugby_union",
    ageGroup: "U12",
    onFieldSize: 15,
    row: { strategy: "named-positions", policy_overrides: {}, season_balance: null, season_balance_since: null },
    positions: positions.map((p, i) => ({ id: p.id, label: p.label, name: p.name ?? null, line: p.line, sort: i, archived_at: null })),
  });
  return leaguePlaybookInput(resolved, prefs, [], undefined, P);
}

describe("which positions are union's front row", () => {
  it("the standard list: LHP1, HK2 and THP3", () => {
    const pb = unionInput([]);
    expect(pb.positions!.filter((p) => p.restricted).map((p) => p.label)).toEqual(["LHP1", "HK2", "THP3"]);
  });

  it("a coach's own list: by its label or name", () => {
    const pb = unionInput([], [
      { id: "a", label: "LHP1", line: "forwards" },
      { id: "b", label: "Hook", name: "Hooker", line: "forwards" },
      { id: "c", label: "LK", name: "Lock", line: "forwards" },
      { id: "d", label: "FB", line: "backs" },
    ]);
    expect(pb.positions!.filter((p) => p.restricted).map((p) => p.key)).toEqual(["a", "b"]);
  });

  it("league has no restricted spot", () => {
    const resolved = resolveTeamPlaybook({
      sport: "rugby_league",
      ageGroup: "U12",
      onFieldSize: 13,
      row: { strategy: "named-positions", policy_overrides: {}, season_balance: null, season_balance_since: null },
    });
    const pb = leaguePlaybookInput(resolved, [], [], undefined, P);
    expect(pb.positions!.some((p) => p.restricted)).toBe(false);
  });
});

describe("dealing the front row", () => {
  // The audit's H2 forwards after a reshuffle: a fullback and an outside
  // centre in the pack; a lock who also hooks, a number 8 who also props.
  const prefs = [
    home("fb", "ru-15"),
    home("oc", "ru-13"),
    home("lock", "ru-4"),
    also("lock", "ru-2"),
    home("n8", "ru-8"),
    also("n8", "ru-1"),
    also("n8", "ru-3", 2),
    home("f5", "ru-5"),
    home("f6", "ru-6"),
    home("f7", "ru-7"),
    // The picked front row, on the bench this half.
    home("lhp", "ru-1"),
    home("hk", "ru-2"),
    home("thp", "ru-3"),
  ];
  const forwards = ["fb", "oc", "lock", "n8", "f5", "f6", "f7", "kid"];

  it("moves picked kids up into the front row before anyone unpicked takes it", () => {
    const pb = unionInput(prefs);
    const slots = assignLeaguePositions({ forwards, backs: [] }, pb);
    expect(slots.lock).toBe("ru-2");
    expect(["ru-1", "ru-3"]).toContain(slots.n8);
    // One front-row spot is left and nobody on is picked for it.
    const misfits = restrictedMisfits(slots, pb);
    expect(misfits).toHaveLength(1);
    expect(["ru-1", "ru-3"]).toContain(misfits[0].key);
  });

  it("with the picked front row on, each plays their own spot, season balance or not", () => {
    for (const seasonWeight of [0, 300]) {
      const pb = { ...unionInput(prefs), seasonWeight, seasonPositions: { lhp: { "ru-1": 10 * P }, kid: {} } };
      const slots = assignLeaguePositions({ forwards: ["kid", "fb", "lhp", "hk", "thp", "f5", "f6", "f7"], backs: [] }, pb);
      expect([slots.lhp, slots.hk, slots.thp]).toEqual(["ru-1", "ru-2", "ru-3"]);
      expect(restrictedMisfits(slots, pb)).toEqual([]);
    }
  });

  it("nobody picked for the front row yet: no restriction, nothing flagged", () => {
    const pb = unionInput([]);
    const slots = assignLeaguePositions({ forwards: ["a", "b", "c", "d", "e", "f", "g", "h"], backs: [] }, pb);
    expect(Object.values(slots).sort()).toEqual(["ru-1", "ru-2", "ru-3", "ru-4", "ru-5", "ru-6", "ru-7", "ru-8"]);
    expect(restrictedMisfits(slots, pb)).toEqual([]);
  });
});

describe("the break's Suggested", () => {
  // Union U12: 16 here, 15 on. Kids 0–7 play forward spots 1–8, kids
  // 8–14 back spots 9–15, kid 15 has no role.
  const ids = Array.from({ length: 16 }, (_, i) => `k${i}`);
  const prefs = ids.slice(0, 15).map((pid, i) => home(pid, `ru-${i + 1}`));
  const pb = unionInput(prefs);
  const ageGroup = getAgeGroupConfig("rugby_union", "U12");
  const h1 = { forwards: ids.slice(0, 8), backs: ids.slice(8, 15), bench: [ids[15]] };

  const suggest = (msByPlayer: Record<string, number>, minGameTimePct?: number) =>
    leagueBreakSuggestion({
      sport: "rugby_union",
      ageGroup,
      previousLineup: h1,
      injured: new Set(),
      loaned: new Set(),
      onFieldSize: 15,
      currentQuarter: 1,
      leaguePlaybook: pb,
      msByPlayer,
      periodMs: P,
      minGameTimePct,
    });
  const expectRolesKept = (next: ReturnType<typeof suggest>) => {
    for (const pid of next.forwards) expect(ids.slice(0, 8).concat(ids[15])).toContain(pid);
    for (const pid of next.backs) expect(ids.slice(8, 15).concat(ids[15])).toContain(pid);
    for (const pid of ["k0", "k1", "k2"]) expect(next.forwards, pid).toContain(pid);
    expect(restrictedMisfits(assignLeaguePositions(next, pb), pb)).toEqual([]);
  };

  it("keeps every kid in their own line, the picked front row on", () => {
    // The fifteen played all of H1; kid 15 sat it out and comes on.
    const next = suggest(Object.fromEntries(ids.map((id) => [id, id === ids[15] ? 0 : P])));
    expect(next.bench).toHaveLength(1);
    expect(next.bench).not.toContain(ids[15]);
    expectRolesKept(next);
  });

  it("brings the loosehead back on when time alone would sit him", () => {
    // No floor; k0 played a minute more than anyone, so he'd sit.
    const next = suggest(Object.fromEntries(ids.map((id) => [id, id === ids[15] ? 0 : id === "k0" ? P : P - 60_000])), 0);
    expect(next.forwards).toContain("k0");
    expectRolesKept(next);
  });
});

describe("the break's check", () => {
  // Tom has no role; the rest of the pack has its own spots.
  const prefs = [home("hk", "ru-2"), home("lhp", "ru-1"), home("thp", "ru-3"), ...[4, 5, 6, 7, 8].map((n) => home(`f${n}`, `ru-${n}`))];
  const pb = unionInput(prefs);
  const ageGroup = getAgeGroupConfig("rugby_union", "U12");
  const forwards = ["lhp", "tom", "thp", "f4", "f5", "f6", "f7", "f8"];
  const backs = ["b9", "b10", "b11", "b12", "b13", "b14", "b15"];

  it("fails a front-row spot held by a kid not picked for it while one who is sits out", () => {
    const items = rugbyBreakCheck({
      lineup: { forwards, backs, bench: ["hk"] },
      ageGroup,
      names: { tom: "Tom", hk: "Tevita" },
      playedThisGame: {},
      benchedLastPeriod: [],
      period: 2,
      periodMs: P,
      periodWord: "half",
      positions: pb,
    });
    const item = items.find((i) => i.id.startsWith("front-row"));
    expect(item?.status).toBe("fail");
    expect(item?.text).toMatch(/Tom.*HK2/);
  });

  it("passes when the picked kids hold it", () => {
    const items = rugbyBreakCheck({
      lineup: { forwards: ["lhp", "hk", "thp", "f4", "f5", "f6", "f7", "f8"], backs, bench: ["tom"] },
      ageGroup,
      names: {},
      playedThisGame: {},
      benchedLastPeriod: [],
      period: 2,
      periodMs: P,
      periodWord: "half",
      positions: pb,
    });
    expect(items.find((i) => i.id.startsWith("front-row"))).toBeUndefined();
  });
});
