// Pure-TS simulation of 10 AFL games (U10, 15-player squad, 12-min
// quarters, 3-min sub interval). Drives suggestStartingLineup at each
// quarter break and suggestSwaps at every sub interval, accumulating
// per-player zone minutes the same way the live store does. After 10
// games it prints per-player totals, the fairness score, and the
// spread.
//
// Not a regression test — this is a research script. It logs to
// stdout and asserts only sanity properties (no NaNs, no negative
// times, total ms equals 4 quarters × quarter length × on-field
// size). Run with:
//   npx vitest run src/lib/__tests__/simulate-fairness.test.ts
//
// The output goes to the test runner's stdout — visible inline in
// `--reporter=verbose` mode.

import { describe, it, expect } from "vitest";
import {
  fairnessScore,
  suggestStartingLineup,
  suggestSwaps,
  zoneTeammatesFromLineup,
  type PlayerZoneMinutes,
  type SeasonAvailability,
  type ZoneCaps,
  type ZoneMinutes,
} from "@/lib/fairness";
import type { Lineup, Player, Zone } from "@/lib/types";

// ─── Constants ─────────────────────────────────────────────────
const SQUAD_SIZE = 15;
const ON_FIELD = 12; // U10 default
const QUARTER_MS = 12 * 60 * 1000;
const QUARTERS_PER_GAME = 4;
const SUB_INTERVAL_MS = 3 * 60 * 1000; // 3 min — typical U10 cadence
const TICK_MS = 30 * 1000; // 30s ticks (granular enough for accurate accounting)
const ZONE_CAPS: ZoneCaps = { back: 4, hback: 0, mid: 4, hfwd: 0, fwd: 4 };
const ACTIVE_ZONES: Zone[] = ["back", "mid", "fwd"];
const NUM_GAMES = 10;

// ─── Helpers ───────────────────────────────────────────────────
function makeSquad(): Player[] {
  return Array.from({ length: SQUAD_SIZE }, (_, i) => ({
    id: `P${(i + 1).toString().padStart(2, "0")}`,
    team_id: "T",
    full_name: `Player${i + 1}`,
    jersey_number: i + 1,
    is_active: true,
    created_by: "owner",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }));
}

function emptyZoneMs(): ZoneMinutes {
  return { back: 0, hback: 0, mid: 0, hfwd: 0, fwd: 0 };
}

function zoneOf(lineup: Lineup, pid: string): Zone | null {
  for (const z of ["back", "hback", "mid", "hfwd", "fwd"] as Zone[]) {
    if (lineup[z].includes(pid)) return z;
  }
  return null;
}

function totalMs(zm: ZoneMinutes): number {
  return zm.back + zm.hback + zm.mid + zm.hfwd + zm.fwd;
}

