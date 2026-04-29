// Single-device live-game state. Most state is in-memory only
// (zustand) and lost on reload — that includes injuredIds /
// loanedIds / lockedIds / pauses. The CLOCK is the exception:
// LiveGame.tsx seeds the store on mount from
// `initialState.quarterStartedAt` (the wall-clock timestamp
// replayGame extracts from the active quarter_start event), so
// a reload mid-quarter rebuilds accumulatedMs as
// Date.now() - quarterStartedAt and the clock keeps running from
// roughly where it was. The only thing the wall-clock approach
// can't recover is in-quarter pause time — pauses aren't event-
// persisted, so a reload silently includes paused seconds in
// accumulatedMs. For a quarter without pauses (the common case)
// the recovery is exact.

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
  /**
   * Players currently loaned to the opposition. Behaves like injury on the
   * field (excluded from rotation, stays on bench) but accumulates a loan-
   * minutes tally used for season fairness ("spread the favour").
   */
  loanedIds: string[];
  /** Clock-elapsed ms when each loaned player's current stint started. */
  loanStartMs: Record<string, number>;
  /** Accumulated loan ms across closed stints this game. */
  basePlayedLoanMs: Record<string, number>;
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
  /**
   * Mark an on-field player injured AND substitute a bench player into their
   * vacant zone, in one atomic update. Closes the injured player's zone stint,
   * opens a fresh stint for the replacement, increments swapCount once.
   *
   * Caller must verify `injuredId` is on the field and `replacementId` is on
   * the bench; this is a no-op otherwise (mirroring setInjured's defensive
   * behaviour).
   */
  applyInjurySwap: (injuredId: string, replacementId: string) => void;
  applyFieldZoneSwap: (pidA: string, zoneA: Zone, pidB: string, zoneB: Zone) => void;
  setLineup: (lineup: Lineup) => void;
  startClock: () => void;
  pauseClock: () => void;
  beginNextQuarter: () => void;
  endCurrentQuarter: (quarterMs: number) => void;
  finaliseGame: () => void;
  incTeam: (kind: "goals" | "behinds") => void;
  incOpponent: (kind: "goals" | "behinds") => void;
  incPlayerScore: (playerId: string, kind: "goals" | "behinds") => void;
  undoTeamScore: (kind: "goals" | "behinds") => void;
  undoOpponentScore: (kind: "goals" | "behinds") => void;
  undoPlayerScore: (playerId: string, kind: "goals" | "behinds") => void;
  addBenchPlayer: (playerId: string) => void;
  setInjured: (playerId: string, injured: boolean) => void;
  /**
   * Toggle whether a player is lent to the opposition. Starting a loan closes
   * their current zone stint and moves them to the bench; ending it leaves
   * them on the bench (ready for the next swap).
   */
  setLoaned: (playerId: string, loaned: boolean) => void;
  setLocked: (playerId: string, locked: boolean) => void;
  /** Lock player to a specific zone (they can sub on/off but only to this zone). Pass null to clear. */
  setZoneLocked: (playerId: string, zone: Zone | null) => void;
}

function cloneLineup(l: Lineup): Lineup {
  return normalizeLineup(l);
}

// Every data field of LiveGameState at its blank-slate value. Used by the
// store's create() initializer AND by `init` so that calling init() always
// gives us a clean starting point — non-passed fields fall back to these
// defaults instead of leaking from the previous state. (The previous
// behaviour merged init's payload into `prev`, which left ephemeral fields
// like swapCount / lockedIds / lastStintZone holding values from a prior
// game when a game was reset and re-started.)
const DEFAULT_LIVE_STATE_DATA = {
  activeGameId: null as string | null,
  lineup: emptyLineup(),
  currentQuarter: 0,
  quarterEnded: false,
  finalised: false,
  clockStartedAt: null as number | null,
  accumulatedMs: 0,
  selected: null as LiveGameState["selected"],
  teamScore: { goals: 0, behinds: 0 },
  opponentScore: { goals: 0, behinds: 0 },
  playerScores: {} as Record<string, { goals: number; behinds: number }>,
  basePlayedZoneMs: {} as Record<string, ZoneMs>,
  stintStartMs: {} as Record<string, number>,
  stintZone: {} as Record<string, Zone>,
  swapCount: 0,
  injuredIds: [] as string[],
  loanedIds: [] as string[],
  loanStartMs: {} as Record<string, number>,
  basePlayedLoanMs: {} as Record<string, number>,
  lockedIds: [] as string[],
  lastStintMs: {} as Record<string, number>,
  lastStintZone: {} as Record<string, Zone>,
  zoneLockedPlayers: {} as Record<string, Zone>,
};

