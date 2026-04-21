// Single-device live-game state. Clock is in-memory only —
// if the GM reloads mid-quarter, they restart it.

import { create } from "zustand";

export const QUARTER_MS = 12 * 60 * 1000;
import {
  emptyLineup,
  normalizeLineup,
  type Lineup,
  type Zone,
} from "@/lib/types";
import { ALL_ZONES } from "@/lib/fairness";

export type ZoneMs = Record<Zone, number>;
const newZoneMs = (): ZoneMs => ({ back: 0, hback: 0, mid: 0, hfwd: 0, fwd: 0 });

export interface LiveGameState {
  activeGameId: string | null;
  lineup: Lineup;
  currentQuarter: number;
  quarterEnded: boolean;
  finalised: boolean;
  clockStartedAt: number | null;
  accumulatedMs: number;

  selected: { kind: "field"; playerId: string; zone: Zone } | { kind: "bench"; playerId: string } | null;

  teamScore: { goals: number; behinds: number };
  opponentScore: { goals: number; behinds: number };
  playerScores: Record<string, { goals: number; behinds: number }>;

  basePlayedZoneMs: Record<string, ZoneMs>;
  stintStartMs: Record<string, number>;
  stintZone: Record<string, Zone>;

  swapCount: number;
  injuredIds: string[];
  /** Ephemeral — resets on page reload. Locked players are skipped by auto-rotation. */
  lockedIds: string[];
  /**
   * Duration (ms) of each player's last on-field stint, captured when the quarter ends.
   * Used by QuarterBreak to pin recently-arrived players so they aren't moved again immediately.
   */
  lastStintMs: Record<string, number>;
  /** Zone of each player's last on-field stint (parallel to lastStintMs). */
  lastStintZone: Record<string, Zone>;
  /**
   * Zone-locked players: can be subbed on/off but must always return to this zone.
   * Mutually exclusive with lockedIds (field lock).
   */
  zoneLockedPlayers: Record<string, Zone>;

  init: (state: Partial<LiveGameState>) => void;
  selectField: (playerId: string, zone: Zone) => void;
  selectBench: (playerId: string) => void;
  clearSelection: () => void;
  applySwap: (off: string, on: string, zone: Zone) => void;
  applyFieldZoneSwap: (pidA: string, zoneA: Zone, pidB: string, zoneB: Zone) => void;
  setLineup: (lineup: Lineup) => void;
  startClock: () => void;
  pauseClock: () => void;
  beginNextQuarter: () => void;
  endCurrentQuarter: () => void;
  finaliseGame: () => void;
  incTeam: (kind: "goals" | "behinds") => void;
  incOpponent: (kind: "goals" | "behinds") => void;
  incPlayerScore: (playerId: string, kind: "goals" | "behinds") => void;
  undoTeamScore: (kind: "goals" | "behinds") => void;
  undoOpponentScore: (kind: "goals" | "behinds") => void;
  undoPlayerScore: (playerId: string, kind: "goals" | "behinds") => void;
  addBenchPlayer: (playerId: string) => void;
  setInjured: (playerId: string, injured: boolean) => void;
  setLocked: (playerId: string, locked: boolean) => void;
  /** Lock player to a specific zone (they can sub on/off but only to this zone). Pass null to clear. */
  setZoneLocked: (playerId: string, zone: Zone | null) => void;
}

function cloneLineup(l: Lineup): Lineup {
  return normalizeLineup(l);
}

