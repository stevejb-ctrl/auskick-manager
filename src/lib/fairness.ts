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
  const hardMax = model === "positions5" ? 18 : 15;
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
    } else if (ev.type === "player_loan" && lineup && ev.player_id) {
      const pid = ev.player_id;
      const loaned = (ev.metadata as { loaned?: boolean }).loaned ?? true;
      if (loaned) {
        // Starting a loan — if on-field, close zone stint and move to bench.
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

// ─── Loan minutes: per-game and per-season aggregation ───────
// Loan stints are opened by a player_loan event with loaned=true and closed
// by another with loaned=false, by quarter_end, or by game_finalised. We
// only count elapsed ms between start and close, so a stint that spans
// quarters picks up correctly (elapsed resets at each quarter_start).
export function gameLoanMinutes(events: GameEvent[]): Record<string, number> {
  const sorted = [...events].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );
  const total: Record<string, number> = {};
  const stintStart: Record<string, number> = {};
  const addMs = (pid: string, ms: number) => {
    if (ms <= 0) return;
    total[pid] = (total[pid] ?? 0) + ms / 60000;
  };

  for (const ev of sorted) {
    const meta = ev.metadata as { elapsed_ms?: number; loaned?: boolean };
    const elapsed = meta.elapsed_ms ?? 0;

    if (ev.type === "player_loan" && ev.player_id) {
      const pid = ev.player_id;
      const loaned = meta.loaned ?? true;
      if (loaned) {
        stintStart[pid] = elapsed;
      } else if (stintStart[pid] !== undefined) {
        addMs(pid, elapsed - stintStart[pid]);
        delete stintStart[pid];
      }
    } else if (ev.type === "quarter_end" || ev.type === "game_finalised") {
      for (const [pid, start] of Object.entries(stintStart)) {
        addMs(pid, elapsed - start);
      }
      // quarter_end closes the stint for accounting purposes, but if the
      // player is still loaned the next quarter_start re-opens it at elapsed=0.
      if (ev.type === "quarter_end") {
        for (const pid of Object.keys(stintStart)) stintStart[pid] = 0;
      } else {
        for (const pid of Object.keys(stintStart)) delete stintStart[pid];
      }
    } else if (ev.type === "quarter_start") {
      // Re-anchor any active loan stint to the new quarter's elapsed=0.
      for (const pid of Object.keys(stintStart)) stintStart[pid] = 0;
    }
  }

  return total;
}

// Sum loan minutes across every game's events.
export function seasonLoanMinutes(events: GameEvent[]): Record<string, number> {
  const byGame = new Map<string, GameEvent[]>();
  for (const ev of events) {
    const arr = byGame.get(ev.game_id) ?? [];
    arr.push(ev);
    byGame.set(ev.game_id, arr);
  }
  const total: Record<string, number> = {};
  byGame.forEach((gameEvents) => {
    const perGame = gameLoanMinutes(gameEvents);
    for (const [pid, mins] of Object.entries(perGame)) {
      total[pid] = (total[pid] ?? 0) + mins;
    }
  });
  return total;
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
// Scoring is a sum of four signals plus per-iteration cluster penalty:
//
//   IN_GAME_DIVERSITY (+1000)   "Haven't played this zone this game" → strong
//                                pull. Drives every kid through every zone in
//                                a single game.
//   SEASON_DIVERSITY  (+500)    "Haven't played this zone for ≥ 1 quarter all
//                                season" → over a season every kid hits all 3.
//   SAME_AS_LAST_Q    (-800)    "Was in this zone last quarter" → don't park
//                                a kid in the same line two quarters running.
//   FAIRNESS_TERM     (~ small) Continuous: avg zone mins across the squad
//                                minus this player's mins for that zone.
//   CLUSTER_PENALTY   (-300/peer)
//                                Applied at placement time: every peer from
//                                the same source zone already in target zone
//                                makes target zone less attractive. Stops a
//                                whole line from migrating together (e.g. all
//                                3 mid players flocking to fwd).
//
// `currentGame`            – zone minutes accumulated so far this game.
// `pinnedPositions`        – players who must stay in their current zone (e.g.
//                            recent arrivals, field/zone-locked) — bypass all
//                            scoring.
// `previousQuarterZones`   – per-player zone they ended the previous quarter
//                            in. Drives the SAME_AS_LAST_Q penalty + the
//                            cluster penalty (which compares source zones
//                            across already-placed peers). Empty/missing for
//                            Q1 of a game (where there's no "previous").
export function suggestStartingLineup(
  availablePlayers: Player[],
  season: PlayerZoneMinutes,
  seed: number = 0,
  zoneCaps: ZoneCaps = { back: 4, hback: 0, mid: 4, hfwd: 0, fwd: 4 },
  currentGame: PlayerZoneMinutes = {},
  pinnedPositions: Record<string, Zone> = {},
  previousQuarterZones: Record<string, Zone> = {}
): Lineup {
  const lineup = emptyLineup();
  if (availablePlayers.length === 0) return lineup;

  const zones = activeZones(zoneCaps);
  const zoneFill: ZoneCaps = emptyCaps();
  const pinnedIds = new Set<string>();

  // Place pinned players first so their slots are accounted for before the
  // general assignment runs.
  for (const p of availablePlayers) {
    const z = pinnedPositions[p.id];
    if (z && zones.includes(z) && zoneFill[z] < zoneCaps[z]) {
      lineup[z].push(p.id);
      zoneFill[z]++;
      pinnedIds.add(p.id);
    }
  }

  const avgPerZone = (() => {
    const zm = Object.values(season);
    if (zm.length === 0 || zones.length === 0) return 0;
    let total = 0;
    for (const p of zm) for (const z of zones) total += p[z];
    return total / (zm.length * zones.length);
  })();

  const IN_GAME_DIVERSITY = 1000;
  // 500 < 1000 so an in-game-fresh zone always beats a season-fresh-but-
  // already-played-this-game zone. (Season diversity nudges, in-game forces.)
  const SEASON_DIVERSITY = 500;
  // 800 is below IN_GAME_DIVERSITY (1000), so the same-as-last-quarter penalty
  // is still subordinate to playing a fresh-this-game zone — but it's strong
  // enough to break ties cleanly when in-game diversity is even (e.g. mid-
  // game in Q3 when all zones have already been played).
  const SAME_AS_LAST_Q = 800;
  // Per-peer penalty for cluster avoidance. With CLUSTER_PENALTY at 300 and
  // the source-zone group size capped at zoneCaps[source] (typically 3), the
  // 3rd same-source peer eyeing the same target eats a -600 hit, more than
  // enough to flip a tied owed-score.
  const CLUSTER_PENALTY = 300;
  // "Played this zone for ≥ a full quarter all season" threshold (in ms).
  // 12 * 60 * 1000 matches QUARTER_MS in liveGameStore — kept local here so
  // fairness.ts stays a leaf module with no store imports.
  const FULL_QUARTER_MS = 12 * 60 * 1000;

  const owed = (pid: string, z: Zone) => {
    const gameMins = currentGame[pid]?.[z] ?? 0;
    const seasonMins = season[pid]?.[z] ?? 0;
    const inGameBonus = gameMins === 0 ? IN_GAME_DIVERSITY : 0;
    const seasonBonus = seasonMins < FULL_QUARTER_MS ? SEASON_DIVERSITY : 0;
    const sameAsLastQ = previousQuarterZones[pid] === z ? -SAME_AS_LAST_Q : 0;
    const fairnessTerm = Math.max(0, avgPerZone - seasonMins);
    return inGameBonus + seasonBonus + sameAsLastQ + fairnessTerm;
  };

  const playedTotal = (pid: string) => {
    let t = 0;
    for (const z of zones) t += season[pid]?.[z] ?? 0;
    return t;
  };

  // For the cluster penalty: we count, at placement time, how many already-
  // placed peers from the same SOURCE zone (their previous-quarter zone) are
  // in each TARGET zone. This is what stops the whole line from migrating
  // together. Players with no known previous zone (Q1, late arrivals) are
  // tracked under `null` and contribute no penalty.
  const placedBySourceAndTarget: Map<Zone | null, Map<Zone, number>> = new Map();
  const bumpCluster = (source: Zone | null, target: Zone) => {
    const inner = placedBySourceAndTarget.get(source) ?? new Map<Zone, number>();
    inner.set(target, (inner.get(target) ?? 0) + 1);
    placedBySourceAndTarget.set(source, inner);
  };
  // Seed the cluster map with the pinned placements so the cluster penalty
  // can see them.
  for (const p of availablePlayers) {
    if (!pinnedIds.has(p.id)) continue;
    const z = pinnedPositions[p.id];
    if (!z) continue;
    bumpCluster(previousQuarterZones[p.id] ?? null, z);
  }
  const clusterPenaltyFor = (pid: string, target: Zone) => {
    const src = previousQuarterZones[pid];
    if (!src) return 0; // no source = nothing to cluster around
    const peers = placedBySourceAndTarget.get(src)?.get(target) ?? 0;
    return peers * CLUSTER_PENALTY;
  };

  const remaining = availablePlayers.filter((p) => !pinnedIds.has(p.id));
  const shuffled = seededShuffle(remaining, seed + 17);
  const sortedPlayers = shuffled.sort(
    (a, b) => playedTotal(a.id) - playedTotal(b.id)
  );

  for (const p of sortedPlayers) {
    const openZones = zones.filter((z) => zoneFill[z] < zoneCaps[z]);
    if (openZones.length === 0) {
      lineup.bench.push(p.id);
      continue;
    }
    const shuffledZones = seededShuffle(openZones, seed + p.id.charCodeAt(0));
    shuffledZones.sort((a, b) => {
      const scoreA = owed(p.id, a) - clusterPenaltyFor(p.id, a);
      const scoreB = owed(p.id, b) - clusterPenaltyFor(p.id, b);
      const diff = scoreB - scoreA;
      if (diff !== 0) return diff;
      return zoneFill[a] - zoneFill[b];
    });
    const chosen = shuffledZones[0];
    lineup[chosen].push(p.id);
    zoneFill[chosen]++;
    bumpCluster(previousQuarterZones[p.id] ?? null, chosen);
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
  lockedIds: readonly string[] = [],
  /** Zone-level ms this game per player. Used to prefer sending incoming players
   *  to zones they haven't played yet, promoting position diversity mid-game. */
  currentGameZoneMs: Record<string, ZoneMinutes> = {},
  /** Zone-locked players: can sub on/off but must always return to this zone. */
  zoneLockedPlayers: Record<string, Zone> = {}
): SwapSuggestion[] {
  const injured = new Set(injuredIds);
  const locked = new Set(lockedIds);
  const fitBench = lineup.bench.filter((p) => !injured.has(p) && !locked.has(p));
  if (fitBench.length === 0) return [];

  const gameMin = (pid: string) => (currentGameMs[pid] ?? 0) / 60000;
  const hasPlayedZone = (pid: string, z: Zone) =>
    (currentGameZoneMs[pid]?.[z] ?? 0) > 0;

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
    const forcedZone = zoneLockedPlayers[on] as Zone | undefined;
    let pickZone: Zone | null = null;

    if (forcedZone) {
      // Zone-locked: must come on in their locked zone only.
      if (fieldByZone[forcedZone]?.[zoneCursor[forcedZone]]) {
        pickZone = forcedZone;
      }
      if (!pickZone) continue; // no one to rotate out of that zone right now
    } else {
      // First pass: prefer a zone this player hasn't played yet this game.
      for (let k = 0; k < zoneOrder.length; k++) {
        const z = zoneOrder[(i + k) % zoneOrder.length];
        if (!hasPlayedZone(on, z) && fieldByZone[z][zoneCursor[z]]) {
          pickZone = z;
          break;
        }
      }
      // Fallback: any zone with an available player to rotate off.
      if (!pickZone) {
        for (let k = 0; k < zoneOrder.length; k++) {
          const z = zoneOrder[(i + k) % zoneOrder.length];
          if (fieldByZone[z][zoneCursor[z]]) {
            pickZone = z;
            break;
          }
        }
      }
      if (!pickZone) break; // no field players available at all — done
    }

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
  loanedIds: string[];
  loanStartMs: Record<string, number>;
  basePlayedLoanMs: Record<string, number>;
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
    loanedIds: [],
    loanStartMs: {},
    basePlayedLoanMs: {},
    quarterStartedAt: null,
  };
  let quarterStartedAt: string | null = null;
  const addPlayed = (pid: string, zone: Zone, ms: number) => {
    if (ms <= 0) return;
    state.basePlayedZoneMs[pid] ??= emptyZM();
    state.basePlayedZoneMs[pid][zone] += ms;
  };
  const addLoan = (pid: string, ms: number) => {
    if (ms <= 0) return;
    state.basePlayedLoanMs[pid] = (state.basePlayedLoanMs[pid] ?? 0) + ms;
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
      // Re-anchor any still-loaned players' stints to elapsed=0 in this quarter.
      for (const pid of state.loanedIds) state.loanStartMs[pid] = 0;
    } else if (ev.type === "quarter_end") {
      state.quarterEnded = true;
      quarterStartedAt = null;
      for (const [pid, start] of Object.entries(state.stintStartMs)) {
        const z = state.stintZone[pid];
        if (z) addPlayed(pid, z, elapsed - start);
      }
      state.stintStartMs = {};
      state.stintZone = {};
      // Flush open loan stints — quarter_start will reopen if still loaned.
      for (const [pid, start] of Object.entries(state.loanStartMs)) {
        addLoan(pid, elapsed - start);
      }
      state.loanStartMs = {};
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
    } else if (ev.type === "player_loan" && state.lineup && ev.player_id) {
      const pid = ev.player_id;
      const loaned = (ev.metadata as { loaned?: boolean }).loaned ?? true;
      if (loaned) {
        if (!state.loanedIds.includes(pid)) state.loanedIds.push(pid);
        state.loanStartMs[pid] = elapsed;
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
        state.loanedIds = state.loanedIds.filter((p) => p !== pid);
        const start = state.loanStartMs[pid];
        if (start !== undefined) {
          addLoan(pid, elapsed - start);
          delete state.loanStartMs[pid];
        }
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
      // Close any open loan stints so final totals are correct.
      for (const [pid, start] of Object.entries(state.loanStartMs)) {
        addLoan(pid, elapsed - start);
      }
      state.loanStartMs = {};
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
