// Phase D — chip-spread cost in suggestStartingLineup. Soft
// constraint: the suggester is biased AGAINST stacking same-chip
// players in one zone, but never blocks a placement.

import { describe, expect, it } from "vitest";
import { suggestStartingLineup, zoneCapsFor } from "@/lib/fairness";
import type { Player } from "@/lib/types";

function p(id: string, chip: "a" | "b" | null = null): Player {
  return {
    id,
    team_id: "T",
    full_name: id,
    jersey_number: null,
    is_active: true,
    chip,
    created_by: "u",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function chipsByZone(lineup: ReturnType<typeof suggestStartingLineup>, players: Player[]) {
  const byId = new Map(players.map((pl) => [pl.id, pl]));
  return {
    back: lineup.back.map((id) => byId.get(id)?.chip ?? null),
    mid: lineup.mid.map((id) => byId.get(id)?.chip ?? null),
    fwd: lineup.fwd.map((id) => byId.get(id)?.chip ?? null),
  };
}

describe("Phase D — chip-spread", () => {
  it("with no chips, behaviour is unchanged (size = on_field)", () => {
    const players = Array.from({ length: 12 }, (_, i) => p(`p${i}`));
    const lineup = suggestStartingLineup(players, {}, 0, zoneCapsFor(12, "zones3"));
    expect(lineup.back.length + lineup.mid.length + lineup.fwd.length).toBe(12);
  });

  it("spreads chip-A and chip-B across zones rather than stacking", () => {
    // 6 chip-A + 6 chip-B + 0 unset, exactly 12 on field at 4-4-4.
    // Without the chip penalty there's no preference — all-A bunching
    // is a possible output. With it, each zone should have at least
    // one of each chip when possible.
    const players: Player[] = [];
    for (let i = 0; i < 6; i++) players.push(p(`a${i}`, "a"));
    for (let i = 0; i < 6; i++) players.push(p(`b${i}`, "b"));

    const chipMap: Record<string, "a" | "b" | null> = {};
    for (const pl of players) chipMap[pl.id] = pl.chip ?? null;

    const lineup = suggestStartingLineup(
      players,
      {},
      42, // arbitrary seed
      zoneCapsFor(12, "zones3"),
      {},
      {},
      {},
      {},
      {},
      chipMap,
    );

    const byZone = chipsByZone(lineup, players);
    // Each zone should contain at least one A and at least one B.
    for (const z of ["back", "mid", "fwd"] as const) {
      expect(byZone[z]).toContain("a");
      expect(byZone[z]).toContain("b");
    }
  });

  it("never blocks placement when one chip outnumbers zones", () => {
    // 8 A + 4 unset. There are only 3 zones; the suggester can't
    // distribute 8 A's evenly. It should still place all 12.
    const players: Player[] = [];
    for (let i = 0; i < 8; i++) players.push(p(`a${i}`, "a"));
    for (let i = 0; i < 4; i++) players.push(p(`u${i}`));

    const chipMap: Record<string, "a" | "b" | null> = {};
    for (const pl of players) chipMap[pl.id] = pl.chip ?? null;

    const lineup = suggestStartingLineup(
      players,
      {},
      0,
      zoneCapsFor(12, "zones3"),
      {},
      {},
      {},
      {},
      {},
      chipMap,
    );

    const onField = lineup.back.length + lineup.mid.length + lineup.fwd.length;
    expect(onField).toBe(12);
  });
});
