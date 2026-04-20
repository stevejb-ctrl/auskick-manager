// ============================================================
// Fairness engine — pure functions. No Supabase, no React.
//
// Inputs: an array of GameEvents (one team's whole season, or
// a single game). Outputs: zone-minutes per player, suggested
// starting lineups, suggested mid-game swaps.
//
// Zones may be 3 (back/mid/fwd — U8-U12) or 5 (adds hback/hfwd
// for U13+). All per-zone records carry all 5 keys; unused zones
// are simply zero. `zoneCaps` with 0 means "no slots" so the UI
// skips that position.
// ============================================================

import {
  emptyLineup,
  normalizeLineup,
  type GameEvent,
  type Lineup,
  type Player,
  type PositionModel,
  type Zone,
} from "@/lib/types";
import { positionsFor } from "@/lib/ageGroups";

export type ZoneMinutes = Record<Zone, number>;
export type PlayerZoneMinutes = Record<string, ZoneMinutes>;

export const ALL_ZONES: Zone[] = ["back", "hback", "mid", "hfwd", "fwd"];
// Legacy export retained for 3-zone call sites that don't know the model.
export const ZONES: Zone[] = ["back", "mid", "fwd"];

export type ZoneCaps = Record<Zone, number>;

function emptyCaps(): ZoneCaps {
  return { back: 0, hback: 0, mid: 0, hfwd: 0, fwd: 0 };
}

// Distribute an on-field size across the model's zones.
// 3-zone: remainder fills mid first, then back (11 → 4-4-3, 10 → 3-4-3, 9 → 3-3-3).
// 5-position: remainder fills mid first, then the half-lines, then back/fwd.
export function zoneCapsFor(
  onFieldSize: number,
  model: PositionModel = "zones3"
): ZoneCaps {
  const zones = positionsFor(model);
  const hardMax = model === "positions5" ? 18 : 12;
  const size = Math.max(0, Math.min(hardMax, Math.floor(onFieldSize)));
  const base = Math.floor(size / zones.length);
  const rem = size % zones.length;
  const caps = emptyCaps();
  for (const z of zones) caps[z] = base;
  // Fill remainder in this priority order. For 3-zone this collapses to
  // [mid, back]; for 5-position [mid, hback, hfwd, back, fwd].
  const priority: Zone[] =
    model === "positions5"
      ? ["mid", "hback", "hfwd", "back", "fwd"]
      : ["mid", "back", "fwd"];
  for (let i = 0; i < rem; i++) caps[priority[i]]++;
  return caps;
}

// ─── Helpers ──────────────────────────────────────────────────
function emptyZM(): ZoneMinutes {
  return { back: 0, hback: 0, mid: 0, hfwd: 0, fwd: 0 };
}

export function emptyZoneMs(): ZoneMinutes {
  return emptyZM();
}

function zoneOf(lineup: Lineup, playerId: string): Zone | null {
  for (const z of ALL_ZONES) {
    if (lineup[z].includes(playerId)) return z;
  }
  return null;
}

function cloneLineup(l: Lineup): Lineup {
  return {
    back: [...l.back],
    hback: [...l.hback],
    mid: [...l.mid],
    hfwd: [...l.hfwd],
    fwd: [...l.fwd],
    bench: [...l.bench],
  };
}

