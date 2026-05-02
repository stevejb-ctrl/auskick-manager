// Realistic 10-game simulation: attendance variance (kids miss
// games), in-game injuries, mid-quarter loans, late arrivals. Seeded
// RNG so results are reproducible.
//
// Run with:
//   npx vitest run src/lib/__tests__/simulate-fairness-realistic.test.ts --reporter=verbose
//
// Per-game pattern (each driven by a seeded LCG so the trace is
// stable across runs):
//   - Attendance: each squad member 88% chance to attend.
//   - Late arrival: 25% of absent players arrive at start of Q2.
//   - Injuries: per on-field player per minute, 0.05% injury chance
//     (~0.3 injuries per game on avg).
//   - Loans: 30% chance of 1 loan per game, lasting one quarter.
//
// The simulator drives the same suggestStartingLineup / suggestSwaps
// path the live UI uses, plus exclusions for injured + loaned ids.

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
const ON_FIELD = 12;
const QUARTER_MS = 12 * 60 * 1000;
const QUARTERS_PER_GAME = 4;
const SUB_INTERVAL_MS = 3 * 60 * 1000;
const TICK_MS = 30 * 1000;
const ZONE_CAPS: ZoneCaps = { back: 4, hback: 0, mid: 4, hfwd: 0, fwd: 4 };
const ACTIVE_ZONES: Zone[] = ["back", "mid", "fwd"];
const NUM_GAMES = 10;

// Real-world parameters.
const ATTEND_RATE = 0.88;          // per-player per-game attendance
const LATE_ARRIVAL_RATE = 0.25;    // share of absent players who arrive at Q2 instead
const INJURY_PER_PLAYER_PER_MIN = 0.0005; // 0.05% chance per on-field player per minute
const LOAN_GAME_PROB = 0.30;       // 30% of games include a 1-quarter loan
const SIM_SEED = 42;               // master seed — change to vary the trace

// ─── Seeded RNG (LCG; matches the style used in fairness.ts) ───
function makeRng(seed: number) {
  let s = (seed | 0) >>> 0;
  return {
    next(): number {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 0x100000000;
    },
    bool(p: number): boolean {
      return this.next() < p;
    },
    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(this.next() * arr.length)];
    },
  };
}

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

function totalMs(zm: ZoneMinutes): number {
  return zm.back + zm.hback + zm.mid + zm.hfwd + zm.fwd;
}

