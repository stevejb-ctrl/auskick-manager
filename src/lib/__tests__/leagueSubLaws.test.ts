// ─── League live subs keep the laws they cite ────────────────
// UX audit, 23 Oct 2026 (league P1). Tyler sat out H1 and started H2;
// a few minutes in, the sub card said "Tyler → Lachlan" (Lachlan had
// just played the whole first half). Taking Tyler off breaks two rules
// Siren shows as Musts: §6 (at least one unbroken half) and the 50%
// floor — both only reachable for him this half. The suggester:
//
//   - never suggests taking off a kid whose unbroken period or game-
//     time floor can only be reached in this period;
//   - crosses lines when the other line's longest-on kid has been on
//     far longer (a sub interval) than the best same-line choice,
//     instead of pulling a kid who just came on.

import { describe, expect, it } from "vitest";
import type { GameEvent, GameEventType } from "@/lib/types";
import { suggestLeagueSubs, type LeagueSubLaws } from "@/lib/sports/rugby_league/fairness";
import type { LeaguePlaybookInput } from "@/lib/sports/rugby_league/engine";

const MIN = 60_000;
let ts = 0;
function ev(type: GameEventType, metadata: Record<string, unknown> = {}, playerId: string | null = null): GameEvent {
  ts++;
  return {
    id: `e${ts}`,
    game_id: "g1",
    type,
    player_id: playerId,
    metadata,
    created_at: new Date(Date.UTC(2026, 9, 23, 9, 0, 0, ts)).toISOString(),
    created_by: null,
  } as GameEvent;
}

/** Preferred line: everyone's home is the line they're listed in. */
function preferredLine(homes: Record<string, "forwards" | "backs">): LeaguePlaybookInput {
  return {
    strategy: "preferred-line",
    seasonWeight: 0,
    periodMs: 20 * MIN,
    roles: Object.fromEntries(Object.entries(homes).map(([pid, home]) => [pid, { home, also: [], never: [], keepOn: false }])),
    vestStrategy: "auto",
    minGameTimePct: 50,
  };
}

const U10: LeagueSubLaws = { periodCount: 2, periodMs: 20 * MIN, requiredUnbroken: 1, minGameTimePct: 50, crossLineGapMs: 4 * MIN };

describe("the audit's H2: Tyler and Archie sat out H1", () => {
  // H1: eleven play the whole half (Lachlan among them); Tyler, Archie and Zara sit.
  const h1 = { forwards: ["Harrison", "Lachlan", "Jayden", "Cooper", "Mia"], backs: ["Charlie", "Isla", "Sienna", "Eli", "Noah", "Ruby"], bench: ["Tyler", "Archie", "Zara"] };
  // H2: Tyler and Archie start in the forwards; Lachlan and Mia sit; Ruby off.
  const h2 = { forwards: ["Tyler", "Archie", "Harrison", "Jayden", "Cooper"], backs: ["Charlie", "Isla", "Sienna", "Eli", "Noah", "Mia"], bench: ["Zara", "Lachlan", "Ruby"] };
  const events = [
    ev("lineup_set", { lineup: h1 }),
    ev("quarter_start", { quarter: 1 }),
    ev("quarter_end", { quarter: 1, elapsed_ms: 20 * MIN }),
    ev("lineup_set", { lineup: h2 }),
    ev("quarter_start", { quarter: 2 }),
  ];
  const homes = preferredLine({
    ...Object.fromEntries(h2.forwards.map((p) => [p, "forwards" as const])),
    ...Object.fromEntries(h2.backs.map((p) => [p, "backs" as const])),
    Zara: "forwards",
    Lachlan: "forwards",
    Ruby: "backs",
  });
  // Jayden (DH) and Cooper (FR) wear the vests: never suggested off.
  const vests = ["Jayden", "Cooper"];

  it("never suggests taking Tyler or Archie off — this half is their only unbroken one", () => {
    const swaps = suggestLeagueSubs(events, 2, h2, vests, 5 * MIN + 46_000, undefined, homes, U10);
    const offs = swaps.map((s) => s.off.playerId);
    expect(offs).not.toContain("Tyler");
    expect(offs).not.toContain("Archie");
    expect(swaps.length).toBeGreaterThan(0);
  });

  it("Lachlan, wanting the forwards, crosses to the longest-on back", () => {
    const swaps = suggestLeagueSubs(events, 2, h2, vests, 5 * MIN + 46_000, undefined, homes, U10);
    const lachlan = swaps.find((s) => s.on.playerId === "Lachlan");
    expect(lachlan).toBeDefined();
    expect(lachlan!.zone).toBe("back");
    expect(h2.backs).toContain(lachlan!.off.playerId);
    // Every back has been on since kickoff (Mia moved line at the
    // break, still on): the first of them comes off.
    expect(lachlan!.off.playerId).toBe("Charlie");
  });
});

