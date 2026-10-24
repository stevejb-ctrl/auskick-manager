// ─── Union live subs go by position ──────────────────────────
// UX audit, 23 Oct 2026 (union P1). "Make all swaps" put a late
// arrival at loosehead and a winger at hooker: the live suggester paired
// by line and time only, and a sub takes the slot of the kid they
// replace. Now, with named positions:
//
//   - a bench kid never replaces a front-row kid unless they're picked
//     for that spot (once the coach has picked anyone for it);
//   - among kids who've been on about as long, the one in the bench
//     kid's own position (home, then also) comes off for them;
//   - each pair carries the spot ("HK2 Tevita → Leo").

import { describe, expect, it } from "vitest";
import type { GameEvent, GameEventType } from "@/lib/types";
import { resolveTeamPlaybook } from "@/lib/playbook/team";
import { leaguePlaybookInput, type LeaguePlaybookInput } from "@/lib/sports/rugby_league/engine";
import { suggestLeagueSubs, type LeagueSubLaws } from "@/lib/sports/rugby_league/fairness";
import type { PlayerPositionPrefRow } from "@/lib/playbook/types";

const MIN = 60_000;
let ts = 0;
function ev(type: GameEventType, metadata: Record<string, unknown> = {}): GameEvent {
  ts++;
  return {
    id: `e${ts}`,
    game_id: "g1",
    type,
    player_id: null,
    metadata,
    created_at: new Date(Date.UTC(2026, 9, 23, 9, 0, 0, ts)).toISOString(),
    created_by: null,
  } as GameEvent;
}

type Pref = Pick<PlayerPositionPrefRow, "player_id" | "position_key" | "line" | "kind" | "rank">;
const home = (pid: string, key: string): Pref => ({ player_id: pid, position_key: key, line: null, kind: "home", rank: 0 });
const also = (pid: string, key: string): Pref => ({ player_id: pid, position_key: key, line: null, kind: "also", rank: 1 });

function unionInput(prefs: Pref[]): LeaguePlaybookInput {
  const resolved = resolveTeamPlaybook({
    sport: "rugby_union",
    ageGroup: "U12",
    onFieldSize: 15,
    row: { strategy: "named-positions", policy_overrides: {}, season_balance: null, season_balance_since: null },
  });
  return leaguePlaybookInput(resolved, prefs, [], undefined, 25 * MIN);
}

const LAWS: LeagueSubLaws = { periodCount: 2, periodMs: 25 * MIN, requiredUnbroken: 0, minGameTimePct: 50, crossLineGapMs: 5 * MIN };

// Kid pN plays position N (1–15) from kickoff, their home.
const field = Array.from({ length: 15 }, (_, i) => `p${i + 1}`);
const slots = Object.fromEntries(field.map((pid, i) => [pid, `ru-${i + 1}`]));
const prefs = field.map((pid, i) => home(pid, `ru-${i + 1}`));

function at20(bench: string[], extra: Pref[] = []) {
  const lineup = { forwards: field.slice(0, 8), backs: field.slice(8), bench };
  const events = [ev("lineup_set", { lineup: { ...lineup, slots } }), ev("quarter_start", { quarter: 1 })];
  return suggestLeagueSubs(events, 1, lineup, [], 20 * MIN, undefined, unionInput([...prefs, ...extra]), LAWS);
}

describe("union live subs by position", () => {
  it("a late arrival and a winger never go into the front row", () => {
    // Rory arrived late (no role); Leo's home is left wing.
    const swaps = at20(["rory", "leo"], [home("leo", "ru-11")]);
    expect(swaps).toHaveLength(2);
    // Nobody in LHP1, HK2 or THP3 comes off for them.
    for (const s of swaps) expect(["p1", "p2", "p3"]).not.toContain(s.off.playerId);
  });

  it("the winger replaces the left wing, and the pair names the spot", () => {
    const swaps = at20(["rory", "leo"], [home("leo", "ru-11")]);
    const leo = swaps.find((s) => s.on.playerId === "leo")!;
    expect(leo.off.playerId).toBe("p11");
    expect(leo.position).toEqual({ key: "ru-11", label: "LW11" });
    expect(leo.zone).toBe("back");
  });

  it("a kid picked to hook can replace the hooker", () => {
    const swaps = at20(["sub"], [also("sub", "ru-2")]);
    expect(swaps[0].off.playerId).toBe("p2");
    expect(swaps[0].position?.label).toBe("HK2");
  });

  it("with nobody picked for the front row, it's open to all (no restriction yet)", () => {
    const lineup = { forwards: field.slice(0, 8), backs: field.slice(8), bench: ["rory"] };
    const events = [ev("lineup_set", { lineup: { ...lineup, slots } }), ev("quarter_start", { quarter: 1 })];
    const swaps = suggestLeagueSubs(events, 1, lineup, [], 20 * MIN, undefined, unionInput([]), LAWS);
    expect(swaps).toHaveLength(1);
    expect(swaps[0].position?.key).toBe("ru-1");
  });
});