function fmt(ms: number): string {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

// ─── Per-game disruption plan ──────────────────────────────────
interface GamePlan {
  attended: Set<string>;
  lateArrivals: Set<string>;            // arrive at start of Q2
  injuriesByQuarter: Map<number, string[]>; // quarter (1-4) → player ids who get injured during it
  loanedThisQuarter: number | null;     // 1-4 or null
  loanedPlayerId: string | null;
}

function makeGamePlan(squad: Player[], seed: number): GamePlan {
  const rng = makeRng(seed);
  const attended = new Set<string>();
  const absentees: string[] = [];
  for (const p of squad) {
    if (rng.bool(ATTEND_RATE)) attended.add(p.id);
    else absentees.push(p.id);
  }

  // Late arrivals: convert some absentees into Q2-late.
  const lateArrivals = new Set<string>();
  for (const id of absentees) {
    if (rng.bool(LATE_ARRIVAL_RATE)) {
      lateArrivals.add(id);
      attended.add(id); // they DID attend, just late
    }
  }

  // Injuries: roll per (on-field player × minute) at simulation
  // time. We pre-compute by sampling the rng with a known cadence
  // so the plan is deterministic. The simulator picks injured ids
  // from the lineup at the moment, so we just record per-quarter
  // counts here and pick targets at simulation time.
  const injuriesByQuarter = new Map<number, string[]>();
  for (let q = 1; q <= QUARTERS_PER_GAME; q++) {
    const expectedInjuries = ON_FIELD * 12 * INJURY_PER_PLAYER_PER_MIN;
    // Use rng to convert expected count into a discrete count
    // (approximation — Bernoulli per minute would be more accurate
    // but the per-minute probability is tiny so a simple
    // "did at least one fire?" suffices for realism).
    const fired = rng.bool(Math.min(0.95, expectedInjuries));
    injuriesByQuarter.set(q, fired ? ["@TBD"] : []);
  }

  // Loans: at most one per game.
  let loanedThisQuarter: number | null = null;
  if (rng.bool(LOAN_GAME_PROB)) {
    loanedThisQuarter = 1 + Math.floor(rng.next() * QUARTERS_PER_GAME);
  }

  return {
    attended,
    lateArrivals,
    injuriesByQuarter,
    loanedThisQuarter,
    loanedPlayerId: null, // picked at simulation time (eligible bench player)
  };
}

// ─── Game simulation ───────────────────────────────────────────
interface GameResult {
  attended: Set<string>;
  zoneMs: PlayerZoneMinutes;
  perQuarterZones: Record<string, Zone>[];
  injuredCount: number;
  loanedCount: number;
  lateCount: number;
}

function simulateGame(
  squad: Player[],
  seasonZoneMs: PlayerZoneMinutes,
  seasonAvail: Record<string, SeasonAvailability>,
  plan: GamePlan,
  gameSeed: number,
): GameResult {
  const rng = makeRng(gameSeed * 7919);
  const gameZoneMs: PlayerZoneMinutes = {};
  for (const p of squad) gameZoneMs[p.id] = emptyZoneMs();

  // The squad available to the suggester evolves: starts as
  // attended-and-not-late, adds late arrivals at Q2, removes
  // injured / loaned players.
  const presentIds = new Set<string>(
    [...plan.attended].filter((id) => !plan.lateArrivals.has(id)),
  );
  const injuredIds = new Set<string>();
  const loanedIds = new Set<string>();

  let previousQuarterZones: Record<string, Zone> = {};
  let previousZoneTeammates: Record<string, Set<string>> = {};
  const perQuarterZones: Record<string, Zone>[] = [];

  for (let q = 1; q <= QUARTERS_PER_GAME; q++) {
    // Q2: bring in late arrivals.
    if (q === 2) {
      for (const id of plan.lateArrivals) presentIds.add(id);
    }
    // End of the loaned quarter: bring the loaned player back.
    if (plan.loanedThisQuarter !== null && q === plan.loanedThisQuarter + 1) {
      if (plan.loanedPlayerId) loanedIds.delete(plan.loanedPlayerId);
    }

    const availablePlayers = squad.filter(
      (p) =>
        presentIds.has(p.id) &&
        !injuredIds.has(p.id) &&
        !loanedIds.has(p.id),
    );

    const lineup = suggestStartingLineup(
      availablePlayers,
      seasonZoneMs,
      gameSeed * 100 + q,
      ZONE_CAPS,
      gameZoneMs,
      {},
      previousQuarterZones,
      previousZoneTeammates,
      seasonAvail,
    );

    // Pick a loan victim if this is the loan quarter.
    if (
      plan.loanedThisQuarter === q &&
      plan.loanedPlayerId === null &&
      lineup.bench.length > 0
    ) {
      // Loan an eligible bench player at the start of the quarter.
      const idx = Math.floor(rng.next() * lineup.bench.length);
      plan.loanedPlayerId = lineup.bench[idx];
      loanedIds.add(plan.loanedPlayerId);
      // Remove them from bench too — they're with the opposition.
      lineup.bench.splice(idx, 1);
    }

    // Stint tracking.
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
    let swapCount = q * 1000;

    // Schedule injuries: pick an injury time in this quarter if
    // the plan says one fires.
    const willInjure = (plan.injuriesByQuarter.get(q) ?? []).length > 0;
    const injuryAt = willInjure
      ? Math.floor(rng.next() * (QUARTER_MS - TICK_MS))
      : null;

    while (elapsed < QUARTER_MS) {
      elapsed = Math.min(elapsed + TICK_MS, QUARTER_MS);

      // Injury fires here?
      if (injuryAt !== null && elapsed >= injuryAt && injuryAt > -1) {
        // Pick a random on-field player.
        const onField: string[] = [];
        for (const z of ACTIVE_ZONES) onField.push(...lineup[z]);
        if (onField.length > 0) {
          const target = onField[Math.floor(rng.next() * onField.length)];
          // Close their stint.
          const z = stintZone[target];
          if (z) {
            const start = stintStart[target] ?? elapsed;
            gameZoneMs[target][z] += elapsed - start;
            delete stintStart[target];
            delete stintZone[target];
            lineup[z] = lineup[z].filter((p) => p !== target);
          }
          injuredIds.add(target);
          plan.injuriesByQuarter.set(q, [target]); // record for report
          // Replace from bench (mirrors NetballLiveGame's vacate-and-prompt).
          if (lineup.bench.length > 0 && z) {
            const replacement = lineup.bench[0];
            lineup.bench = lineup.bench.slice(1);
            lineup[z].push(replacement);
            stintStart[replacement] = elapsed;
            stintZone[replacement] = z;
          }
        }
        // Block re-fire.
        plan.injuriesByQuarter.set(q, plan.injuriesByQuarter.get(q) ?? []);
      }

      // Sub interval — apply all suggested swaps.
      if (
        elapsed - lastSubAt >= SUB_INTERVAL_MS &&
        elapsed < QUARTER_MS - TICK_MS
      ) {
        const totalsByPlayer: Record<string, number> = {};
        for (const p of squad)
          totalsByPlayer[p.id] = totalMs(gameZoneMs[p.id]);
        for (const [pid, start] of Object.entries(stintStart)) {
          totalsByPlayer[pid] += elapsed - start;
        }

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
          [...injuredIds, ...loanedIds],
          ACTIVE_ZONES,
          [],
          zoneMsByPlayer,
          {},
        );

        const swapped = new Set<string>();
        for (const s of suggestions) {
          if (
            swapped.has(s.off_player_id) ||
            swapped.has(s.on_player_id) ||
            injuredIds.has(s.on_player_id) ||
            loanedIds.has(s.on_player_id)
          ) {
            continue;
          }
          const offZone = stintZone[s.off_player_id];
          if (offZone) {
            const start = stintStart[s.off_player_id] ?? elapsed;
            gameZoneMs[s.off_player_id][offZone] += elapsed - start;
            delete stintStart[s.off_player_id];
            delete stintZone[s.off_player_id];
          }
          lineup[s.zone] = lineup[s.zone].map((p) =>
            p === s.off_player_id ? s.on_player_id : p,
          );
          lineup.bench = [
            ...lineup.bench.filter((p) => p !== s.on_player_id),
            s.off_player_id,
          ];
          stintStart[s.on_player_id] = elapsed;
          stintZone[s.on_player_id] = s.zone;
          swapped.add(s.off_player_id);
          swapped.add(s.on_player_id);
        }
        lastSubAt = elapsed;
      }
    }

    // Close all open stints.
    for (const [pid, start] of Object.entries(stintStart)) {
      const z = stintZone[pid];
      if (z) gameZoneMs[pid][z] += elapsed - start;
    }

    const endZones: Record<string, Zone> = {};
    for (const z of ACTIVE_ZONES) {
      for (const pid of lineup[z]) endZones[pid] = z;
    }
    perQuarterZones.push(endZones);
    previousQuarterZones = endZones;
    previousZoneTeammates = zoneTeammatesFromLineup(lineup);
  }

  // Tally up disruption counts for the report.
  let injuredCount = 0;
  for (const arr of plan.injuriesByQuarter.values()) injuredCount += arr.filter((s) => s !== "@TBD").length;
  const loanedCount = plan.loanedPlayerId ? 1 : 0;
  const lateCount = plan.lateArrivals.size;

  return {
    attended: plan.attended,
    zoneMs: gameZoneMs,
    perQuarterZones,
    injuredCount,
    loanedCount,
    lateCount,
  };
}