export const useLiveGame = create<LiveGameState>((set) => ({
  activeGameId: null,
  lineup: emptyLineup(),
  currentQuarter: 0,
  quarterEnded: false,
  finalised: false,
  clockStartedAt: null,
  accumulatedMs: 0,
  selected: null,
  teamScore: { goals: 0, behinds: 0 },
  opponentScore: { goals: 0, behinds: 0 },
  playerScores: {},
  basePlayedZoneMs: {},
  stintStartMs: {},
  stintZone: {},
  swapCount: 0,
  injuredIds: [],
  lockedIds: [],
  lastStintMs: {},
  lastStintZone: {},
  zoneLockedPlayers: {},

  init: (state) => set((prev) => ({ ...prev, ...state })),

  selectField: (playerId, zone) =>
    set({ selected: { kind: "field", playerId, zone } }),
  selectBench: (playerId) => set({ selected: { kind: "bench", playerId } }),
  clearSelection: () => set({ selected: null }),

  applySwap: (off, on, zone) =>
    set((prev) => {
      const lineup = cloneLineup(prev.lineup);
      const nowMs = clockElapsedMs(prev);
      const basePlayedZoneMs = { ...prev.basePlayedZoneMs };
      const stintStartMs = { ...prev.stintStartMs };
      const stintZone = { ...prev.stintZone };

      if (off === "") {
        lineup[zone] = [...lineup[zone], on];
        lineup.bench = lineup.bench.filter((p) => p !== on);
      } else {
        lineup[zone] = lineup[zone].map((p) => (p === off ? on : p));
        lineup.bench = [...lineup.bench.filter((p) => p !== on), off];
        const offStart = stintStartMs[off] ?? nowMs;
        const offZone = stintZone[off] ?? zone;
        basePlayedZoneMs[off] = { ...(basePlayedZoneMs[off] ?? newZoneMs()) };
        basePlayedZoneMs[off][offZone] += Math.max(0, nowMs - offStart);
        delete stintStartMs[off];
        delete stintZone[off];
      }
      stintStartMs[on] = nowMs;
      stintZone[on] = zone;
      return {
        lineup,
        selected: null,
        basePlayedZoneMs,
        stintStartMs,
        stintZone,
        swapCount: prev.swapCount + 1,
      };
    }),

  applyFieldZoneSwap: (pidA, zoneA, pidB, zoneB) =>
    set((prev) => {
      const lineup = cloneLineup(prev.lineup);
      const nowMs = clockElapsedMs(prev);
      const basePlayedZoneMs = { ...prev.basePlayedZoneMs };
      const stintStartMs = { ...prev.stintStartMs };
      const stintZone = { ...prev.stintZone };

      lineup[zoneA] = lineup[zoneA].map((p) => (p === pidA ? pidB : p));
      lineup[zoneB] = lineup[zoneB].map((p) => (p === pidB ? pidA : p));

      for (const [pid, fromZone, toZone] of [
        [pidA, zoneA, zoneB],
        [pidB, zoneB, zoneA],
      ] as [string, Zone, Zone][]) {
        const start = stintStartMs[pid] ?? nowMs;
        basePlayedZoneMs[pid] = { ...(basePlayedZoneMs[pid] ?? newZoneMs()) };
        basePlayedZoneMs[pid][fromZone] += Math.max(0, nowMs - start);
        stintStartMs[pid] = nowMs;
        stintZone[pid] = toZone;
      }

      return { lineup, selected: null, basePlayedZoneMs, stintStartMs, stintZone, swapCount: prev.swapCount + 1 };
    }),

  setLineup: (lineup) =>
    set(() => ({
      lineup: cloneLineup(lineup),
      selected: null,
    })),

  startClock: () =>
    set((prev) => {
      if (prev.clockStartedAt !== null) return prev;
      return { clockStartedAt: Date.now() };
    }),

  pauseClock: () =>
    set((prev) => {
      if (prev.clockStartedAt === null) return prev;
      const now = Date.now();
      return {
        accumulatedMs: prev.accumulatedMs + (now - prev.clockStartedAt),
        clockStartedAt: null,
      };
    }),

  beginNextQuarter: () =>
    set((prev) => {
      const stintStartMs: Record<string, number> = {};
      const stintZone: Record<string, Zone> = {};
      for (const z of ALL_ZONES) {
        for (const p of prev.lineup[z]) {
          stintStartMs[p] = 0;
          stintZone[p] = z;
        }
      }
      return {
        currentQuarter: prev.currentQuarter + 1,
        quarterEnded: false,
        accumulatedMs: 0,
        // Don't auto-start the clock — the GM taps Start when the hooter goes.
        clockStartedAt: null,
        stintStartMs,
        stintZone,
        swapCount: prev.swapCount + 1,
        lastStintMs: {},
        lastStintZone: {},
      };
    }),

  endCurrentQuarter: () =>
    set((prev) => {
      const now = Date.now();
      const rawAccumulated =
        prev.clockStartedAt === null
          ? prev.accumulatedMs
          : prev.accumulatedMs + (now - prev.clockStartedAt);
      // Cap at QUARTER_MS so that if the GM delays confirming end-of-quarter,
      // player stint durations don't leak past the hooter.
      const accumulated = Math.min(rawAccumulated, QUARTER_MS);
      const basePlayedZoneMs = { ...prev.basePlayedZoneMs };
      const lastStintMs: Record<string, number> = {};
      const lastStintZone: Record<string, Zone> = {};
      for (const [pid, start] of Object.entries(prev.stintStartMs)) {
        const z = prev.stintZone[pid];
        if (!z) continue;
        const dur = Math.max(0, accumulated - start);
        basePlayedZoneMs[pid] = { ...(basePlayedZoneMs[pid] ?? newZoneMs()) };
        basePlayedZoneMs[pid][z] += dur;
        lastStintMs[pid] = dur;
        lastStintZone[pid] = z;
      }
      return {
        clockStartedAt: null,
        accumulatedMs: accumulated,
        quarterEnded: true,
        basePlayedZoneMs,
        stintStartMs: {},
        stintZone: {},
        lastStintMs,
        lastStintZone,
      };
    }),

  finaliseGame: () => set({ finalised: true, clockStartedAt: null }),

  incTeam: (kind) =>
    set((prev) => ({
      teamScore: { ...prev.teamScore, [kind]: prev.teamScore[kind] + 1 },
    })),
  incOpponent: (kind) =>
    set((prev) => ({
      opponentScore: {
        ...prev.opponentScore,
        [kind]: prev.opponentScore[kind] + 1,
      },
    })),
  incPlayerScore: (playerId, kind) =>
    set((prev) => {
      const cur = prev.playerScores[playerId] ?? { goals: 0, behinds: 0 };
      return {
        playerScores: {
          ...prev.playerScores,
          [playerId]: { ...cur, [kind]: cur[kind] + 1 },
        },
      };
    }),

  undoTeamScore: (kind) =>
    set((prev) => ({
      teamScore: { ...prev.teamScore, [kind]: Math.max(0, prev.teamScore[kind] - 1) },
    })),
  undoOpponentScore: (kind) =>
    set((prev) => ({
      opponentScore: { ...prev.opponentScore, [kind]: Math.max(0, prev.opponentScore[kind] - 1) },
    })),
  undoPlayerScore: (playerId, kind) =>
    set((prev) => {
      const cur = prev.playerScores[playerId] ?? { goals: 0, behinds: 0 };
      return {
        playerScores: {
          ...prev.playerScores,
          [playerId]: { ...cur, [kind]: Math.max(0, cur[kind] - 1) },
        },
      };
    }),

  setInjured: (playerId, injured) =>
    set((prev) => {
      const wasInjured = prev.injuredIds.includes(playerId);
      if (injured && wasInjured) return prev;
      if (!injured && !wasInjured) return prev;

      const injuredIds = injured
        ? [...prev.injuredIds, playerId]
        : prev.injuredIds.filter((p) => p !== playerId);

      if (!injured) {
        return { injuredIds };
      }

      const lineup = cloneLineup(prev.lineup);
      const basePlayedZoneMs = { ...prev.basePlayedZoneMs };
      const stintStartMs = { ...prev.stintStartMs };
      const stintZone = { ...prev.stintZone };
      const onFieldZone = ALL_ZONES.find((z) =>
        lineup[z].includes(playerId)
      );
      if (onFieldZone) {
        const nowMs = clockElapsedMs(prev);
        const start = stintStartMs[playerId] ?? nowMs;
        const z = stintZone[playerId] ?? onFieldZone;
        basePlayedZoneMs[playerId] = { ...(basePlayedZoneMs[playerId] ?? newZoneMs()) };
        basePlayedZoneMs[playerId][z] += Math.max(0, nowMs - start);
        delete stintStartMs[playerId];
        delete stintZone[playerId];
        lineup[onFieldZone] = lineup[onFieldZone].filter((p) => p !== playerId);
        if (!lineup.bench.includes(playerId)) lineup.bench.push(playerId);
      }
      return {
        injuredIds,
        lineup,
        basePlayedZoneMs,
        stintStartMs,
        stintZone,
        swapCount: prev.swapCount + 1,
      };
    }),

  addBenchPlayer: (playerId) =>
    set((prev) => {
      const alreadyThere = prev.lineup.bench.includes(playerId) ||
        ALL_ZONES.some((z) => prev.lineup[z].includes(playerId));
      if (alreadyThere) return prev;
      return {
        lineup: {
          ...prev.lineup,
          bench: [...prev.lineup.bench, playerId],
        },
      };
    }),

  setLocked: (playerId, locked) =>
    set((prev) => {
      const wasLocked = prev.lockedIds.includes(playerId);
      const wasZoneLocked = !!prev.zoneLockedPlayers[playerId];
      if (locked === wasLocked && !wasZoneLocked) return prev;
      const zoneLockedPlayers = { ...prev.zoneLockedPlayers };
      delete zoneLockedPlayers[playerId];
      return {
        lockedIds: locked
          ? (wasLocked ? prev.lockedIds : [...prev.lockedIds, playerId])
          : prev.lockedIds.filter((p) => p !== playerId),
        zoneLockedPlayers,
      };
    }),

  setZoneLocked: (playerId, zone) =>
    set((prev) => {
      const zoneLockedPlayers = { ...prev.zoneLockedPlayers };
      if (zone === null) {
        delete zoneLockedPlayers[playerId];
      } else {
        zoneLockedPlayers[playerId] = zone;
      }
      // Zone lock and field lock are mutually exclusive
      return {
        zoneLockedPlayers,
        lockedIds: prev.lockedIds.filter((p) => p !== playerId),
      };
    }),
}));

export function clockElapsedMs(
  state: Pick<LiveGameState, "clockStartedAt" | "accumulatedMs">
): number {
  if (state.clockStartedAt === null) return state.accumulatedMs;
  return state.accumulatedMs + (Date.now() - state.clockStartedAt);
}

export function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
