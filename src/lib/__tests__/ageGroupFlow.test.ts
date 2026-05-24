// End-to-end sanity check for every AFL junior age group: simulates
// the "create team → populate squad → start game" flow at the pure-
// function layer. No Supabase, no React — we exercise the same
// building blocks the server actions use:
//   - createGame()      → AGE_GROUPS[ageGroupOf(team.age_group)].defaultOnFieldSize
//   - live/page.tsx     → zoneCapsFor(onFieldSize, positionModel)
//   - LineupPicker      → suggestStartingLineup(players, {}, 0, zoneCaps)
//   - startGame()       → writes the lineup + on_field_size back
//
// If any age group ever regresses (e.g. U8 silently defaults to 12
// again, or the 5-position model stops splitting correctly), this
// suite fails.

import { describe, expect, it } from "vitest";
import {
  AGE_GROUPS,
  AGE_GROUP_ORDER,
  ageGroupOf,
  positionsFor,
} from "@/lib/ageGroups";
import { suggestStartingLineup, zoneCapsFor } from "@/lib/fairness";
import { ALL_ZONES } from "@/lib/fairness";
import type { AgeGroup, Player } from "@/lib/types";

function makePlayer(i: number, teamId: string): Player {
  return {
    id: `${teamId}-p${i}`,
    team_id: teamId,
    full_name: `Player ${i}`,
    jersey_number: i + 1,
    is_active: true,
    created_by: "system",
    created_at: "2026-04-01T00:00:00.000Z",
    updated_at: "2026-04-01T00:00:00.000Z",
  };
}

// AFL Junior Match Policy (per Play AFL handbook). If any of these
// numbers regress in the config, the assertion makes the change
// surface-level instead of silent.
// AFL Community Policy ladder:
//   U8 → 6, U9 → 9, U10/U11/U12 → 12, U13/U14/U15 → 15,
//   U16-U18 Boys → 18, U16-U18 Girls → 16.
// Earlier rev had U11/U12 at 15 and U13/U14/U15 at 18 — both wrong;
// Steve 2026-05-20 corrected during the per-age-group seed pass,
// then split U16+ by gender same day.
const EXPECTED_DEFAULT_ON_FIELD: Record<AgeGroup, number> = {
  U8: 6,
  U9: 9,
  U10: 12,
  U11: 12,
  U12: 12,
  U13: 15,
  U14: 15,
  U15: 15,
  // Legacy unsplit entries — kept in AGE_GROUPS for old-team
  // compatibility but no longer surface in AGE_GROUP_ORDER, so
  // the iterating test below skips them. Pin the expected
  // values anyway so a future accidental change in the legacy
  // record still fails the type check.
  U16: 18,
  U17: 18,
  // Split entries — Boys 18, Girls 16.
  U16_boys: 18,
  U16_girls: 16,
  U17_boys: 18,
  U17_girls: 16,
  U18_boys: 18,
  U18_girls: 16,
};

describe("Age group defaults match AFL Junior Match Policy", () => {
  for (const age of AGE_GROUP_ORDER) {
    it(`${age} defaults to ${EXPECTED_DEFAULT_ON_FIELD[age]}-a-side`, () => {
      expect(AGE_GROUPS[age].defaultOnFieldSize).toBe(
        EXPECTED_DEFAULT_ON_FIELD[age]
      );
    });
  }
});

