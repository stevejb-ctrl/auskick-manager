// Single-device live-game state. Clock is in-memory only —
// if the GM reloads mid-quarter, they restart it.

import { create } from "zustand";
import type { Lineup, Zone } from "@/lib/types";

export type ZoneMs = { back: number; mid: number; fwd: number };
const emptyZoneMs = (): ZoneMs => ({ back: 0, mid: 0, fwd: 0 });

export interface LiveGameState {
  lineup: Lineup;
  currentQuarter: number; // 0 = not started, 1-4 = in progress / just ended
  quarterEnded: boolean;  // true between end of quarter N and start of quarter N+1
  finalised: boolean;
  clockStartedAt: number | null; // epoch ms, null when paused
  accumulatedMs: number; // ms elapsed in current quarter (excluding current run segment)

  selected: { kind: "field"; playerId: string; zone: Zone } | { kind: "bench"; playerId: string } | null;

  teamScore: { goals: number; behinds: number };
  opponentScore: { goals: number; behinds: number };

  // Per-player field time accumulation (closed stints, per zone).
  basePlayedZoneMs: Record<string, ZoneMs>;
  // For on-field players mid-stint: when their stint started and in which zone.
  stintStartMs: Record<string, number>;
  stintZone: Record<string, Zone>;

  // Advances on every swap + quarter transition. Used to seed suggestion
  // tie-breaks so the UI doesn't pick the same zone/player every cycle.
  swapCount: number;

  // Player IDs currently marked injured (excluded from sub rotation).
  injuredIds: string[];

  // setters
  init: (state: Partial<LiveGameState>) => void;
  selectField: (playerId: string, zone: Zone) => void;
  selectBench: (playerId: string) => void;
  clearSelection: () => void;
  applySwap: (off: string, on: string, zone: Zone) => void;
  setLineup: (lineup: Lineup) => void;
  startClock: () => void;
  pauseClock: () => void;
  beginNextQuarter: () => void; // called when starting Q1, or Q2 after a break, etc.
  endCurrentQuarter: () => void; // called when ending a quarter (pauses clock, sets quarterEnded=true)
  finaliseGame: () => void;
  incTeam: (kind: "goals" | "behinds") => void;
  incOpponent: (kind: "goals" | "behinds") => void;
  addBenchPlayer: (playerId: string) => void;
  setInjured: (playerId: string, injured: boolean) => void;
}

export const useLiveGame = create<LiveGameState>((set) => ({
  lineup: { back: [], mid: [], fwd: [], bench: [] },
  currentQuarter: 0,
  quarterEnded: false,
  finalised: false,
  clockStartedAt: null,
  accumulatedMs: 0,
  selected: null,
  teamScore: { goals: 0, behinds: 0 },
  opponentScore: { goals: 0, behinds: 0 },
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
      const lineup: Lineup = {
        back: [...prev.lineup.back],
        mid: [...prev.lineup.mid],
        fwd: [...prev.lineup.fwd],
        bench: [...prev.lineup.bench],
      };
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
        basePlayedZoneMs[off] = { ...(basePlayedZoneMs[off] ?? emptyZoneMs()) };
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
      lineup: {
        back: [...lineup.back],
        mid: [...lineup.mid],
        fwd: [...lineup.fwd],
        bench: [...lineup.bench],
      },
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
      for (const z of ["back", "mid", "fwd"] as Zone[]) {
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
        basePlayedZoneMs[pid] = { ...(basePlayedZoneMs[pid] ?? emptyZoneMs()) };
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

  setInjured: (playerId, injured) =>
    set((prev) => {
      const wasInjured = prev.injuredIds.includes(playerId);
      if (injured && wasInjured) return prev;
      if (!injured && !wasInjured) return prev;

      const injuredIds = injured
        ? [...prev.injuredIds, playerId]
        : prev.injuredIds.filter((p) => p !== playerId);

      if (!injured) {
        // Un-marking: keep current lineup / stint state unchanged.
        return { injuredIds };
      }

      // Marking injured: close stint + move to bench if on-field.
      const lineup: Lineup = {
        back: [...prev.lineup.back],
        mid: [...prev.lineup.mid],
        fwd: [...prev.lineup.fwd],
        bench: [...prev.lineup.bench],
      };
      const basePlayedZoneMs = { ...prev.basePlayedZoneMs };
      const stintStartMs = { ...prev.stintStartMs };
      const stintZone = { ...prev.stintZone };
      const onFieldZone = (["back", "mid", "fwd"] as Zone[]).find((z) =>
        lineup[z].includes(playerId)
      );
      if (onFieldZone) {
        const nowMs = clockElapsedMs(prev);
        const start = stintStartMs[playerId] ?? nowMs;
        const z = stintZone[playerId] ?? onFieldZone;
        basePlayedZoneMs[playerId] = { ...(basePlayedZoneMs[playerId] ?? emptyZoneMs()) };
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
      if (
        prev.lineup.bench.includes(playerId) ||
        prev.lineup.back.includes(playerId) ||
        prev.lineup.mid.includes(playerId) ||
        prev.lineup.fwd.includes(playerId)
      ) {
        return prev;
      }
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
