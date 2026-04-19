// Single-device live-game state. Clock is in-memory only —
// if the GM reloads mid-quarter, they restart it.

import { create } from "zustand";
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

  init: (state: Partial<LiveGameState>) => void;
  selectField: (playerId: string, zone: Zone) => void;
  selectBench: (playerId: string) => void;
  clearSelection: () => void;
  applySwap: (off: string, on: string, zone: Zone) => void;
  setLineup: (lineup: Lineup) => void;
  startClock: () => void;
  pauseClock: () => void;
  beginNextQuarter: () => void;
  endCurrentQuarter: () => void;
  finaliseGame: () => void;
  incTeam: (kind: "goals" | "behinds") => void;
  incOpponent: (kind: "goals" | "behinds") => void;
  incPlayerScore: (playerId: string, kind: "goals" | "behinds") => void;
  addBenchPlayer: (playerId: string) => void;
  setInjured: (playerId: string, injured: boolean) => void;
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
        clockStartedAt: Date.now(),
        stintStartMs,
        stintZone,
        swapCount: prev.swapCount + 1,
      };
    }),

  endCurrentQuarter: () =>
    set((prev) => {
      const now = Date.now();
      const accumulated =
        prev.clockStartedAt === null
          ? prev.accumulatedMs
          : prev.accumulatedMs + (now - prev.clockStartedAt);
      const basePlayedZoneMs = { ...prev.basePlayedZoneMs };
      for (const [pid, start] of Object.entries(prev.stintStartMs)) {
        const z = prev.stintZone[pid];
        if (!z) continue;
        basePlayedZoneMs[pid] = { ...(basePlayedZoneMs[pid] ?? newZoneMs()) };
        basePlayedZoneMs[pid][z] += Math.max(0, accumulated - start);
      }
      return {
        clockStartedAt: null,
        accumulatedMs: accumulated,
        quarterEnded: true,
        basePlayedZoneMs,
        stintStartMs: {},
        stintZone: {},
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
