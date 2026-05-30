// Pre-game rotation plan — plain-text formatter unit tests.
//
// The formatter is the planning-time mirror of the post-game summary's
// `buildSummary`. These tests pin the contract a coach relies on when
// they paste the plan into the team chat:
//
//   • Header reads "🗓 Game plan — Team v Opp" (drops the opponent
//     half when none is given).
//   • Every period is a block with its on-field groups + bench.
//   • Player ids are resolved through the caller's name lookup —
//     never leaked raw into the text.
//   • The plan is who-is-where only — NO per-player game-time footer.

import { describe, it, expect } from "vitest";
import { projectGamePlan, formatGamePlan } from "@/lib/game-plan";
import type { GamePlan } from "@/lib/game-plan";
import { getAgeGroupConfig } from "@/lib/sports/registry";

function makeSquad(size: number): { id: string }[] {
  return Array.from({ length: size }, (_, i) => ({
    id: `P${(i + 1).toString().padStart(2, "0")}`,
  }));
}

// Friendly names so the assertions read like a coach's chat message.
const NAMES: Record<string, string> = {
  P01: "Jack",
  P02: "Tom",
  P03: "Will",
  P04: "Sam",
  P05: "Alex",
  P06: "Ben",
  P07: "Max",
  P08: "Leo",
  P09: "Ned",
  P10: "Charlie",
  P11: "Ollie",
  P12: "Finn",
  P13: "Hugo",
  P14: "Eli",
  P15: "Zac",
};
const nameOf = (id: string) => NAMES[id] ?? id;

function aflPlan(): GamePlan {
  const ageGroup = getAgeGroupConfig("afl", "U10");
  const squad = makeSquad(ageGroup.defaultOnFieldSize + 3);
  return projectGamePlan({
    sport: "afl",
    ageGroup,
    players: squad,
    onFieldSize: ageGroup.defaultOnFieldSize,
    seed: 7,
  });
}

describe("formatGamePlan — structure & header", () => {
  const plan = aflPlan();

  it("opens with the 🗓 header including the opponent", () => {
    const text = formatGamePlan(plan, {
      teamName: "Hawks",
      opponentName: "Eagles",
      playerName: nameOf,
    });
    expect(text.split("\n")[0]).toBe("🗓 Game plan — Hawks v Eagles");
  });

  it("drops the 'v …' half when no opponent is given", () => {
    const noOpp = formatGamePlan(plan, { teamName: "Hawks", playerName: nameOf });
    expect(noOpp.split("\n")[0]).toBe("🗓 Game plan — Hawks");
    // Whitespace-only opponent is treated as absent.
    const blankOpp = formatGamePlan(plan, {
      teamName: "Hawks",
      opponentName: "   ",
      playerName: nameOf,
    });
    expect(blankOpp.split("\n")[0]).toBe("🗓 Game plan — Hawks");
  });

  it("states the period cadence + sub interval in the subhead", () => {
    const text = formatGamePlan(plan, { teamName: "Hawks", playerName: nameOf });
    // U10 AFL rolls subs, so the subhead also carries the interchange cadence.
    const mins = Math.round(plan.periodMinutes);
    const subMin = Math.round((plan.subIntervalSeconds ?? 0) / 60);
    expect(text.split("\n")[1]).toBe(
      `4 quarters · ~${mins} min each · subs ~every ${subMin} min`,
    );
  });

  it("renders one labelled block per period with an interchange line", () => {
    const text = formatGamePlan(plan, { teamName: "Hawks", playerName: nameOf });
    for (const period of plan.periods) {
      expect(text).toContain(`\n${period.label}\n`);
    }
    // The squad has 3 flex players and AFL rolls subs, so each quarter's
    // bench renders as an ordered interchange queue, not a static bench.
    expect(text).toContain("  Interchange (on first → last): ");
  });
});

describe("formatGamePlan — names, never raw ids", () => {
  const plan = aflPlan();

  it("resolves every on-field + bench id through the name lookup", () => {
    const text = formatGamePlan(plan, {
      teamName: "Hawks",
      opponentName: "Eagles",
      playerName: nameOf,
    });
    // No raw "P0x" id should survive into the shareable text.
    expect(text).not.toMatch(/\bP\d{2}\b/);
    // And the names we mapped should be present.
    expect(text).toContain("Jack");
  });

  it("falls back to the id (never blank) for an unmapped player", () => {
    const text = formatGamePlan(plan, {
      teamName: "Hawks",
      playerName: (id) => (id === "P01" ? "Jack" : id),
    });
    // P01 → Jack; everyone else falls through to their id, proving the
    // formatter never drops a player it can't name.
    expect(text).toContain("Jack");
    expect(text).toMatch(/P\d{2}/);
  });
});

describe("formatGamePlan — no per-player game-time footer", () => {
  const plan = aflPlan();
  const text = formatGamePlan(plan, {
    teamName: "Hawks",
    opponentName: "Eagles",
    playerName: nameOf,
  });

  it("does not append a planned-game-time section", () => {
    // The plan is who-is-where each quarter, not a minutes ledger —
    // the per-period blocks are the whole message.
    expect(text).not.toContain("Planned game time");
    expect(text).not.toContain("⏱");
  });

  it("ends on the final period's block, with no per-player minute lines", () => {
    // The final quarter's interchange line is the last thing in the
    // message — no footer trails it. (aflPlan has a 3-deep bench.)
    const lines = text.split("\n");
    expect(lines[lines.length - 1]).toMatch(
      /^ {2}Interchange \(on first → last\): /,
    );
    // The "≈" marker only ever appeared in the rotation game-time footer,
    // so its absence proves no per-player minute line survives.
    expect(text).not.toContain("≈");
  });
});

describe("formatGamePlan — netball positions & rugby league F/B", () => {
  it("labels netball position groups (GS/GA/…) per quarter", () => {
    const ageGroup = getAgeGroupConfig("netball", "11u");
    const onField = ageGroup.defaultOnFieldSize;
    const plan = projectGamePlan({
      sport: "netball",
      ageGroup,
      players: makeSquad(onField + 3),
      onFieldSize: onField,
      seed: 3,
    });
    const text = formatGamePlan(plan, {
      teamName: "Darters",
      opponentName: "Comets",
      playerName: nameOf,
    });
    // Each of the seven position short-labels appears as a group line.
    for (const g of plan.periods[0].groups) {
      expect(text).toContain(`  ${g.groupLabel}: `);
    }
  });

  it("labels rugby league forwards/backs per period", () => {
    const ageGroup = getAgeGroupConfig("rugby_league", "U9");
    const onField = ageGroup.defaultOnFieldSize;
    const plan = projectGamePlan({
      sport: "rugby_league",
      ageGroup,
      players: makeSquad(onField + 3),
      onFieldSize: onField,
      seed: 5,
    });
    const text = formatGamePlan(plan, {
      teamName: "Bulldogs",
      playerName: nameOf,
    });
    expect(text).toContain("  Forwards: ");
    expect(text).toContain("  Backs: ");
  });
});

describe("formatGamePlan — short squad (no bench)", () => {
  it("omits the Bench line when everyone plays every period", () => {
    const ageGroup = getAgeGroupConfig("afl", "U10");
    const plan = projectGamePlan({
      sport: "afl",
      ageGroup,
      players: makeSquad(6),
      onFieldSize: 6,
      seed: 1,
    });
    const text = formatGamePlan(plan, { teamName: "Hawks", playerName: nameOf });
    expect(text).not.toContain("Bench:");
  });
});