describe.each(AGE_GROUP_ORDER)("%s — full game-start flow", (age) => {
  const cfg = AGE_GROUPS[age];
  const teamId = `team-${age.toLowerCase()}`;
  // Squad = on-field + 4 bench. Realistic junior squad shape.
  const squadSize = cfg.defaultOnFieldSize + 4;
  const squad = Array.from({ length: squadSize }, (_, i) =>
    makePlayer(i, teamId)
  );

  it("createGame() derives the right on-field default from team.age_group", () => {
    // Mirrors the server-action lookup:
    //   const ageCfg = AGE_GROUPS[ageGroupOf(team?.age_group)];
    //   on_field_size: input.on_field_size ?? ageCfg.defaultOnFieldSize
    const derived = AGE_GROUPS[ageGroupOf(age)].defaultOnFieldSize;
    expect(derived).toBe(EXPECTED_DEFAULT_ON_FIELD[age]);
  });

  it("zoneCapsFor() sums to the default on-field size", () => {
    const caps = zoneCapsFor(cfg.defaultOnFieldSize, cfg.positionModel);
    const total = positionsFor(cfg.positionModel).reduce(
      (sum, z) => sum + caps[z],
      0
    );
    expect(total).toBe(cfg.defaultOnFieldSize);
  });

  it("zoneCapsFor() uses the correct position model", () => {
    const caps = zoneCapsFor(cfg.defaultOnFieldSize, cfg.positionModel);
    if (cfg.positionModel === "zones3") {
      // 3-zone model should never populate the half-lines.
      expect(caps.hback).toBe(0);
      expect(caps.hfwd).toBe(0);
      expect(caps.back).toBeGreaterThan(0);
      expect(caps.mid).toBeGreaterThan(0);
      expect(caps.fwd).toBeGreaterThan(0);
    } else {
      // 5-position model (U13+) should populate all 5 lines, whether
      // the team's playing 15-a-side (U13-U15) or 18-a-side (U16+).
      for (const z of ["back", "hback", "mid", "hfwd", "fwd"] as const) {
        expect(caps[z]).toBeGreaterThan(0);
      }
    }
  });

  it(`starts a game: fills exactly ${cfg.defaultOnFieldSize} on-field + ${squadSize - cfg.defaultOnFieldSize} on bench`, () => {
    const caps = zoneCapsFor(cfg.defaultOnFieldSize, cfg.positionModel);
    const lineup = suggestStartingLineup(squad, {}, 0, caps);

    // On-field count matches the default
    const onField = ALL_ZONES.reduce((sum, z) => sum + lineup[z].length, 0);
    expect(onField).toBe(cfg.defaultOnFieldSize);

    // Bench holds everyone else
    expect(lineup.bench.length).toBe(squadSize - cfg.defaultOnFieldSize);

    // Every squad player placed somewhere — no duplicates, no drops
    const placed = [
      ...lineup.back,
      ...lineup.hback,
      ...lineup.mid,
      ...lineup.hfwd,
      ...lineup.fwd,
      ...lineup.bench,
    ];
    expect(placed.length).toBe(squadSize);
    expect(new Set(placed).size).toBe(squadSize);

    // Zones obey their caps
    for (const z of ALL_ZONES) {
      expect(lineup[z].length).toBeLessThanOrEqual(caps[z]);
    }
  });

  it("handles a skeleton squad (exactly default on-field, zero bench)", () => {
    const minSquad = squad.slice(0, cfg.defaultOnFieldSize);
    const caps = zoneCapsFor(cfg.defaultOnFieldSize, cfg.positionModel);
    const lineup = suggestStartingLineup(minSquad, {}, 0, caps);

    const onField = ALL_ZONES.reduce((sum, z) => sum + lineup[z].length, 0);
    expect(onField).toBe(cfg.defaultOnFieldSize);
    expect(lineup.bench.length).toBe(0);
  });

  it("respects short-handed play (min on-field size still fills correctly)", () => {
    const caps = zoneCapsFor(cfg.minOnFieldSize, cfg.positionModel);
    const onFieldSize = positionsFor(cfg.positionModel).reduce(
      (sum, z) => sum + caps[z],
      0
    );
    expect(onFieldSize).toBe(cfg.minOnFieldSize);

    // Give it exactly enough to field the min-sized team.
    const players = squad.slice(0, cfg.minOnFieldSize);
    const lineup = suggestStartingLineup(players, {}, 0, caps);
    const filled = ALL_ZONES.reduce((sum, z) => sum + lineup[z].length, 0);
    expect(filled).toBe(cfg.minOnFieldSize);
  });
});
