// WR-01 — season-diversity unit mismatch regression.
//
// `owed()` in fairness.ts grants a SEASON_DIVERSITY nudge (+500) toward any
// zone the player has played for LESS than one full period all season. The
// threshold compared `seasonMins` (the season map, in MINUTES — produced by
// gameZoneMinutes, which divides ms by 60000) against `fullPeriodMs` (the
// period length in MILLISECONDS, default 720000). Minutes vs milliseconds:
// 720000 is so large that EVERY realistic season total is below it, so the
// season-diversity bonus fired for EVERY zone unconditionally — it could
// never distinguish an over-played zone from an under-played one. The nudge
// was effectively always-on, defeating its purpose.
//
// The fix compares minutes against minutes: `seasonMins < fullPeriodMs/60000`
// (= `< 12` for the default 12-minute period). After the fix, a zone the
// player has logged >= a full period in NO LONGER gets the diversity bonus,
// so an under-played zone can finally win.
//
// This test is RED against the pre-fix code (asserts "fwd", pre-fix yields
// "back") and GREEN after the unit fix. It does NOT touch subInterval.

import { describe, expect, it } from "vitest";
import { suggestStartingLineup, type PlayerZoneMinutes } from "@/lib/fairness";
import type { Player, Zone } from "@/lib/types";

function makePlayer(id: string): Player {
  return {
    id,
    team_id: "T",
    full_name: id,
    jersey_number: null,
    is_active: true,
    created_by: "owner",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function zoneOf(
  lineup: { back: string[]; mid: string[]; fwd: string[] },
  id: string,
): Zone | null {
  if (lineup.back.includes(id)) return "back";
  if (lineup.mid.includes(id)) return "mid";
  if (lineup.fwd.includes(id)) return "fwd";
  return null;
}

describe("suggestStartingLineup — season diversity uses MINUTES, not milliseconds (WR-01)", () => {
  it("does not award the season-diversity bonus to a zone already played >= a full period", () => {
    // SINGLE player, TWO open zones (back, fwd) — placement is fully
    // deterministic (no competition, no shuffle tie-break matters because
    // the score gap is decisive). The ONLY term that differs between the
    // pre-fix and post-fix runs is the season-diversity bonus on `back`.
    const all = [makePlayer("P")];
    const caps = { back: 1, hback: 0, mid: 0, hfwd: 0, fwd: 1 };

    // Season totals in MINUTES (the production unit). P has played 1100 min
    // of back (massively over a 12-min period) and only 2 min of fwd.
    const season: PlayerZoneMinutes = {
      P: { back: 1100, hback: 0, mid: 0, hfwd: 0, fwd: 2 },
    };

    // P ended last quarter in fwd → fwd carries a -800 same-as-last-Q penalty,
    // working AGAINST the correct answer. This is deliberate: it proves the
    // season-diversity term (not some incidental tie-break) is what flips the
    // placement once the unit bug is fixed.
    const previousQuarterZones: Record<string, Zone> = { P: "fwd" };

    const lineup = suggestStartingLineup(
      all,
      season,
      0, // seed
      caps,
      {}, // currentGame — fresh, both zones get the +1000 in-game bonus
      {}, // pinnedPositions
      previousQuarterZones,
      {}, // previousZoneTeammates
      {}, // _seasonAvail
      {}, // chipByPlayerId
      {}, // chipModeByKey
      12 * 60 * 1000, // fullPeriodMs (720000) — the production period length in MS
    );

    // Score walk-through (avgPerZone = (1100 + 2) / 2 = 551):
    //   back: inGame +1000, sameAsLastQ 0, fairness max(0,551-1100)=0
    //   fwd : inGame +1000, sameAsLastQ -800, fairness max(0,551-2)=549
    //
    // PRE-fix (bug): both zones get the +500 season bonus (1100 < 720000 and
    //   2 < 720000), so back = 1500 and fwd = 1249 → P wrongly steered to
    //   back, the zone he has played all season.
    // POST-fix: only fwd gets +500 (2 < 12; 1100 is NOT < 12), so back = 1000
    //   and fwd = 1249 → P correctly steered to the under-played fwd zone.
    expect(zoneOf(lineup, "P")).toBe("fwd");
  });
});
