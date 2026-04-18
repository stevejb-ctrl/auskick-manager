// ============================================================
// Fairness engine — pure functions. No Supabase, no React.
//
// Inputs: an array of GameEvents (one team's whole season, or
// a single game). Outputs: zone-minutes per player, suggested
// starting lineups, suggested mid-game swaps.
// ============================================================

import type { GameEvent, Lineup, Player, Zone } from "@/lib/types";

export type ZoneMinutes = { back: number; mid: number; fwd: number };
export type PlayerZoneMinutes = Record<string, ZoneMinutes>;

export const ZONES: Zone[] = ["back", "mid", "fwd"];
const PLAYERS_PER_ZONE = 4;

// ─── Helpers ──────────────────────────────────────────────────
function emptyZM(): ZoneMinutes {
  return { back: 0, mid: 0, fwd: 0 };
}

function zoneOf(lineup: Lineup, playerId: string): Zone | null {
  if (lineup.back.includes(playerId)) return "back";
  if (lineup.mid.includes(playerId)) return "mid";
  if (lineup.fwd.includes(playerId)) return "fwd";
  return null;
}

function cloneLineup(l: Lineup): Lineup {
  return {
    back: [...l.back],
    mid: [...l.mid],
    fwd: [...l.fwd],
    bench: [...l.bench],
  };
}

// ─── Replay one game's events → per-player zone minutes ──────
export function gameZoneMinutes(events: GameEvent[]): PlayerZoneMinutes {
  const sorted = [...events].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );
  const result: PlayerZoneMinutes = {};
  const add = (pid: string, zone: Zone, ms: number) => {
    if (ms <= 0) return;
    result[pid] ??= emptyZM();
    result[pid][zone] += ms / 60000;
  };

  let lineup: Lineup | null = null;
  // For each on-field player this quarter, the elapsed_ms at
  // which their current zone-stint started.
  let stintStart: Record<string, number> = {};

  for (const ev of sorted) {
    const meta = ev.metadata as {
      elapsed_ms?: number;
      quarter?: number;
      lineup?: Lineup;
      off_player_id?: string;
      on_player_id?: string;
      zone?: Zone;
    };
    const elapsed = meta.elapsed_ms ?? 0;

    if (ev.type === "lineup_set" && meta.lineup) {
      lineup = cloneLineup(meta.lineup);
    } else if (ev.type === "quarter_start") {
      stintStart = {};
      if (lineup) {
        for (const p of [...lineup.back, ...lineup.mid, ...lineup.fwd]) {
          stintStart[p] = 0;
        }
      }
    } else if (ev.type === "swap" && lineup && meta.on_player_id && meta.zone) {
      const off = meta.off_player_id ?? "";
      const on = meta.on_player_id;
      const z = meta.zone;
      if (off) {
        add(off, z, elapsed - (stintStart[off] ?? 0));
        delete stintStart[off];
        lineup[z] = lineup[z].map((p) => (p === off ? on : p));
        lineup.bench = [...lineup.bench.filter((p) => p !== on), off];
      } else {
        // Fill event — add to zone from bench, no off stint to close.
        lineup[z] = [...lineup[z], on];
        lineup.bench = lineup.bench.filter((p) => p !== on);
      }
      stintStart[on] = elapsed;
    } else if (ev.type === "quarter_end" && lineup) {
      for (const z of ZONES) {
        for (const p of lineup[z]) {
          add(p, z, elapsed - (stintStart[p] ?? 0));
        }
      }
      stintStart = {};
    } else if (ev.type === "player_arrived" && lineup && ev.player_id) {
      if (!lineup.bench.includes(ev.player_id)) lineup.bench.push(ev.player_id);
    } else if (ev.type === "injury" && lineup && ev.player_id) {
      const pid = ev.player_id;
      const injured = (ev.metadata as { injured?: boolean }).injured ?? true;
      if (injured) {
        const z = zoneOf(lineup, pid);
        if (z) {
          add(pid, z, elapsed - (stintStart[pid] ?? 0));
          delete stintStart[pid];
          lineup[z] = lineup[z].filter((p) => p !== pid);
          if (!lineup.bench.includes(pid)) lineup.bench.push(pid);
        }
      }
    }
  }

  return result;
}

