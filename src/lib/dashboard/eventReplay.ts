/**
 * Replay a single game's event log into a GameSnapshot.
 *
 * All time values are in milliseconds relative to each quarter's start
 * (i.e. elapsed_ms=0 = quarter kick-off). The same convention the live
 * game store uses so swap/quarter_end metadata maps directly.
 */
import { normalizeLineup, type GameEvent, type Lineup, type Zone } from "@/lib/types";
import { ALL_ZONES } from "@/lib/fairness";
import { type GameSnapshot, type LineupPeriod, type ZoneMs, emptyZoneMs } from "./types";

type ActiveStint = { zone: Zone; startMs: number };

function cloneZonePlayers(lineup: Lineup): Record<Zone, string[]> {
  return {
    back: [...lineup.back],
    hback: [...lineup.hback],
    mid: [...lineup.mid],
    hfwd: [...lineup.hfwd],
    fwd: [...lineup.fwd],
  };
}

function zoneOf(lineup: Lineup, playerId: string): Zone | null {
  for (const z of ALL_ZONES) {
    if (lineup[z].includes(playerId)) return z;
  }
  return null;
}

/** Replay one game's sorted events into a full snapshot. */
export function replayGame(gameId: string, events: GameEvent[]): GameSnapshot {
  const sorted = [...events].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );

  const playerZoneMs: Record<string, ZoneMs> = {};
  const playerGoals: Record<string, number> = {};
  const playerBehinds: Record<string, number> = {};
  const subsIn: Record<string, number> = {};
  const subsOut: Record<string, number> = {};
  const teamScoreByQtr: Record<number, { goals: number; behinds: number }> = {};
  const oppScoreByQtr: Record<number, { goals: number; behinds: number }> = {};
  const lineupPeriods: LineupPeriod[] = [];
  const playerIds: string[] = [];

  let lineup: Lineup = { back: [], hback: [], mid: [], hfwd: [], fwd: [], bench: [] };
  const stints: Record<string, ActiveStint> = {};
  let currentQuarter = 0;
  let periodStartMs = 0;
  let quarterActive = false;

  // Goals collected during active quarters — assigned to periods after all
  // events are processed (goals and swaps may interleave in created_at order).
  const pendingGoals: { kind: "for" | "against"; quarter: number; elapsedMs: number }[] = [];

  function addZoneMs(pid: string, zone: Zone, ms: number) {
    if (ms <= 0) return;
    playerZoneMs[pid] ??= emptyZoneMs();
    playerZoneMs[pid][zone] += ms;
  }

  function closePeriod(endMs: number) {
    if (!quarterActive || endMs <= periodStartMs) return;
    lineupPeriods.push({
      gameId,
      quarter: currentQuarter,
      startMs: periodStartMs,
      endMs,
      zonePlayers: cloneZonePlayers(lineup),
      goalsFor: 0,
      goalsAgainst: 0,
    });
  }

  for (const ev of sorted) {
    const meta = ev.metadata as Record<string, unknown>;
    const elapsed = typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : 0;

    switch (ev.type) {
      case "lineup_set": {
        const raw = meta.lineup as Partial<Lineup> | undefined;
        if (raw) {
          lineup = normalizeLineup(raw);
          // Track who has ever appeared in a lineup
          for (const z of ALL_ZONES) {
            for (const pid of lineup[z]) {
              if (!playerIds.includes(pid)) playerIds.push(pid);
            }
          }
          for (const pid of lineup.bench) {
            if (!playerIds.includes(pid)) playerIds.push(pid);
          }
        }
        break;
      }

      case "quarter_start": {
        const quarter = typeof meta.quarter === "number" ? meta.quarter : currentQuarter + 1;
        currentQuarter = quarter;
        quarterActive = true;
        periodStartMs = 0;
        // Initialise stints for all on-field players
        for (const z of ALL_ZONES) {
          for (const pid of lineup[z]) {
            stints[pid] = { zone: z, startMs: 0 };
          }
        }
        break;
      }

      case "swap": {
        const off = typeof meta.off_player_id === "string" ? meta.off_player_id : "";
        const on = typeof meta.on_player_id === "string" ? meta.on_player_id : null;
        const zone = meta.zone as Zone | undefined;
        if (!on || !zone) break;

        // Close the period BEFORE mutating lineup so the period records who was on.
        closePeriod(elapsed);
        periodStartMs = elapsed;

        if (off) {
          const stint = stints[off];
          const sz = stint?.zone ?? zone;
          addZoneMs(off, sz, elapsed - (stint?.startMs ?? 0));
          delete stints[off];
          lineup[zone] = lineup[zone].map((p) => (p === off ? on : p));
          lineup.bench = [...lineup.bench.filter((p) => p !== on), off];
          subsOut[off] = (subsOut[off] ?? 0) + 1;
        } else {
          lineup[zone] = [...lineup[zone], on];
          lineup.bench = lineup.bench.filter((p) => p !== on);
        }
        stints[on] = { zone, startMs: elapsed };
        subsIn[on] = (subsIn[on] ?? 0) + 1;
        if (!playerIds.includes(on)) playerIds.push(on);
        break;
      }

      case "quarter_end": {
        const qe = typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : elapsed;
        for (const [pid, stint] of Object.entries(stints)) {
          addZoneMs(pid, stint.zone, qe - stint.startMs);
        }
        // clear stints — don't delete properties, reset object
        for (const key of Object.keys(stints)) delete stints[key];

        closePeriod(qe);
        quarterActive = false;
        break;
      }

      case "goal": {
        if (ev.player_id) {
          playerGoals[ev.player_id] = (playerGoals[ev.player_id] ?? 0) + 1;
        }
        const q = typeof meta.quarter === "number" ? meta.quarter : currentQuarter;
        teamScoreByQtr[q] ??= { goals: 0, behinds: 0 };
        teamScoreByQtr[q].goals++;
        pendingGoals.push({ kind: "for", quarter: q, elapsedMs: elapsed });
        break;
      }

      case "behind": {
        if (ev.player_id) {
          playerBehinds[ev.player_id] = (playerBehinds[ev.player_id] ?? 0) + 1;
        }
        const q = typeof meta.quarter === "number" ? meta.quarter : currentQuarter;
        teamScoreByQtr[q] ??= { goals: 0, behinds: 0 };
        teamScoreByQtr[q].behinds++;
        break;
      }

      case "opponent_goal": {
        const q = typeof meta.quarter === "number" ? meta.quarter : currentQuarter;
        oppScoreByQtr[q] ??= { goals: 0, behinds: 0 };
        oppScoreByQtr[q].goals++;
        pendingGoals.push({ kind: "against", quarter: q, elapsedMs: elapsed });
        break;
      }

      case "opponent_behind": {
        const q = typeof meta.quarter === "number" ? meta.quarter : currentQuarter;
        oppScoreByQtr[q] ??= { goals: 0, behinds: 0 };
        oppScoreByQtr[q].behinds++;
        break;
      }

      case "player_arrived": {
        if (ev.player_id && !lineup.bench.includes(ev.player_id) && !zoneOf(lineup, ev.player_id)) {
          lineup.bench.push(ev.player_id);
          if (!playerIds.includes(ev.player_id)) playerIds.push(ev.player_id);
        }
        break;
      }

      case "injury": {
        const injured = meta.injured !== false;
        if (injured && ev.player_id) {
          const pid = ev.player_id;
          const z = zoneOf(lineup, pid);
          if (z) {
            // Close period before removing player so the period records current lineup.
            closePeriod(elapsed);
            periodStartMs = elapsed;
            const stint = stints[pid];
            addZoneMs(pid, stint?.zone ?? z, elapsed - (stint?.startMs ?? 0));
            delete stints[pid];
            lineup[z] = lineup[z].filter((p) => p !== pid);
            if (!lineup.bench.includes(pid)) lineup.bench.push(pid);
          }
        }
        break;
      }

      case "field_zone_swap": {
        const pidA = ev.player_id;
        const pidB = typeof meta.player_b_id === "string" ? meta.player_b_id : null;
        const zoneA = ALL_ZONES.find((z) => z === meta.zone_a) ?? null;
        const zoneB = ALL_ZONES.find((z) => z === meta.zone_b) ?? null;
        if (pidA && pidB && zoneA && zoneB) {
          closePeriod(elapsed);
          periodStartMs = elapsed;
          lineup[zoneA] = lineup[zoneA].map((p) => (p === pidA ? pidB : p));
          lineup[zoneB] = lineup[zoneB].map((p) => (p === pidB ? pidA : p));
          const stintA = stints[pidA];
          const stintB = stints[pidB];
          addZoneMs(pidA, stintA?.zone ?? zoneA, elapsed - (stintA?.startMs ?? 0));
          addZoneMs(pidB, stintB?.zone ?? zoneB, elapsed - (stintB?.startMs ?? 0));
          stints[pidA] = { zone: zoneB, startMs: elapsed };
          stints[pidB] = { zone: zoneA, startMs: elapsed };
        }
        break;
      }

      case "score_undo": {
        const origType = typeof meta.original_type === "string" ? meta.original_type : "";
        const q = typeof meta.quarter === "number" ? meta.quarter : currentQuarter;
        const pid = ev.player_id;
        if (origType === "goal") {
          if (pid) playerGoals[pid] = Math.max(0, (playerGoals[pid] ?? 0) - 1);
          if (teamScoreByQtr[q]) teamScoreByQtr[q].goals = Math.max(0, teamScoreByQtr[q].goals - 1);
          // Remove last matching pending goal so it isn't assigned to a lineup period
          for (let i = pendingGoals.length - 1; i >= 0; i--) {
            if (pendingGoals[i].kind === "for" && pendingGoals[i].quarter === q) {
              pendingGoals.splice(i, 1);
              break;
            }
          }
        } else if (origType === "behind") {
          if (pid) playerBehinds[pid] = Math.max(0, (playerBehinds[pid] ?? 0) - 1);
          if (teamScoreByQtr[q]) teamScoreByQtr[q].behinds = Math.max(0, teamScoreByQtr[q].behinds - 1);
        } else if (origType === "opponent_goal") {
          if (oppScoreByQtr[q]) oppScoreByQtr[q].goals = Math.max(0, oppScoreByQtr[q].goals - 1);
          for (let i = pendingGoals.length - 1; i >= 0; i--) {
            if (pendingGoals[i].kind === "against" && pendingGoals[i].quarter === q) {
              pendingGoals.splice(i, 1);
              break;
            }
          }
        } else if (origType === "opponent_behind") {
          if (oppScoreByQtr[q]) oppScoreByQtr[q].behinds = Math.max(0, oppScoreByQtr[q].behinds - 1);
        }
        break;
      }
    }
  }

  // Assign pending goals to lineup periods by time
  for (const goal of pendingGoals) {
    for (const period of lineupPeriods) {
      if (
        period.quarter === goal.quarter &&
        period.startMs <= goal.elapsedMs &&
        goal.elapsedMs < period.endMs
      ) {
        if (goal.kind === "for") period.goalsFor++;
        else period.goalsAgainst++;
      }
    }
  }

  return {
    gameId,
    playerZoneMs,
    playerGoals,
    playerBehinds,
    subsIn,
    subsOut,
    teamScoreByQtr,
    oppScoreByQtr,
    lineupPeriods,
    playerIds,
  };
}