describe("crossing lines on a big gap (no law at stake)", () => {
  // H1 at 18:00: T1 and T2 came on at 16:00 in the forwards; the backs
  // have been on since kickoff. Lachlan, on the bench, wants the forwards.
  const start = { forwards: ["F1", "F2", "V1"], backs: ["B1", "B2", "B3"], bench: ["T1", "T2", "Lachlan"] };
  const events = [
    ev("lineup_set", { lineup: start }),
    ev("quarter_start", { quarter: 1 }),
    ev("swap", { off_player_id: "F1", on_player_id: "T1", quarter: 1, elapsed_ms: 16 * MIN }),
    ev("swap", { off_player_id: "F2", on_player_id: "T2", quarter: 1, elapsed_ms: 16 * MIN }),
  ];
  const now = { forwards: ["T1", "T2", "V1"], backs: ["B1", "B2", "B3"], bench: ["F1", "F2", "Lachlan"] };
  const homes = preferredLine({ T1: "forwards", T2: "forwards", V1: "forwards", F1: "forwards", F2: "forwards", Lachlan: "forwards", B1: "backs", B2: "backs", B3: "backs" });

  it("doesn't pull a forward who came on two minutes ago when a back has been on eighteen", () => {
    const swaps = suggestLeagueSubs(events, 1, now, ["V1"], 18 * MIN, undefined, homes, U10);
    const offs = swaps.map((s) => s.off.playerId);
    expect(offs).not.toContain("T1");
    expect(offs).not.toContain("T2");
    expect(offs.every((id) => now.backs.includes(id))).toBe(true);
  });

  it("stays in the line when the gap is small", () => {
    const close = [
      ev("lineup_set", { lineup: start }),
      ev("quarter_start", { quarter: 1 }),
      ev("swap", { off_player_id: "F1", on_player_id: "T1", quarter: 1, elapsed_ms: 2 * MIN }),
    ];
    const lineup = { forwards: ["T1", "F2", "V1"], backs: ["B1", "B2", "B3"], bench: ["F1", "T2", "Lachlan"] };
    const swaps = suggestLeagueSubs(close, 1, lineup, ["V1"], 18 * MIN, undefined, homes, U10);
    const lachlan = swaps.find((s) => s.on.playerId === "Lachlan");
    expect(lachlan?.zone).toBe("forward");
  });
});

describe("§6 in quarters (U9: two unbroken quarters)", () => {
  const U9: LeagueSubLaws = { periodCount: 4, periodMs: 10 * MIN, requiredUnbroken: 2, minGameTimePct: 0, crossLineGapMs: 3 * MIN };
  // A sits Q1 and Q2 and starts Q3, so it needs Q3 and Q4. B played Q1
  // and Q2 and comes back on at 5:00 of Q3 (for E).
  const events = [
    ev("lineup_set", { lineup: { forwards: ["E", "B"], backs: [], bench: ["A"] } }),
    ev("quarter_start", { quarter: 1 }),
    ev("quarter_end", { quarter: 1, elapsed_ms: 10 * MIN }),
    ev("quarter_start", { quarter: 2 }),
    ev("quarter_end", { quarter: 2, elapsed_ms: 10 * MIN }),
    ev("lineup_set", { lineup: { forwards: ["A", "E"], backs: [], bench: ["B"] } }),
    ev("quarter_start", { quarter: 3 }),
    ev("swap", { off_player_id: "E", on_player_id: "B", quarter: 3, elapsed_ms: 5 * MIN }),
  ];
  const now = { forwards: ["A", "B"], backs: [], bench: ["E"] };

  it("in Q3, the longest-on kid stays on when it's their last chance at two unbroken quarters", () => {
    expect(suggestLeagueSubs(events, 3, now, [], 6 * MIN)[0].off.playerId).toBe("A");
    const swaps = suggestLeagueSubs(events, 3, now, [], 6 * MIN, undefined, undefined, U9);
    expect(swaps.map((s) => s.off.playerId)).toEqual(["B"]);
  });

  it("in Q1 there's time for two more: the same kid can come off", () => {
    const fresh = [ev("lineup_set", { lineup: { forwards: ["A"], backs: [], bench: ["E"] } }), ev("quarter_start", { quarter: 1 })];
    const swaps = suggestLeagueSubs(fresh, 1, { forwards: ["A"], backs: [], bench: ["E"] }, [], 6 * MIN, undefined, undefined, U9);
    expect(swaps.map((s) => s.off.playerId)).toEqual(["A"]);
  });
});

describe("the 50% floor alone (no unbroken law)", () => {
  const laws: LeagueSubLaws = { periodCount: 2, periodMs: 20 * MIN, requiredUnbroken: 0, minGameTimePct: 50, crossLineGapMs: 4 * MIN };
  // H1: Full plays it all, Short the last 5 minutes. Both are on in H2,
  // Full from 1:00 (for Y).
  const events = [
    ev("lineup_set", { lineup: { forwards: ["X", "Full"], backs: [], bench: ["Short", "S", "Y"] } }),
    ev("quarter_start", { quarter: 1 }),
    ev("swap", { off_player_id: "X", on_player_id: "Short", quarter: 1, elapsed_ms: 15 * MIN }),
    ev("quarter_end", { quarter: 1, elapsed_ms: 20 * MIN }),
    ev("lineup_set", { lineup: { forwards: ["Short", "Y"], backs: [], bench: ["Full", "S", "X"] } }),
    ev("quarter_start", { quarter: 2 }),
    ev("swap", { off_player_id: "Y", on_player_id: "Full", quarter: 2, elapsed_ms: 1 * MIN }),
  ];
  const now = { forwards: ["Short", "Full"], backs: [], bench: ["S", "Y"] };

  it("keeps on a kid who needs the rest of this half to reach half the game", () => {
    // 3 minutes into H2, Short has 8 of the 20 he needs; he's the longest on.
    expect(suggestLeagueSubs(events, 2, now, [], 3 * MIN)[0].off.playerId).toBe("Short");
    const swaps = suggestLeagueSubs(events, 2, now, [], 3 * MIN, undefined, undefined, laws);
    expect(swaps.map((s) => s.off.playerId)).toEqual(["Full"]);
  });

  it("frees them once they're past it", () => {
    // 16 minutes in: 21 minutes played.
    const swaps = suggestLeagueSubs(events, 2, now, [], 16 * MIN, undefined, undefined, laws);
    expect(swaps.map((s) => s.off.playerId)).toContain("Short");
  });
});