// ─── Sum zone minutes across many games ──────────────────────
export function seasonZoneMinutes(events: GameEvent[]): PlayerZoneMinutes {
  const byGame = new Map<string, GameEvent[]>();
  for (const ev of events) {
    const arr = byGame.get(ev.game_id) ?? [];
    arr.push(ev);
    byGame.set(ev.game_id, arr);
  }
  const total: PlayerZoneMinutes = {};
  byGame.forEach((gameEvents) => {
    const game = gameZoneMinutes(gameEvents);
    for (const [pid, zm] of Object.entries(game)) {
      total[pid] ??= emptyZM();
      total[pid].back += zm.back;
      total[pid].mid += zm.mid;
      total[pid].fwd += zm.fwd;
    }
  });
  return total;
}

// ─── Suggest a starting lineup ───────────────────────────────
// Goal: give each available player minutes in zones they're
// most owed. Greedy assignment: sort available by total season
// minutes ascending (least-played first picks zone first).
export function suggestStartingLineup(
  availablePlayers: Player[],
  season: PlayerZoneMinutes,
  seed: number = 0
): Lineup {
  const lineup: Lineup = { back: [], mid: [], fwd: [], bench: [] };
  if (availablePlayers.length === 0) return lineup;

  const avgPerZone = (() => {
    const zm = Object.values(season);
    if (zm.length === 0) return 0;
    const total = zm.reduce((acc, p) => acc + p.back + p.mid + p.fwd, 0);
    return total / (zm.length * 3);
  })();

  const owed = (pid: string, z: Zone) => {
    const played = season[pid]?.[z] ?? 0;
    return Math.max(0, avgPerZone - played);
  };

  // Shuffle first (random tie-break), then sort by total played — so players
  // with equal minutes get a different order each quarter instead of the
  // same jersey-number tail always landing in the same zone.
  const shuffled = seededShuffle(availablePlayers, seed + 17);
  const sortedPlayers = shuffled.sort((a, b) => {
    const aTotal = (season[a.id]?.back ?? 0) + (season[a.id]?.mid ?? 0) + (season[a.id]?.fwd ?? 0);
    const bTotal = (season[b.id]?.back ?? 0) + (season[b.id]?.mid ?? 0) + (season[b.id]?.fwd ?? 0);
    return aTotal - bTotal;
  });

  const zoneFill: Record<Zone, number> = { back: 0, mid: 0, fwd: 0 };

  for (const p of sortedPlayers) {
    const openZones = ZONES.filter((z) => zoneFill[z] < PLAYERS_PER_ZONE);
    if (openZones.length === 0) {
      lineup.bench.push(p.id);
      continue;
    }
    const shuffledZones = seededShuffle(openZones, seed + p.id.charCodeAt(0));
    shuffledZones.sort((a, b) => {
      const diff = owed(p.id, b) - owed(p.id, a);
      if (diff !== 0) return diff;
      return zoneFill[a] - zoneFill[b];
    });
    const chosen = shuffledZones[0];
    lineup[chosen].push(p.id);
    zoneFill[chosen]++;
  }

  return lineup;
}

// ─── Suggest the next swap during play ───────────────────────
// For each zone: off = on-field player with most minutes this
// season in that zone; on = bench player with least minutes in
// that zone (and who's available). Pick the zone with the
// biggest gap.
export interface SwapSuggestion {
  off_player_id: string;
  on_player_id: string;
  zone: Zone;
  gap: number; // minutes — how much fairness this swap corrects
}