// ─── Run + report ──────────────────────────────────────────────
describe("Fairness algorithm — realistic 10-game simulation", () => {
  it("plays out 10 games with absences/injuries/loans/late arrivals", () => {
    const squad = makeSquad();
    const seasonZoneMs: PlayerZoneMinutes = {};
    for (const p of squad) seasonZoneMs[p.id] = emptyZoneMs();
    const seasonAvail: Record<string, SeasonAvailability> = {};
    for (const p of squad)
      seasonAvail[p.id] = { playedQuarters: 0, availableQuarters: 0 };

    const attendance: Record<string, number> = {}; // games attended
    for (const p of squad) attendance[p.id] = 0;
    const playedMs: Record<string, number[]> = {}; // [game]
    for (const p of squad) playedMs[p.id] = [];

    const totals = {
      injuriesAcross: 0,
      loansAcross: 0,
      latesAcross: 0,
      absencesAcross: 0,
    };

    for (let g = 1; g <= NUM_GAMES; g++) {
      const plan = makeGamePlan(squad, SIM_SEED + g);
      const result = simulateGame(squad, seasonZoneMs, seasonAvail, plan, SIM_SEED + g);

      // Roll into season totals.
      for (const p of squad) {
        const zm = result.zoneMs[p.id];
        for (const z of ACTIVE_ZONES) seasonZoneMs[p.id][z] += zm[z];
        if (result.attended.has(p.id)) attendance[p.id]++;
        playedMs[p.id].push(totalMs(zm));
      }
      // Availability: quarters attended (if attended the game,
      // every quarter counts as available).
      for (let q = 0; q < QUARTERS_PER_GAME; q++) {
        const endZones = result.perQuarterZones[q];
        for (const p of squad) {
          // Count this quarter as "available" only if the player was
          // attending at this quarter (presence depends on late arrival).
          if (!result.attended.has(p.id)) continue;
          // Late arrivals: not available for Q1.
          if (q === 0 && plan.lateArrivals.has(p.id)) continue;
          seasonAvail[p.id].availableQuarters++;
          if (endZones[p.id]) seasonAvail[p.id].playedQuarters++;
        }
      }

      totals.injuriesAcross += result.injuredCount;
      totals.loansAcross += result.loanedCount;
      totals.latesAcross += result.lateCount;
      totals.absencesAcross += SQUAD_SIZE - result.attended.size;
    }

    // ─── Report ──────────────────────────────────────────────
    const lines: string[] = [];
    lines.push("");
    lines.push("=".repeat(76));
    lines.push("AFL fairness simulation — REALISTIC (absences, injuries, loans, late arrivals)");
    lines.push(`${NUM_GAMES} games, U10, 15 squad, 12-min Q, 3-min subs, seed=${SIM_SEED}`);
    lines.push("=".repeat(76));

    // Per-player totals.
    const rows = squad
      .map((p) => {
        const zm = seasonZoneMs[p.id];
        const total = totalMs(zm);
        const attended = attendance[p.id];
        const avgPerGame = attended > 0 ? total / attended : 0;
        return {
          id: p.id,
          total,
          attended,
          avgPerGame,
          back: zm.back,
          mid: zm.mid,
          fwd: zm.fwd,
          played: seasonAvail[p.id].playedQuarters,
          available: seasonAvail[p.id].availableQuarters,
        };
      })
      .sort((a, b) => b.avgPerGame - a.avgPerGame);

    lines.push("");
    lines.push("Per-player season summary (sorted by avg minutes per attended game):");
    lines.push(
      "  " +
        ["Player", "Att", "Total", "Avg/Gm", "Back", "Mid", "Fwd", "Q-Pl/Av"]
          .map((s) => s.padEnd(9))
          .join(""),
    );
    for (const r of rows) {
      lines.push(
        "  " +
          [
            r.id,
            `${r.attended}/${NUM_GAMES}`,
            fmt(r.total),
            fmt(r.avgPerGame),
            fmt(r.back),
            fmt(r.mid),
            fmt(r.fwd),
            `${r.played}/${r.available}`,
          ]
            .map((s) => s.padEnd(9))
            .join(""),
      );
    }

    // Disruption summary.
    lines.push("");
    lines.push("Disruptions across the 10 games:");
    lines.push(`  total absences:      ${totals.absencesAcross}  (avg ${(totals.absencesAcross / NUM_GAMES).toFixed(1)} per game out of ${SQUAD_SIZE})`);
    lines.push(`  total late arrivals: ${totals.latesAcross}`);
    lines.push(`  total injuries:      ${totals.injuriesAcross}`);
    lines.push(`  total loans:         ${totals.loansAcross}`);

    // Spread on AVERAGE-PER-ATTENDED-GAME (the right fairness lens
    // when attendance varies — not punishing absent kids).
    const avgs = rows.map((r) => r.avgPerGame);
    const max = Math.max(...avgs);
    const min = Math.min(...avgs);
    const mean = avgs.reduce((a, b) => a + b, 0) / avgs.length;
    const variance =
      avgs.reduce((acc, v) => acc + (v - mean) ** 2, 0) / avgs.length;
    const stdDev = Math.sqrt(variance);
    const spreadPct = max > 0 ? (max - min) / max : 0;

    lines.push("");
    lines.push("Fairness lens — minutes per ATTENDED game (so absences don't drag a kid down):");
    lines.push(`  max ${fmt(max)} | min ${fmt(min)} | mean ${fmt(mean)}`);
    lines.push(
      `  range ${fmt(max - min)} (${(spreadPct * 100).toFixed(1)}% of the most-played kid's avg)`,
    );
    lines.push(`  std dev ${fmt(stdDev)}`);

    // Position diversity.
    const cvs = squad.map((p) => {
      const zm = seasonZoneMs[p.id];
      const vals = [zm.back, zm.mid, zm.fwd];
      const m = vals.reduce((a, b) => a + b, 0) / 3;
      if (m === 0) return 0;
      const v = vals.reduce((acc, x) => acc + (x - m) ** 2, 0) / 3;
      return Math.sqrt(v) / m;
    });
    const avgCv = cvs.reduce((a, b) => a + b, 0) / cvs.length;
    lines.push("");
    lines.push("Position diversity per player (back/mid/fwd):");
    lines.push(
      `  avg coefficient-of-variation: ${avgCv.toFixed(3)}  (0 = perfect balance)`,
    );

    // Library fairness score.
    const score = fairnessScore(seasonZoneMs);
    lines.push("");
    lines.push(`fairnessScore() (library, season totals): ${score}/100`);

    // Per-game per-player ms (variance check — does any single game
    // give one kid 30 min and another 10 min when they both attended?).
    const inAttendedSpreads: number[] = [];
    for (let g = 0; g < NUM_GAMES; g++) {
      const attendedGameTotals: number[] = [];
      for (const p of squad) {
        if (playedMs[p.id][g] > 0) attendedGameTotals.push(playedMs[p.id][g]);
      }
      if (attendedGameTotals.length > 1) {
        const m = Math.max(...attendedGameTotals);
        const n = Math.min(...attendedGameTotals);
        inAttendedSpreads.push(m - n);
      }
    }
    const avgPerGameSpread =
      inAttendedSpreads.reduce((a, b) => a + b, 0) / inAttendedSpreads.length;
    const maxPerGameSpread = Math.max(...inAttendedSpreads);
    lines.push("");
    lines.push("Within-game spread (max-min minutes among kids who actually attended):");
    lines.push(`  avg per-game range: ${fmt(avgPerGameSpread)}`);
    lines.push(`  worst single-game range: ${fmt(maxPerGameSpread)}`);

    lines.push("=".repeat(76));
    lines.push("");

    // eslint-disable-next-line no-console
    console.log(lines.join("\n"));

    // ─── Sanity ──────────────────────────────────────────────
    // Total field-minutes is bounded above by ON_FIELD × QUARTER_MS
    // × QUARTERS × NUM_GAMES — equality only holds when every spot
    // is filled the entire game. Under realistic disruptions
    // (absences + injuries that exhaust the bench) the team can
    // play short, so we just check the bound + positive totals.
    const upperBound =
      ON_FIELD * QUARTER_MS * QUARTERS_PER_GAME * NUM_GAMES;
    const actualTotal = rows.reduce((a, b) => a + b.total, 0);
    expect(actualTotal).toBeGreaterThan(0);
    expect(actualTotal).toBeLessThanOrEqual(upperBound);
    for (const r of rows) {
      expect(Number.isFinite(r.total)).toBe(true);
      expect(r.total).toBeGreaterThanOrEqual(0);
    }
    // Report the gap as another disruption-impact signal.
    const shortMs = upperBound - actualTotal;
    // eslint-disable-next-line no-console
    console.log(
      `\nField-time accounting: ${fmt(actualTotal)} of ${fmt(upperBound)} possible (${((actualTotal / upperBound) * 100).toFixed(1)}% utilisation). Lost field-minutes: ${fmt(shortMs)} — when absences + injuries drained the bench, the team played short.`,
    );
  });
});
