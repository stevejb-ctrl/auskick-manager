// Steve flagged: at quarter 4, some players have spent the whole
// game in one zone (John L → CEN all game; Bryson B → FWD; Robbie R
// → BCK). The fairness algorithm is supposed to nudge a player out
// of their last-quarter zone via -SAME_AS_LAST_Q (-800) and pull
// them into a fresh zone via +IN_GAME_DIVERSITY (+1000) — combined
// these should make staying put cost ~1800 points compared to
// rotating. Steve suspects the chip-spread / chip-group penalty
// added in Phase D may have broken this.
//
// This test pins the property down. We simulate four quarters of
// suggester-only placements (no rolling subs — just the Q-break
// suggester, which is the slice of behaviour Steve described) and
// assert that no player ends up in the same zone for all four
// quarters when there's flex in the squad.

import { describe, it, expect } from "vitest";
import {
  suggestStartingLineup,
  zoneTeammatesFromLineup,
  ALL_ZONES,
  type PlayerZoneMinutes,
  type ZoneCaps,
  type ZoneMinutes,
} from "@/lib/fairness";
import type { Lineup, Player, Zone } from "@/lib/types";

const ZONE_CAPS: ZoneCaps = { back: 4, hback: 0, mid: 4, hfwd: 0, fwd: 4 };
const ACTIVE_ZONES: Zone[] = ["back", "mid", "fwd"];
const QUARTER_MS = 12 * 60 * 1000;

function makeSquad(
  size: number,
  chipMap: Record<number, "a" | "b" | "c"> = {},
): Player[] {
  return Array.from({ length: size }, (_, i) => ({
    id: `P${(i + 1).toString().padStart(2, "0")}`,
    team_id: "T",
    full_name: `Player${i + 1}`,
    jersey_number: i + 1,
    is_active: true,
    chip: chipMap[i] ?? null,
    created_by: "u",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }));
}

function emptyZM(): ZoneMinutes {
  return { back: 0, hback: 0, mid: 0, hfwd: 0, fwd: 0 };
}

function zoneOf(lineup: Lineup, pid: string): Zone | null {
  for (const z of ALL_ZONES) {
    if (lineup[z].includes(pid)) return z;
  }
  return null;
}

interface SimResult {
  /** Per-quarter zone for each player (null = on bench that quarter). */
  perQuarterZone: Record<string, (Zone | null)[]>;
}

function simulateFourQuartersNoSubs(
  squad: Player[],
  chipByPlayerId: Record<string, "a" | "b" | "c" | null | undefined>,
  chipModeByKey: Partial<Record<"a" | "b" | "c", "split" | "group">>,
): SimResult {
  const perQuarter: Lineup[] = [];
  const seasonZoneMs: PlayerZoneMinutes = {};
  for (const p of squad) seasonZoneMs[p.id] = emptyZM();

  let prevQuarterZones: Record<string, Zone> = {};
  let prevZoneTeammates: Record<string, Set<string>> = {};
  // Per-player accumulated game ms by zone (drives in-game-diversity).
  const gameZoneMs: PlayerZoneMinutes = {};
  for (const p of squad) gameZoneMs[p.id] = emptyZM();

  for (let q = 1; q <= 4; q++) {
    const lineup = suggestStartingLineup(
      squad,
      seasonZoneMs,
      q * 1000 + squad.length, // mirrors QuarterBreak's seed shape
      ZONE_CAPS,
      gameZoneMs,
      {}, // no pinned positions
      prevQuarterZones,
      prevZoneTeammates,
      {}, // no season availability
      chipByPlayerId,
      chipModeByKey,
    );
    perQuarter.push(lineup);

    // Add a full quarter's worth of ms to each on-field player's
    // zone — same as if no rolling subs happened.
    const endZones: Record<string, Zone> = {};
    for (const z of ACTIVE_ZONES) {
      for (const pid of lineup[z]) {
        gameZoneMs[pid][z] += QUARTER_MS;
        endZones[pid] = z;
      }
    }
    prevQuarterZones = endZones;
    prevZoneTeammates = zoneTeammatesFromLineup(lineup);
  }

  // Build per-player history.
  const perQuarterZone: Record<string, (Zone | null)[]> = {};
  for (const p of squad) perQuarterZone[p.id] = [];
  for (const lineup of perQuarter) {
    for (const p of squad) {
      perQuarterZone[p.id].push(zoneOf(lineup, p.id));
    }
  }
  return { perQuarterZone };
}

describe("Rotation across quarters", () => {
  it("with no chips, no on-field player stays in the same zone all 4 quarters (12-player squad)", () => {
    const squad = makeSquad(12);
    const chipMap: Record<string, "a" | "b" | "c" | null | undefined> = {};
    for (const p of squad) chipMap[p.id] = null;

    const { perQuarterZone } = simulateFourQuartersNoSubs(squad, chipMap, {});

    const stuck: string[] = [];
    for (const p of squad) {
      const zones = perQuarterZone[p.id];
      // Skip players who weren't on field every quarter.
      if (zones.some((z) => z === null)) continue;
      const allSame = zones.every((z) => z === zones[0]);
      if (allSame) stuck.push(`${p.id} stuck in ${zones[0]}`);
    }
    expect(stuck).toEqual([]);
  });

  it("with mixed chips (3 split A, 3 split B, 6 unset), no on-field player stays in the same zone all 4 quarters", () => {
    const squad = makeSquad(12, {
      0: "a", 1: "a", 2: "a",
      3: "b", 4: "b", 5: "b",
    });
    const chipMap: Record<string, "a" | "b" | "c" | null | undefined> = {};
    for (const p of squad) chipMap[p.id] = p.chip ?? null;

    const { perQuarterZone } = simulateFourQuartersNoSubs(squad, chipMap, {
      a: "split",
      b: "split",
    });

    const stuck: string[] = [];
    for (const p of squad) {
      const zones = perQuarterZone[p.id];
      if (zones.some((z) => z === null)) continue;
      const allSame = zones.every((z) => z === zones[0]);
      if (allSame) stuck.push(`${p.id} (${p.chip ?? "—"}) stuck in ${zones[0]}`);
    }
    expect(stuck).toEqual([]);
  });

  it("with group-mode chips, chip-mates may stick TOGETHER but not all 4 quarters in the same zone", () => {
    // Group mode pulls chip-mates into one zone, but the
    // SAME_AS_LAST_Q penalty (-800) should still rotate the whole
    // cluster collectively. Steve's bug: an UN-chipped player got
    // stuck in their last-quarter zone all four quarters because
    // the group-mode chip-A's clustered into another zone, leaving
    // the un-chipped player's Q1 zone-mates dispersed across the
    // remaining zones in a way that maxed out the partnership
    // penalty in the rotation-friendly zones. Capping partnership
    // at IN_GAME_DIVERSITY + SEASON_DIVERSITY (1500) fixes it.
    const squad = makeSquad(12, { 0: "a", 1: "a", 2: "a", 3: "a" });
    const chipMap: Record<string, "a" | "b" | "c" | null | undefined> = {};
    for (const p of squad) chipMap[p.id] = p.chip ?? null;

    const { perQuarterZone } = simulateFourQuartersNoSubs(squad, chipMap, {
      a: "group",
    });

    const stuck: string[] = [];
    for (const p of squad) {
      const zones = perQuarterZone[p.id];
      if (zones.some((z) => z === null)) continue;
      const allSame = zones.every((z) => z === zones[0]);
      if (allSame) stuck.push(`${p.id} (${p.chip ?? "—"}) stuck in ${zones[0]}`);
    }
    expect(stuck).toEqual([]);
  });
});