// Seeded Fisher-Yates. Deterministic given the same seed so the live
// SwapCard doesn't jitter between renders — the seed only advances
// when a swap actually lands or a quarter begins.
function seededShuffle<T>(arr: readonly T[], seed: number): T[] {
  const a = [...arr];
  let s = (seed | 0) >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Suggest a batch of swaps — one for every fit bench player. The freshest
// bench players come on for the most-tired field players. Each bench player
// takes over the zone of whoever they replace. Missed prior games don't
// factor in; only current-game minutes matter.
export function suggestSwaps(
  lineup: Lineup,
  currentGameMs: Record<string, number> = {},
  tieBreak: number = 0,
  injuredIds: readonly string[] = []
): SwapSuggestion[] {
  const injured = new Set(injuredIds);
  const fitBench = lineup.bench.filter((p) => !injured.has(p));
  if (fitBench.length === 0) return [];

  const gameMin = (pid: string) => (currentGameMs[pid] ?? 0) / 60000;

  // Shuffle then sort so ties resolve randomly per-cycle but stably mid-cycle.
  const fieldByZone: Record<Zone, string[]> = {
    back: seededShuffle(lineup.back.filter((p) => !injured.has(p)), tieBreak + 131),
    mid: seededShuffle(lineup.mid.filter((p) => !injured.has(p)), tieBreak + 262),
    fwd: seededShuffle(lineup.fwd.filter((p) => !injured.has(p)), tieBreak + 393),
  };
  for (const z of ZONES) {
    fieldByZone[z].sort((a, b) => gameMin(b) - gameMin(a)); // most-played first
  }
  const benchSorted = seededShuffle(fitBench, tieBreak).sort(
    (a, b) => gameMin(a) - gameMin(b) // freshest first
  );

  // Round-robin across zones in a shuffled order so multi-sub batches
  // spread across back/mid/fwd instead of draining one zone first.
  const zoneOrder = seededShuffle(ZONES, tieBreak + 77);
  const zoneCursor: Record<Zone, number> = { back: 0, mid: 0, fwd: 0 };
  const swaps: SwapSuggestion[] = [];

  for (let i = 0; i < benchSorted.length; i++) {
    const on = benchSorted[i];
    // Walk the shuffled zone order starting at i, skipping exhausted zones.
    let pickZone: Zone | null = null;
    for (let k = 0; k < zoneOrder.length; k++) {
      const z = zoneOrder[(i + k) % zoneOrder.length];
      if (fieldByZone[z][zoneCursor[z]]) {
        pickZone = z;
        break;
      }
    }
    if (!pickZone) break;
    const off = fieldByZone[pickZone][zoneCursor[pickZone]];
    zoneCursor[pickZone]++;
    swaps.push({
      off_player_id: off,
      on_player_id: on,
      zone: pickZone,
      gap: gameMin(off) - gameMin(on),
    });
  }

  return swaps;
}

// ─── Replay events → current game state ─────────────────────
// Used to hydrate the live game view from the event log.
export interface GameState {
  lineup: Lineup | null;
  currentQuarter: number; // 0 = not started, 1-4 = active quarter, 5 = finished
  quarterEnded: boolean;  // true between quarters (after quarter_end, before next quarter_start)
  teamScore: { goals: number; behinds: number };
  opponentScore: { goals: number; behinds: number };
  finalised: boolean;
  // Per-player field time already locked in (closed stints), broken down by zone (ms).
  basePlayedZoneMs: Record<string, { back: number; mid: number; fwd: number }>;
  // For players currently on-field in the active quarter: the elapsed_ms
  // at which their current stint started. Empty outside a running quarter.
  stintStartMs: Record<string, number>;
  // The zone each mid-stint player is currently in.
  stintZone: Record<string, Zone>;
  // Player IDs currently marked injured (excluded from sub rotation).
  injuredIds: string[];
}

export function replayGame(events: GameEvent[]): GameState {
  const sorted = [...events].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );
  const state: GameState = {
    lineup: null,
    currentQuarter: 0,
    quarterEnded: false,
    teamScore: { goals: 0, behinds: 0 },
    opponentScore: { goals: 0, behinds: 0 },
    finalised: false,
    basePlayedZoneMs: {},
    stintStartMs: {},
    stintZone: {},
    injuredIds: [],
  };
  const addPlayed = (pid: string, zone: Zone, ms: number) => {
    if (ms <= 0) return;
    state.basePlayedZoneMs[pid] ??= { back: 0, mid: 0, fwd: 0 };
    state.basePlayedZoneMs[pid][zone] += ms;
  };

  for (const ev of sorted) {
    const meta = ev.metadata as {
      lineup?: Lineup;
      quarter?: number;
      off_player_id?: string;
      on_player_id?: string;
      zone?: Zone;
      elapsed_ms?: number;
    };
    const elapsed = meta.elapsed_ms ?? 0;

    if (ev.type === "lineup_set" && meta.lineup) {
      state.lineup = cloneLineup(meta.lineup);
    } else if (ev.type === "quarter_start" && meta.quarter) {
      state.currentQuarter = meta.quarter;
      state.quarterEnded = false;
      state.stintStartMs = {};
      state.stintZone = {};
      if (state.lineup) {
        for (const z of ZONES) {
          for (const p of state.lineup[z]) {
            state.stintStartMs[p] = 0;
            state.stintZone[p] = z;
          }
        }
      }
    } else if (ev.type === "quarter_end") {
      state.quarterEnded = true;
      for (const [pid, start] of Object.entries(state.stintStartMs)) {
        const z = state.stintZone[pid];
        if (z) addPlayed(pid, z, elapsed - start);
      }
      state.stintStartMs = {};
      state.stintZone = {};
    } else if (
      ev.type === "swap" &&
      state.lineup &&
      meta.on_player_id &&
      meta.zone
    ) {
      const off = meta.off_player_id ?? "";
      const on = meta.on_player_id;
      const z = meta.zone;
      if (off) {
        const offZone = state.stintZone[off] ?? z;
        addPlayed(off, offZone, elapsed - (state.stintStartMs[off] ?? 0));
        delete state.stintStartMs[off];
        delete state.stintZone[off];
        state.lineup[z] = state.lineup[z].map((p) => (p === off ? on : p));
        state.lineup.bench = [
          ...state.lineup.bench.filter((p) => p !== on),
          off,
        ];
      } else {
        state.lineup[z] = [...state.lineup[z], on];
        state.lineup.bench = state.lineup.bench.filter((p) => p !== on);
      }
      state.stintStartMs[on] = elapsed;
      state.stintZone[on] = z;
    } else if (ev.type === "player_arrived" && state.lineup && ev.player_id) {
      if (!state.lineup.bench.includes(ev.player_id)) {
        state.lineup.bench.push(ev.player_id);
      }
    } else if (ev.type === "injury" && state.lineup && ev.player_id) {
      const pid = ev.player_id;
      const injured = (ev.metadata as { injured?: boolean }).injured ?? true;
      if (injured) {
        if (!state.injuredIds.includes(pid)) state.injuredIds.push(pid);
        const z = zoneOf(state.lineup, pid);
        if (z) {
          const sz = state.stintZone[pid] ?? z;
          addPlayed(pid, sz, elapsed - (state.stintStartMs[pid] ?? 0));
          delete state.stintStartMs[pid];
          delete state.stintZone[pid];
          state.lineup[z] = state.lineup[z].filter((p) => p !== pid);
          if (!state.lineup.bench.includes(pid)) state.lineup.bench.push(pid);
        }
      } else {
        state.injuredIds = state.injuredIds.filter((p) => p !== pid);
      }
    } else if (ev.type === "goal") {
      state.teamScore.goals++;
    } else if (ev.type === "behind") {
      state.teamScore.behinds++;
    } else if (ev.type === "opponent_goal") {
      state.opponentScore.goals++;
    } else if (ev.type === "opponent_behind") {
      state.opponentScore.behinds++;
    } else if (ev.type === "game_finalised") {
      state.finalised = true;
    }
  }

  return state;
}

// ─── Fairness score 0-100 ────────────────────────────────────
// 100 = perfectly even distribution across zones & players.
// 0 = one player hogs everything. Uses coefficient of variation
// across all (player, zone) minute counts; lower CV → higher score.
export function fairnessScore(season: PlayerZoneMinutes): number {
  const values: number[] = [];
  for (const zm of Object.values(season)) {
    values.push(zm.back, zm.mid, zm.fwd);
  }
  if (values.length === 0) return 100;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 100;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  const cv = Math.sqrt(variance) / mean;
  // cv 0 → 100, cv 1+ → 0
  return Math.max(0, Math.min(100, Math.round((1 - cv) * 100)));
}