function activeZones(caps: ZoneCaps): Zone[] {
  return ALL_ZONES.filter((z) => caps[z] > 0);
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
  let stintStart: Record<string, number> = {};
  let stintZ: Record<string, Zone> = {};

  for (const ev of sorted) {
    const meta = ev.metadata as {
      elapsed_ms?: number;
      quarter?: number;
      lineup?: Partial<Lineup>;
      off_player_id?: string;
      on_player_id?: string;
      zone?: Zone;
    };
    const elapsed = meta.elapsed_ms ?? 0;

    if (ev.type === "lineup_set" && meta.lineup) {
      lineup = normalizeLineup(meta.lineup);
    } else if (ev.type === "quarter_start") {
      stintStart = {};
      stintZ = {};
      if (lineup) {
        for (const z of ALL_ZONES) {
          for (const p of lineup[z]) {
            stintStart[p] = 0;
            stintZ[p] = z;
          }
        }
      }
    } else if (ev.type === "swap" && lineup && meta.on_player_id && meta.zone) {
      const off = meta.off_player_id ?? "";
      const on = meta.on_player_id;
      const z = meta.zone;
      if (off) {
        const sz = stintZ[off] ?? z;
        add(off, sz, elapsed - (stintStart[off] ?? 0));
        delete stintStart[off];
        delete stintZ[off];
        lineup[z] = lineup[z].map((p) => (p === off ? on : p));
        lineup.bench = [...lineup.bench.filter((p) => p !== on), off];
      } else {
        lineup[z] = [...lineup[z], on];
        lineup.bench = lineup.bench.filter((p) => p !== on);
      }
      stintStart[on] = elapsed;
      stintZ[on] = z;
    } else if (ev.type === "quarter_end" && lineup) {
      for (const [pid, start] of Object.entries(stintStart)) {
        const z = stintZ[pid];
        if (z) add(pid, z, elapsed - start);
      }
      stintStart = {};
      stintZ = {};
    } else if (ev.type === "player_arrived" && lineup && ev.player_id) {
      if (!lineup.bench.includes(ev.player_id)) lineup.bench.push(ev.player_id);
    } else if (ev.type === "injury" && lineup && ev.player_id) {
      const pid = ev.player_id;
      const injured = (ev.metadata as { injured?: boolean }).injured ?? true;
      if (injured) {
        const z = zoneOf(lineup, pid);
        if (z) {
          const sz = stintZ[pid] ?? z;
          add(pid, sz, elapsed - (stintStart[pid] ?? 0));
          delete stintStart[pid];
          delete stintZ[pid];
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
      for (const z of ALL_ZONES) total[pid][z] += zm[z];
    }
  });
  return total;
}

// ─── Suggest a starting lineup ───────────────────────────────
export function suggestStartingLineup(
  availablePlayers: Player[],
  season: PlayerZoneMinutes,
  seed: number = 0,
  zoneCaps: ZoneCaps = { back: 4, hback: 0, mid: 4, hfwd: 0, fwd: 4 }
): Lineup {
  const lineup = emptyLineup();
  if (availablePlayers.length === 0) return lineup;

  const zones = activeZones(zoneCaps);

  const avgPerZone = (() => {
    const zm = Object.values(season);
    if (zm.length === 0 || zones.length === 0) return 0;
    let total = 0;
    for (const p of zm) for (const z of zones) total += p[z];
    return total / (zm.length * zones.length);
  })();

  const owed = (pid: string, z: Zone) => {
    const played = season[pid]?.[z] ?? 0;
    return Math.max(0, avgPerZone - played);
  };

  const playedTotal = (pid: string) => {
    let t = 0;
    for (const z of zones) t += season[pid]?.[z] ?? 0;
    return t;
  };

  const shuffled = seededShuffle(availablePlayers, seed + 17);
  const sortedPlayers = shuffled.sort(
    (a, b) => playedTotal(a.id) - playedTotal(b.id)
  );

  const zoneFill: ZoneCaps = emptyCaps();

  for (const p of sortedPlayers) {
    const openZones = zones.filter((z) => zoneFill[z] < zoneCaps[z]);
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
export interface SwapSuggestion {
  off_player_id: string;
  on_player_id: string;
  zone: Zone;
  gap: number;
}

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

export function suggestSwaps(
  lineup: Lineup,
  currentGameMs: Record<string, number> = {},
  tieBreak: number = 0,
  injuredIds: readonly string[] = [],
  activeZoneList: Zone[] = ZONES,
  lockedIds: readonly string[] = []
): SwapSuggestion[] {
  const injured = new Set(injuredIds);
  const locked = new Set(lockedIds);
  const fitBench = lineup.bench.filter((p) => !injured.has(p) && !locked.has(p));
  if (fitBench.length === 0) return [];

  const gameMin = (pid: string) => (currentGameMs[pid] ?? 0) / 60000;

  const fieldByZone = {} as Record<Zone, string[]>;
  for (const z of ALL_ZONES) fieldByZone[z] = [];
  for (const z of activeZoneList) {
    fieldByZone[z] = seededShuffle(
      lineup[z].filter((p) => !injured.has(p) && !locked.has(p)),
      tieBreak + 131 * (ALL_ZONES.indexOf(z) + 1)
    );
    fieldByZone[z].sort((a, b) => gameMin(b) - gameMin(a));
  }
  const benchSorted = seededShuffle(fitBench, tieBreak).sort(
    (a, b) => gameMin(a) - gameMin(b)
  );

  const zoneOrder = seededShuffle(activeZoneList, tieBreak + 77);
  const zoneCursor = emptyCaps();
  const swaps: SwapSuggestion[] = [];

  for (let i = 0; i < benchSorted.length; i++) {
    const on = benchSorted[i];
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
export interface GameState {
  lineup: Lineup | null;
  currentQuarter: number;
  quarterEnded: boolean;
  teamScore: { goals: number; behinds: number };
  opponentScore: { goals: number; behinds: number };
  playerScores: Record<string, { goals: number; behinds: number }>;
  finalised: boolean;
  basePlayedZoneMs: Record<string, ZoneMinutes>;
  stintStartMs: Record<string, number>;
  stintZone: Record<string, Zone>;
  injuredIds: string[];
  /** ISO timestamp of the current quarter_start event; null when quarter is ended/not started. */
  quarterStartedAt: string | null;
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
    playerScores: {},
    finalised: false,
    basePlayedZoneMs: {},
    stintStartMs: {},
    stintZone: {},
    injuredIds: [],
    quarterStartedAt: null,
  };
  let quarterStartedAt: string | null = null;
  const addPlayed = (pid: string, zone: Zone, ms: number) => {
    if (ms <= 0) return;
    state.basePlayedZoneMs[pid] ??= emptyZM();
    state.basePlayedZoneMs[pid][zone] += ms;
  };

  for (const ev of sorted) {
    const meta = ev.metadata as {
      lineup?: Partial<Lineup>;
      quarter?: number;
      off_player_id?: string;
      on_player_id?: string;
      zone?: Zone;
      elapsed_ms?: number;
    };
    const elapsed = meta.elapsed_ms ?? 0;

    if (ev.type === "lineup_set" && meta.lineup) {
      state.lineup = normalizeLineup(meta.lineup);
    } else if (ev.type === "quarter_start" && meta.quarter) {
      state.currentQuarter = meta.quarter;
      state.quarterEnded = false;
      quarterStartedAt = ev.created_at;
      state.stintStartMs = {};
      state.stintZone = {};
      if (state.lineup) {
        for (const z of ALL_ZONES) {
          for (const p of state.lineup[z]) {
            state.stintStartMs[p] = 0;
            state.stintZone[p] = z;
          }
        }
      }
    } else if (ev.type === "quarter_end") {
      state.quarterEnded = true;
      quarterStartedAt = null;
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
      if (ev.player_id) {
        state.playerScores[ev.player_id] ??= { goals: 0, behinds: 0 };
        state.playerScores[ev.player_id].goals++;
      }
    } else if (ev.type === "behind") {
      state.teamScore.behinds++;
      if (ev.player_id) {
        state.playerScores[ev.player_id] ??= { goals: 0, behinds: 0 };
        state.playerScores[ev.player_id].behinds++;
      }
    } else if (ev.type === "opponent_goal") {
      state.opponentScore.goals++;
    } else if (ev.type === "opponent_behind") {
      state.opponentScore.behinds++;
    } else if (ev.type === "game_finalised") {
      state.finalised = true;
    }
  }

  if (state.lineup) state.lineup = normalizeLineup(state.lineup);
  state.quarterStartedAt = quarterStartedAt;

  return state;
}

// ─── Fairness score 0-100 ────────────────────────────────────
export function fairnessScore(season: PlayerZoneMinutes): number {
  const values: number[] = [];
  for (const zm of Object.values(season)) {
    for (const z of ALL_ZONES) {
      if (zm[z] > 0) values.push(zm[z]);
    }
  }
  if (values.length === 0) return 100;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 100;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  const cv = Math.sqrt(variance) / mean;
  return Math.max(0, Math.min(100, Math.round((1 - cv) * 100)));
}