export const useLiveGame = create<LiveGameState>((set) => ({
  ...DEFAULT_LIVE_STATE_DATA,

  // init replaces ALL data fields. Caller passes only what they have from
  // the server-side replay; everything else returns to the blank-slate
  // defaults. This is what makes "Restart game" actually clear the slate
  // — without it, fields the caller didn't pass (swapCount, lockedIds,
  // lastStintMs/Zone, zoneLockedPlayers, selected) leaked across resets.
  init: (state) =>
    set((prev) => ({ ...prev, ...DEFAULT_LIVE_STATE_DATA, ...state })),

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

  applyInjurySwap: (injuredId, replacementId) =>
    set((prev) => {
      // Defensive: only fire if injured player is on the field. If they're
      // already on the bench (already injured, or just sitting), the caller
      // shouldn't be invoking this — fall back to a no-op so the UI can keep
      // a single code path without us silently corrupting state.
      const injuredZone = ALL_ZONES.find((z) => prev.lineup[z].includes(injuredId));
      if (!injuredZone) return prev;
      // Same defensive check on the replacement: must be on the bench.
      if (!prev.lineup.bench.includes(replacementId)) return prev;
      // Idempotency for double-taps — if injuredId is already in injuredIds
      // we'd be in an inconsistent state (on-field + injured), but trust the
      // caller and just dedupe.
      const alreadyInjured = prev.injuredIds.includes(injuredId);

      const lineup = cloneLineup(prev.lineup);
      const nowMs = clockElapsedMs(prev);
      const basePlayedZoneMs = { ...prev.basePlayedZoneMs };
      const stintStartMs = { ...prev.stintStartMs };
      const stintZone = { ...prev.stintZone };

      // Close the injured player's open stint.
      const injuredStart = stintStartMs[injuredId] ?? nowMs;
      const injuredStintZone = stintZone[injuredId] ?? injuredZone;
      basePlayedZoneMs[injuredId] = {
        ...(basePlayedZoneMs[injuredId] ?? newZoneMs()),
      };
      basePlayedZoneMs[injuredId][injuredStintZone] += Math.max(0, nowMs - injuredStart);
      delete stintStartMs[injuredId];
      delete stintZone[injuredId];

      // Replace on the field: drop injured from zone, add replacement in.
      lineup[injuredZone] = lineup[injuredZone].map((p) =>
        p === injuredId ? replacementId : p
      );
      // Move injured to bench, replacement off bench.
      lineup.bench = [
        ...lineup.bench.filter((p) => p !== replacementId),
        injuredId,
      ];

      // Open replacement's stint at nowMs in the vacated zone.
      stintStartMs[replacementId] = nowMs;
      stintZone[replacementId] = injuredZone;

      const injuredIds = alreadyInjured
        ? prev.injuredIds
        : [...prev.injuredIds, injuredId];

      return {
        lineup,
        selected: null,
        basePlayedZoneMs,
        stintStartMs,
        stintZone,
        injuredIds,
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
      // Still-loaned players continue their loan into the new quarter. The
      // previous quarter's loan ms has already been flushed by endCurrentQuarter,
      // so we just reset each stint start to 0 (the new quarter's elapsed).
      const loanStartMs: Record<string, number> = {};
      for (const pid of prev.loanedIds) loanStartMs[pid] = 0;
      return {
        currentQuarter: prev.currentQuarter + 1,
        quarterEnded: false,
        accumulatedMs: 0,
        // Don't auto-start the clock — the GM taps Start when the hooter goes.
        clockStartedAt: null,
        stintStartMs,
        stintZone,
        loanStartMs,
        swapCount: prev.swapCount + 1,
        lastStintMs: {},
        lastStintZone: {},
      };
    }),

  endCurrentQuarter: (quarterMs: number) =>
    set((prev) => {
      const now = Date.now();
      const rawAccumulated =
        prev.clockStartedAt === null
          ? prev.accumulatedMs
          : prev.accumulatedMs + (now - prev.clockStartedAt);
      // Cap at quarterMs (passed by caller from getEffectiveQuarterSeconds(team,
      // ageGroup, game) so that if the GM delays confirming end-of-quarter,
      // player stint durations don't leak past the hooter. AFL U10 default = 720s,
      // netball default = 600s; per-team and per-game overrides flow through
      // getEffectiveQuarterSeconds. ABSTRACT-03 / D-26 / D-27.
      const accumulated = Math.min(rawAccumulated, quarterMs);
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
      // Flush active loan stints — beginNextQuarter will restart them at 0.
      const basePlayedLoanMs = { ...prev.basePlayedLoanMs };
      for (const [pid, start] of Object.entries(prev.loanStartMs)) {
        const dur = Math.max(0, accumulated - start);
        basePlayedLoanMs[pid] = (basePlayedLoanMs[pid] ?? 0) + dur;
      }
      return {
        clockStartedAt: null,
        accumulatedMs: accumulated,
        quarterEnded: true,
        basePlayedZoneMs,
        stintStartMs: {},
        stintZone: {},
        basePlayedLoanMs,
        loanStartMs: {},
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

  setLoaned: (playerId, loaned) =>
    set((prev) => {
      const wasLoaned = prev.loanedIds.includes(playerId);
      if (loaned && wasLoaned) return prev;
      if (!loaned && !wasLoaned) return prev;

      const nowMs = clockElapsedMs(prev);

      if (!loaned) {
        // End the loan: accumulate elapsed loan ms and drop the start marker.
        // Player stays on bench (they're already there).
        const basePlayedLoanMs = { ...prev.basePlayedLoanMs };
        const loanStartMs = { ...prev.loanStartMs };
        const start = loanStartMs[playerId] ?? nowMs;
        basePlayedLoanMs[playerId] =
          (basePlayedLoanMs[playerId] ?? 0) + Math.max(0, nowMs - start);
        delete loanStartMs[playerId];
        return {
          loanedIds: prev.loanedIds.filter((p) => p !== playerId),
          loanStartMs,
          basePlayedLoanMs,
        };
      }

      // Start the loan. If the player is on the field, close their zone stint
      // and move them to the bench (same pattern as setInjured).
      const lineup = cloneLineup(prev.lineup);
      const basePlayedZoneMs = { ...prev.basePlayedZoneMs };
      const stintStartMs = { ...prev.stintStartMs };
      const stintZone = { ...prev.stintZone };
      const onFieldZone = ALL_ZONES.find((z) => lineup[z].includes(playerId));
      if (onFieldZone) {
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
        loanedIds: [...prev.loanedIds, playerId],
        loanStartMs: { ...prev.loanStartMs, [playerId]: nowMs },
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