function fmt(ms: number): string {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

// ─── Game simulation ───────────────────────────────────────────
interface GameResult {
  zoneMs: PlayerZoneMinutes;
  perQuarterZones: Record<string, Zone>[]; // last-quarter zone per player, per quarter
}

function simulateGame(
  squad: Player[],
  seasonZoneMs: PlayerZoneMinutes,
  seasonAvail: Record<string, SeasonAvailability>,
  gameSeed: number,
): GameResult {
  // Per-game zone minutes accumulator.
  const gameZoneMs: PlayerZoneMinutes = {};
  for (const p of squad) gameZoneMs[p.id] = emptyZoneMs();

  // Track the last-quarter zone for each player (drives the
  // suggester's previousQuarterZones / previousZoneTeammates).
  const perQuarterZones: Record<string, Zone>[] = [];
  let previousLineup: Lineup | null = null;
  let previousQuarterZones: Record<string, Zone> = {};
  let previousZoneTeammates: Record<string, Set<string>> = {};

  for (let q = 1; q <= QUARTERS_PER_GAME; q++) {
    // Run the starting-lineup suggester for this quarter.
    const lineup = suggestStartingLineup(
      squad,
      seasonZoneMs,
      gameSeed * 100 + q,
      ZONE_CAPS,
      gameZoneMs,
      {}, // no pinned positions
      previousQuarterZones,
      previousZoneTeammates,
      seasonAvail,
    );

    // Track stint-start ms per on-field player. Reset at each
    // quarter (mirrors the store's beginNextQuarter behaviour).
    const stintStart: Record<string, number> = {};
    const stintZone: Record<string, Zone> = {};
    for (const z of ACTIVE_ZONES) {
      for (const pid of lineup[z]) {
        stintStart[pid] = 0;
        stintZone[pid] = z;
      }
    }

    let elapsed = 0;
    let lastSubAt = 0;
    let swapCount = q * 1000; // deterministic seed component

    while (elapsed < QUARTER_MS) {
      elapsed = Math.min(elapsed + TICK_MS, QUARTER_MS);

      // At each sub interval, run the suggester and apply ALL
      // suggested swaps. This mirrors what the GM would do if they
      // mechanically followed the SwapCard's suggestions.
      if (
        elapsed - lastSubAt >= SUB_INTERVAL_MS &&
        elapsed < QUARTER_MS - TICK_MS
      ) {
        // Build per-player ms-played-this-game-so-far for the suggester.
        const totalsByPlayer: Record<string, number> = {};
        for (const p of squad) totalsByPlayer[p.id] = totalMs(gameZoneMs[p.id]);
        // Add open-stint elapsed for on-field players.
        for (const [pid, start] of Object.entries(stintStart)) {
          totalsByPlayer[pid] += elapsed - start;
        }

        // Per-player per-zone ms played this game (closed stints
        // only — open stints get added at swap-out time).
        const zoneMsByPlayer: Record<string, ZoneMinutes> = {};
        for (const p of squad)
          zoneMsByPlayer[p.id] = { ...gameZoneMs[p.id] };
        for (const [pid, start] of Object.entries(stintStart)) {
          const z = stintZone[pid];
          if (z) zoneMsByPlayer[pid][z] += elapsed - start;
        }

        const suggestions = suggestSwaps(
          lineup,
          totalsByPlayer,
          swapCount++,
          [], // no injuries
          ACTIVE_ZONES,
          [], // no locks
          zoneMsByPlayer,
          {}, // no zone locks
        );

        // Apply each suggested swap. The suggester is supposed to
        // produce a non-overlapping set, but be defensive.
        const swappedThisRound = new Set<string>();
        for (const s of suggestions) {
          if (
            swappedThisRound.has(s.off_player_id) ||
            swappedThisRound.has(s.on_player_id)
          ) {
            continue;
          }
          // Close the off player's open stint.
          const offZone = stintZone[s.off_player_id];
          if (offZone) {
            const start = stintStart[s.off_player_id] ?? elapsed;
            gameZoneMs[s.off_player_id][offZone] += elapsed - start;
            delete stintStart[s.off_player_id];
            delete stintZone[s.off_player_id];
          }
          // Swap them in the lineup arrays.
          lineup[s.zone] = lineup[s.zone].map((p) =>
            p === s.off_player_id ? s.on_player_id : p,
          );
          lineup.bench = [
            ...lineup.bench.filter((p) => p !== s.on_player_id),
            s.off_player_id,
          ];
          // Open the on player's stint.
          stintStart[s.on_player_id] = elapsed;
          stintZone[s.on_player_id] = s.zone;
          swappedThisRound.add(s.off_player_id);
          swappedThisRound.add(s.on_player_id);
        }

        lastSubAt = elapsed;
      }
    }

    // Quarter end — close all open stints.
    for (const [pid, start] of Object.entries(stintStart)) {
      const z = stintZone[pid];
      if (z) gameZoneMs[pid][z] += elapsed - start;
    }

    // Snapshot end-of-Q zones for the next quarter's suggester.
    const endZones: Record<string, Zone> = {};
    for (const z of ACTIVE_ZONES) {
      for (const pid of lineup[z]) endZones[pid] = z;
    }
    perQuarterZones.push(endZones);
    previousLineup = lineup;
    previousQuarterZones = endZones;
    previousZoneTeammates = zoneTeammatesFromLineup(lineup);
  }

  return { zoneMs: gameZoneMs, perQuarterZones };
}

// ─── Run + report ──────────────────────────────────────────────
describe("Fairness algorithm — 10-game simulation", () => {
  it("plays out 10 games and reports per-player + squad fairness", () => {
    const squad = makeSquad();
    const seasonZoneMs: PlayerZoneMinutes = {};
    for (const p of squad) seasonZoneMs[p.id] = emptyZoneMs();
    const seasonAvail: Record<string, SeasonAvailability> = {};
    for (const p of squad)
      seasonAvail[p.id] = { playedQuarters: 0, availableQuarters: 0 };

    const perGameTotals: number[][] = []; // [game][playerIndex] = ms played that game

    for (let g = 1; g <= NUM_GAMES; g++) {
      const result = simulateGame(squad, seasonZoneMs, seasonAvail, g);

      // Roll per-game zone ms into season totals.
      for (const p of squad) {
        const zm = result.zoneMs[p.id];
        for (const z of ACTIVE_ZONES) seasonZoneMs[p.id][z] += zm[z];
      }

      // Roll per-quarter availability/played into season counts.
      // Each quarter every squad member is available; on-field counts
      // as played, bench counts as available-only.
      for (const endZones of result.perQuarterZones) {
        for (const p of squad) {
          seasonAvail[p.id].availableQuarters++;
          if (endZones[p.id]) seasonAvail[p.id].playedQuarters++;
        }
      }

      // Track this game's per-player total ms for the spread report.
      perGameTotals.push(squad.map((p) => totalMs(result.zoneMs[p.id])));
    }

    // ─── Report ───────────────────────────────────────────────
    const lines: string[] = [];
    lines.push("");
    lines.push("=".repeat(72));
    lines.push(`AFL fairness simulation — ${NUM_GAMES} games (U10, 15 squad, 12-min Q, 3-min subs)`);
    lines.push("=".repeat(72));

    // Per-player season totals, sorted by total minutes ascending.
    const rows = squad
      .map((p) => {
        const zm = seasonZoneMs[p.id];
        const total = totalMs(zm);
        return {
          id: p.id,
          total,
          back: zm.back,
          mid: zm.mid,
          fwd: zm.fwd,
          played: seasonAvail[p.id].playedQuarters,
          available: seasonAvail[p.id].availableQuarters,
        };
      })
      .sort((a, b) => b.total - a.total);

    lines.push("");
    lines.push("Per-player totals across all 10 games (sorted, most → least):");
    lines.push(
      "  " +
        ["Player", "Total", "Back", "Mid", "Fwd", "Pl/Av"]
          .map((s) => s.padEnd(8))
          .join(""),
    );
    for (const r of rows) {
      lines.push(
        "  " +
          [
            r.id,
            fmt(r.total),
            fmt(r.back),
            fmt(r.mid),
            fmt(r.fwd),
            `${r.played}/${r.available}`,
          ]
            .map((s) => s.padEnd(8))
            .join(""),
      );
    }

    // Spread metrics.
    const totals = rows.map((r) => r.total);
    const max = Math.max(...totals);
    const min = Math.min(...totals);
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
    const variance =
      totals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / totals.length;
    const stdDev = Math.sqrt(variance);
    const spreadPct = (max - min) / max;

    lines.push("");
    lines.push("Total-minutes spread across the squad:");
    lines.push(`  max ${fmt(max)} | min ${fmt(min)} | mean ${fmt(mean)}`);
    lines.push(
      `  range ${fmt(max - min)} (${(spreadPct * 100).toFixed(1)}% of the most-played player's time)`,
    );
    lines.push(`  std dev ${fmt(stdDev)}`);

    // Per-zone equity: for each player, max/min across the 3 zones
    // (= concentration). Lower = more zone-diverse.
    const zoneSpreadPerPlayer = squad.map((p) => {
      const zm = seasonZoneMs[p.id];
      const zMax = Math.max(zm.back, zm.mid, zm.fwd);
      const zMin = Math.min(zm.back, zm.mid, zm.fwd);
      const t = zm.back + zm.mid + zm.fwd;
      return {
        id: p.id,
        zMax,
        zMin,
        t,
        // Coefficient of variation across the 3 zones for this player
        // — 0 means perfectly balanced, higher means concentrated.
        cv: (() => {
          const vals = [zm.back, zm.mid, zm.fwd];
          const m = vals.reduce((a, b) => a + b, 0) / 3;
          if (m === 0) return 0;
          const v =
            vals.reduce((acc, x) => acc + (x - m) ** 2, 0) / 3;
          return Math.sqrt(v) / m;
        })(),
      };
    });
    const avgCv =
      zoneSpreadPerPlayer.reduce((a, b) => a + b.cv, 0) /
      zoneSpreadPerPlayer.length;
    lines.push("");
    lines.push("Position diversity per player (back/mid/fwd):");
    lines.push(
      `  avg coefficient-of-variation: ${avgCv.toFixed(3)}  (0 = perfect balance, 1+ = heavily concentrated)`,
    );
    const worst = [...zoneSpreadPerPlayer]
      .sort((a, b) => b.cv - a.cv)
      .slice(0, 3);
    lines.push(
      `  most concentrated: ${worst
        .map((w) => `${w.id} cv=${w.cv.toFixed(2)}`)
        .join(", ")}`,
    );

    // Per-game spread (consistency game-to-game).
    const perGameSpreads = perGameTotals.map((gameTotals) => {
      const m = Math.max(...gameTotals);
      const n = Math.min(...gameTotals);
      return { max: m, min: n, range: m - n };
    });
    lines.push("");
    lines.push("Per-game spread (max minus min minutes within a single game):");
    perGameSpreads.forEach((s, i) => {
      lines.push(
        `  Game ${(i + 1).toString().padStart(2)}: max ${fmt(s.max)}, min ${fmt(s.min)}, range ${fmt(s.range)}`,
      );
    });

    // The library's own fairness score (0-100).
    const score = fairnessScore(seasonZoneMs);
    lines.push("");
    lines.push(`fairnessScore() (library): ${score}/100`);

    lines.push("=".repeat(72));
    lines.push("");

    // Print to stdout (vitest captures and surfaces under verbose).
    // eslint-disable-next-line no-console
    console.log(lines.join("\n"));

    // ─── Sanity assertions ────────────────────────────────────
    // Total field-minutes across the squad should equal exactly
    // ON_FIELD × QUARTER_MS × QUARTERS_PER_GAME × NUM_GAMES.
    const expectedTotal =
      ON_FIELD * QUARTER_MS * QUARTERS_PER_GAME * NUM_GAMES;
    const actualTotal = rows.reduce((a, b) => a + b.total, 0);
    expect(actualTotal).toBe(expectedTotal);

    // No negative or NaN totals.
    for (const r of rows) {
      expect(r.total).toBeGreaterThan(0);
      expect(Number.isFinite(r.total)).toBe(true);
    }
  });
});
