"use client";

// ─── Netball Quarter Break ────────────────────────────────────
// Netball's engine (the position suggester with pinned locks, the
// position cycle, the plan-ahead seed, the staged draft, the lend /
// injured / arrived / out writers) adapted onto the one break screen
// every sport shares (quarter-break/PeriodBreak). Each slot is a bib:
// a swap moves the kids, the bib stays with the slot. The layout lives
// there; nothing here draws a third or a tile.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enqueueLiveAction } from "@/lib/live/registerLiveActions";
import { liveEvents } from "@/lib/live/optimisticEvents";
import type { OptimisticWrite } from "@/lib/live/useOptimisticEvents";
import { queuedStartClockMark } from "@/lib/live/useClockPause";
import { setNetballOnFieldSize } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/netball-actions";
import { type InjuryReplacementCandidate } from "@/components/live/InjuryReplacementModal";
import { ScoreReviewPanel } from "@/components/live/ScoreReviewPanel";
import { QuarterScoreTable } from "@/components/live/QuarterScoreTable";
import { netballShortCourtNote, netballSport, pickNetballPositionsToFill, primaryThirdFor } from "@/lib/sports/netball";
import {
  type GenericLineup,
  type PlayerThirdMs,
  gamePositionCounts,
  lastQuarterThirds,
  lastQuarterTeammatesInThird,
  playerThirdMs,
  replayNetballGame,
  seasonAvailability,
  seasonPositionCounts,
  suggestNetballLineup,
} from "@/lib/sports/netball/fairness";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import { consumePeriodPin, seedNextPeriodLineup } from "@/lib/game-plan";
import { benchPlayerInPositionLineup, repeatPositionLineup } from "@/lib/live/lineupOps";
import { useStagedBreakDraft } from "@/lib/live/useStagedBreakDraft";
import { hapticTap } from "@/lib/haptics";
import type { AgeGroupConfig } from "@/lib/sports/types";
import type { Game, GameEvent, LiveAuth, Player } from "@/lib/types";
import { cycleLineup, netballRuleCheck } from "@/lib/sports/netball/engine";
import { pairScoreUndos } from "@/lib/live/scoreUndo";
import type { RuleCheckItem } from "@/lib/playbook/ruleCheck";
import { breakConfigFor } from "@/lib/sports/break";
import { PeriodBreak, type BreakPlayer, type BreakStrategy } from "@/components/quarter-break/PeriodBreak";
import { buildBoard, placesOf, swapInStaged, type BoardSlot, type StagedLineup } from "@/lib/live/break/board";
import { breakIssues } from "@/lib/live/break/issues";

type NetballMode = "suggested" | "rotate" | "keep" | "manual";

// The break screen's strategy names over netball's modes ("keep" is
// the screen's Repeat; Rotate is the position cycle).
const STRATEGY_OF: Record<NetballMode, BreakStrategy> = {
  suggested: "suggested",
  rotate: "rotate",
  keep: "repeat",
  manual: "manual",
};
const MODE_OF: Record<BreakStrategy, NetballMode> = {
  suggested: "suggested",
  rotate: "rotate",
  repeat: "keep",
  manual: "manual",
};

interface Props {
  auth: LiveAuth;
  /** The live screen's optimistic write: Start shows at once, with or without signal. */
  write: OptimisticWrite;
  gameId: string;
  game: Game;
  /** The top bar's Exit. */
  exitHref?: string;
  /** The top bar's "?" (the walkthrough). */
  onHelp?: () => void;
  squad: Player[];
  availableIds: string[];
  ageGroup: AgeGroupConfig;
  /** Quarter that just ended (1, 2, or 3). nextQuarter = currentQuarter + 1. */
  currentQuarter: number;
  /** Lineup at the end of the quarter that just played — the "stays" baseline. */
  previousLineup: GenericLineup;
  /** Lock-for-next-break entries from the live actions menu. Pre-applied to the suggested seed. */
  preAppliedLocks: Record<string, string>;
  /** Quarter length in seconds. */
  periodSeconds: number;
  thisGameEvents: GameEvent[];
  seasonEvents: GameEvent[];
  injuredIds: Set<string>;
  /** Of the injured, the kids who went home: "Went home" (lib/live/wentHome). */
  wentHomeIds?: ReadonlySet<string>;
  /** A kid marked out here: the live screen shows them as gone home at once. */
  onWentHome?: (playerId: string) => void;
  loanedIds: Set<string>;
  /** Per-player goals scored this game — the score on each tile. */
  playerGoals: Record<string, number>;
  /** Whether the team has scoring tracked on: the score chip shows. */
  trackScoring?: boolean;
  /**
   * Per-player time-by-third map computed by the parent, mid-quarter
   * subs included (segment accounting in NetballLiveGame), so a
   * substitute doesn't show 0:00 while the player they replaced keeps
   * the credit.
   */
  playerStats?: Map<string, PlayerThirdMs>;
  /**
   * Mid-quarter substitution log for the quarter just ended, threaded
   * into period_break_swap's metadata so the replay splits the closing
   * quarter's time between sub-out and sub-in players.
   */
  midQuarterSubs: Array<{
    positionId: string;
    outPlayerId: string | null;
    inPlayerId: string | null;
    atMs: number;
  }>;
  /** Cohort-chip mode map (AFL parity, Steve 2026-05-16). */
  chipModeByKey?: Partial<Record<"a" | "b" | "c", import("@/lib/chips").ChipMode>>;
  /** How we play for the netball suggester (UX plan Phase 5). */
  netballPlaybook?: import("@/lib/sports/netball/engine").NetballPlaybookInput;
  /**
   * Short-squad on-court size (Steve 2026-05-23). Omitted: the age
   * group's full strength. The break keeps whichever positions the last
   * quarter had filled.
   */
  currentOnFieldSize?: number;
  /** Called once the period_break_swap + quarter_start actions complete. */
  onStarted: () => void;
}

const stagedOf = (l: GenericLineup): StagedLineup => ({ groups: l.positions, bench: l.bench });
const lineupOf = (s: StagedLineup): GenericLineup => ({ positions: s.groups, bench: s.bench });

export function NetballQuarterBreak({
  auth,
  write,
  gameId,
  game,
  exitHref,
  onHelp,
  squad,
  availableIds,
  ageGroup,
  currentQuarter,
  previousLineup,
  preAppliedLocks,
  periodSeconds,
  thisGameEvents,
  seasonEvents,
  injuredIds,
  wentHomeIds,
  onWentHome,
  loanedIds,
  playerGoals,
  playerStats,
  midQuarterSubs,
  trackScoring = true,
  chipModeByKey = {},
  netballPlaybook,
  currentOnFieldSize,
  onStarted,
}: Props) {
  const nextQuarter = currentQuarter + 1;
  const playersById = useMemo(() => new Map(squad.map((p) => [p.id, p])), [squad]);
  const positions = ageGroup.positions;

  // F2 plan-ahead pin (ROTPLAN-02): the same shared `plannedRotation`
  // slice AFL uses; netball positions are the seed's opaque groupIds.
  const plannedRotation = useLiveGame((s) => s.plannedRotation);
  const setPlannedRotation = useLiveGame((s) => s.setPlannedRotation);

  // Short-squad target for this break, clamped to the age group's range.
  const effectiveOnFieldSize = Math.max(
    ageGroup.minOnFieldSize,
    Math.min(ageGroup.maxOnFieldSize, Math.floor(currentOnFieldSize ?? ageGroup.defaultOnFieldSize)),
  );

  // Positions to fill next quarter: last quarter's filled positions when
  // they add up to the on-court size (a coach's "leave WA blank" choice
  // survives), else the default fill priority.
  const positionsToFill = useMemo(() => {
    const filled = new Set(positions.filter((p) => (previousLineup.positions[p]?.length ?? 0) > 0));
    if (filled.size === effectiveOnFieldSize) {
      return pickNetballPositionsToFill(ageGroup, effectiveOnFieldSize, filled);
    }
    return pickNetballPositionsToFill(ageGroup, effectiveOnFieldSize);
  }, [ageGroup, previousLineup, positions, effectiveOnFieldSize]);

  const sidelinedSet = useMemo(() => {
    const s = new Set<string>();
    injuredIds.forEach((id) => s.add(id));
    loanedIds.forEach((id) => s.add(id));
    return s;
  }, [injuredIds, loanedIds]);
  // Pool: availableIds + anyone on court last quarter (mid-quarter
  // fill-ins), minus injured/loaned.
  const candidatePool = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (id: string) => {
      if (id && !seen.has(id) && !sidelinedSet.has(id)) {
        seen.add(id);
        out.push(id);
      }
    };
    for (const id of availableIds) add(id);
    for (const ids of Object.values(previousLineup.positions)) for (const id of ids) add(id);
    for (const id of previousLineup.bench) add(id);
    return out;
  }, [availableIds, previousLineup, sidelinedSet]);

  // Per-player time on court (ms) by third.
  const thirdMs = useMemo(() => {
    if (playerStats) return playerStats;
    return playerThirdMs(
      thisGameEvents,
      null,
      periodSeconds,
      primaryThirdFor as (positionId: string) => "attack-third" | "centre-third" | "defence-third" | null,
    );
  }, [playerStats, thisGameEvents, periodSeconds]);
  const totalMsByPlayer = useMemo(() => {
    const out: Record<string, number> = {};
    thirdMs.forEach((stats, pid) => {
      out[pid] = stats.attack + stats.centre + stats.defence;
    });
    return out;
  }, [thirdMs]);

  const suggestedLineup = useMemo(() => {
    const season = seasonPositionCounts(seasonEvents);
    const thisGame = gamePositionCounts(thisGameEvents);
    const thirdLookup = primaryThirdFor as (positionId: string) => "attack-third" | "centre-third" | "defence-third" | null;
    const lastThirds = lastQuarterThirds(thisGameEvents, thirdLookup);
    const prevTeammates = lastQuarterTeammatesInThird(thisGameEvents, thirdLookup);
    // SUB-01/B4 recency guard: a kid who only just came on isn't churned
    // straight back off when tied on game time.
    const lastSubbedOnMs = replayNetballGame(thisGameEvents).lastSubbedOnMs;
    const seasonAvail = seasonAvailability(seasonEvents);
    // Cohort chips retired with How we play (UX plan 5.8): their intent now lives in roles and rules.
    const chipByPlayerId = Object.fromEntries(squad.map((p) => [p.id, null]));
    const base = suggestNetballLineup({
      playerIds: candidatePool,
      positions: positionsToFill,
      season,
      thisGame,
      isAllowed: (_pid, posId) => positions.includes(posId),
      seed: nextQuarter,
      thirdOf: thirdLookup,
      lastQuarterThird: lastThirds,
      previousTeammates: prevTeammates,
      thisGameTotalMs: totalMsByPlayer,
      seasonAvailability: seasonAvail,
      chipByPlayerId,
      chipModeByKey,
      lastSubbedOnMs,
      playbook: netballPlaybook ? { ...netballPlaybook, previousLineup } : undefined,
    });
    // Pre-apply locks: the locked kid goes to their locked bib. A kid
    // displaced from it takes the locked kid's old bib (no hole), else
    // the bench.
    if (Object.keys(preAppliedLocks).length === 0) return base;
    const next: GenericLineup = { positions: {}, bench: [...base.bench] };
    for (const id of positions) next.positions[id] = [...(base.positions[id] ?? [])];
    for (const [posId, lockedPid] of Object.entries(preAppliedLocks)) {
      let lockedFromPos: string | null = null;
      for (const id of Object.keys(next.positions)) {
        if (next.positions[id].includes(lockedPid)) {
          lockedFromPos = id;
          break;
        }
      }
      const lockedFromBench = next.bench.includes(lockedPid);
      const displacedAtTarget = (next.positions[posId] ?? []).filter((p) => p !== lockedPid);
      if (lockedFromPos && lockedFromPos !== posId) {
        next.positions[lockedFromPos] = next.positions[lockedFromPos].filter((p) => p !== lockedPid);
      }
      if (lockedFromBench) next.bench = next.bench.filter((p) => p !== lockedPid);
      next.positions[posId] = [lockedPid];
      for (const p of displacedAtTarget) {
        if (p === lockedPid) continue;
        if (lockedFromPos && lockedFromPos !== posId && next.positions[lockedFromPos].length === 0) {
          next.positions[lockedFromPos] = [p];
        } else if (!next.bench.includes(p)) {
          next.bench.push(p);
        }
      }
    }
    return next;
  }, [
    candidatePool,
    positions,
    positionsToFill,
    seasonEvents,
    thisGameEvents,
    nextQuarter,
    preAppliedLocks,
    totalMsByPlayer,
    squad,
    chipModeByKey,
    netballPlaybook,
    previousLineup,
  ]);

  // ─── F2 next-period pre-seed (ROTPLAN-02 / D-13) ─────────────
  const upcomingPeriodIndex = nextQuarter - 1;
  const seededDraft = useMemo<GenericLineup | null>(() => {
    const seed = seedNextPeriodLineup({
      pin: plannedRotation && plannedRotation.gameId === gameId ? plannedRotation : null,
      periodIndex: upcomingPeriodIndex,
      // Only kids who can play may be fielded (D-13).
      availableIds: candidatePool,
      groupIds: positions,
    });
    if (!seed) return null;
    const positionsObj: Record<string, string[]> = {};
    for (const id of positions) positionsObj[id] = seed.groups[id] ?? [];
    const placed = new Set(Object.values(seed.groups).flat());
    const onBench = new Set(seed.bench);
    const extraBench = candidatePool.filter((id) => !placed.has(id) && !onBench.has(id));
    return { positions: positionsObj, bench: [...seed.bench, ...extraBench] };
  }, [plannedRotation, gameId, upcomingPeriodIndex, candidatePool, positions]);
  const hasPlannedSeed = seededDraft !== null;

  // ─── Draft + strategy ───────────────────────────────────────
  const [draft, setDraft] = useState<GenericLineup>(suggestedLineup);
  // Initial mode defers to the live store's rotationMode, so a coach
  // who picked Manual (or Rotate) keeps it at every break; Repeat
  // ("keep") is a per-break decision and never persists.
  const persistedRotationMode = useLiveGame((s) => s.rotationMode);
  const setPersistedRotationMode = useLiveGame((s) => s.setRotationMode);
  const [lineupMode, setLineupMode] = useState<NetballMode>(
    persistedRotationMode === "manual" ? "manual" : persistedRotationMode === "rotate" ? "rotate" : "suggested",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  // Kids brought back at this break (recovered, back from a loan): they
  // default to the bench so the coach decides if and where they go on.
  const [forcedBenchIds, setForcedBenchIds] = useState<Set<string>>(new Set());

  // Manual: every position empty, the pool on the bench.
  const manualLineup = useMemo<GenericLineup>(() => {
    const positionsObj: Record<string, string[]> = {};
    for (const id of positions) positionsObj[id] = [];
    return { positions: positionsObj, bench: [...candidatePool] };
  }, [positions, candidatePool]);

  // Rotate: the position cycle (GS → GA → … → GK → bench → GS).
  const rotatedLineup = useMemo<GenericLineup>(() => {
    const cycled = cycleLineup(previousLineup, positionsToFill, candidatePool, netballPlaybook);
    for (const id of positions) cycled.positions[id] ??= [];
    return cycled;
  }, [previousLineup, positionsToFill, candidatePool, netballPlaybook, positions]);

  // Repeat: last quarter's court again. A late arrival (not in last
  // quarter's lineup) joins the bench rather than vanishing (UX audit
  // 23 Oct 2026, P1).
  const repeatedLineup = useMemo<GenericLineup>(
    () => repeatPositionLineup(previousLineup, candidatePool),
    [previousLineup, candidatePool],
  );

  // Only re-derive `draft` when the coach explicitly changes the mode
  // (ambient recomputes must never stomp their edits, Steve 2026-05-09).
  // Kids brought back this break stay on the bench whatever the mode.
  const lastAppliedModeRef = useRef<NetballMode | null>(null);
  const didSeedRef = useRef(false);
  useEffect(() => {
    if (didSeedRef.current) return;
    if (!seededDraft) return;
    didSeedRef.current = true;
    setDraft(seededDraft);
    lastAppliedModeRef.current = lineupMode;
  }, [seededDraft, lineupMode]);
  useEffect(() => {
    if (lastAppliedModeRef.current === lineupMode) return;
    lastAppliedModeRef.current = lineupMode;
    const base =
      lineupMode === "suggested"
        ? suggestedLineup
        : lineupMode === "rotate"
          ? rotatedLineup
          : lineupMode === "manual"
            ? manualLineup
            : repeatedLineup;
    if (forcedBenchIds.size === 0) {
      setDraft(base);
      return;
    }
    const next: GenericLineup = {
      positions: Object.fromEntries(Object.entries(base.positions).map(([k, v]) => [k, [...v]])),
      bench: [...base.bench],
    };
    forcedBenchIds.forEach((pid) => {
      let courtPos: string | null = null;
      for (const [posId, ids] of Object.entries(next.positions)) {
        if (ids.includes(pid)) {
          courtPos = posId;
          break;
        }
      }
      if (courtPos) {
        const swapPartner = next.bench.find((b) => !forcedBenchIds.has(b));
        if (swapPartner) {
          next.positions[courtPos] = next.positions[courtPos].map((p) => (p === pid ? swapPartner : p));
          next.bench = next.bench.filter((p) => p !== swapPartner);
          if (!next.bench.includes(pid)) next.bench.push(pid);
        }
      } else if (!next.bench.includes(pid)) {
        next.bench.push(pid);
      }
    });
    setDraft(next);
  }, [lineupMode, suggestedLineup, rotatedLineup, repeatedLineup, manualLineup, forcedBenchIds]);

  // The staged lineup survives leaving the live screen (the team page
  // and back, a reload, the app backgrounded): kept in the live store,
  // restored over the seed and suggestion above. Shared with every sport.
  const stagedForStore = useMemo(() => stagedOf(draft), [draft]);
  const stagedBreakDraft = useStagedBreakDraft({
    gameId,
    period: nextQuarter,
    groupIds: positions,
    availableIds: candidatePool,
    staged: stagedForStore,
    mode: lineupMode,
    onRestore: (restored) => {
      setDraft(lineupOf(restored));
      const mode = restored.mode as NetballMode;
      if (["suggested", "rotate", "keep", "manual"].includes(mode)) {
        lastAppliedModeRef.current = mode;
        setLineupMode(mode);
      }
      didSeedRef.current = true;
    },
  });

  function positionOfPlayer(pid: string, l: GenericLineup): string | null {
    for (const [posId, ids] of Object.entries(l.positions)) if (ids.includes(pid)) return posId;
    return null;
  }

  // A kid brought back joins the staged bench now, bench-default.
  function restoreToBench(playerId: string) {
    setForcedBenchIds((prev) => new Set(prev).add(playerId));
    setDraft((prev) =>
      prev.bench.includes(playerId) || Object.values(prev.positions).some((ids) => ids.includes(playerId))
        ? prev
        : { ...prev, bench: [...prev.bench, playerId] },
    );
  }
  // Sidelined at the break: off the staged court, no longer bench-default.
  function sidelineInDraft(playerId: string) {
    setForcedBenchIds((prev) => {
      if (!prev.has(playerId)) return prev;
      const next = new Set(prev);
      next.delete(playerId);
      return next;
    });
    setDraft((prev) => benchPlayerInPositionLineup(prev, playerId));
  }

  // ─── Score (from this game's events; undos cancel their score) ──
  const scoreByQuarter = useMemo(() => {
    const periods: Array<{ ours: number; theirs: number }> = [
      { ours: 0, theirs: 0 },
      { ours: 0, theirs: 0 },
      { ours: 0, theirs: 0 },
      { ours: 0, theirs: 0 },
    ];
    const undoneTargets = new Set(
      pairScoreUndos(
        [...thisGameEvents].sort((a, b) => a.created_at.localeCompare(b.created_at)),
        new Set(["goal", "opponent_goal"]),
      ).values(),
    );
    for (const ev of thisGameEvents) {
      if (ev.type !== "goal" && ev.type !== "opponent_goal") continue;
      if (undoneTargets.has(ev.id)) continue;
      const meta = ev.metadata as { quarter?: number; intended_quarter?: number } | null;
      const q =
        typeof meta?.intended_quarter === "number" ? meta.intended_quarter : typeof meta?.quarter === "number" ? meta.quarter : 0;
      if (q < 1 || q > 4) continue;
      if (ev.type === "goal") periods[q - 1].ours++;
      else periods[q - 1].theirs++;
    }
    return periods;
  }, [thisGameEvents]);
  const cumUs = scoreByQuarter.reduce((a, p) => a + p.ours, 0);
  const cumThem = scoreByQuarter.reduce((a, p) => a + p.theirs, 0);

  // ─── Game settings: players on court, lend, injured, arrived, out ──
  const sizeOptions = useMemo(() => {
    const opts: number[] = [];
    for (let n = ageGroup.maxOnFieldSize; n >= ageGroup.minOnFieldSize; n--) opts.push(n);
    return opts;
  }, [ageGroup.maxOnFieldSize, ageGroup.minOnFieldSize]);
  const [sizePending, startSizeTransition] = useTransition();
  const [sizeError, setSizeError] = useState<string | null>(null);

  function handleOnFieldSizeChange(next: number) {
    setSizeError(null);
    const clamped = Math.max(ageGroup.minOnFieldSize, Math.min(ageGroup.maxOnFieldSize, next));
    if (clamped === effectiveOnFieldSize) return;
    startSizeTransition(async () => {
      const result = await setNetballOnFieldSize(auth, gameId, clamped);
      if (!result.success) setSizeError(result.error);
    });
  }

  function handleLendToggleAtBreak(pid: string, nextLoaned: boolean) {
    // A kid lent at the break sits out from the next quarter; brought
    // back, onto the bench.
    if (nextLoaned) sidelineInDraft(pid);
    else restoreToBench(pid);
    enqueueLiveAction("markLoan", [auth, gameId, { player_id: pid, loaned: nextLoaned, quarter: nextQuarter, elapsed_ms: 0 }]);
  }
  function handleInjuryToggleAtBreak(pid: string, nextInjured: boolean) {
    // An injured player can't stay on court (Steve 2026-06-15): off the
    // staged court, their bib left empty for the coach to fill.
    if (nextInjured) sidelineInDraft(pid);
    else restoreToBench(pid);
    enqueueLiveAction("markInjury", [auth, gameId, { player_id: pid, injured: nextInjured, quarter: nextQuarter, elapsed_ms: 0 }]);
  }

  // A squad member who turns up at the break (AVAIL-02): onto the bench.
  function handleAddArrived(playerId: string) {
    setDraft((prev) => (prev.bench.includes(playerId) ? prev : { ...prev, bench: [...prev.bench, playerId] }));
    const { flushed } = enqueueLiveAction("addLateArrival", [
      auth,
      gameId,
      { player_id: playerId, quarter: nextQuarter, elapsed_ms: 0 },
    ]);
    flushed.then(() => router.refresh());
  }

  // Mark a player out. Netball has no swap event at the break: the out
  // is a markInjury reason "out"; a replacement takes the vacated bib in
  // the staged lineup (committed by period_break_swap at Start).
  function handleOut(outId: string, replacementId: string | null) {
    const positionId = positionOfPlayer(outId, draft);
    setDraft((prev) => {
      const next: GenericLineup = {
        positions: Object.fromEntries(
          Object.entries(prev.positions).map(([k, v]) => [k, v.filter((p) => p !== outId && p !== replacementId)]),
        ),
        bench: prev.bench.filter((p) => p !== outId && p !== replacementId),
      };
      if (replacementId && positionId) next.positions[positionId] = [replacementId];
      return next;
    });
    onWentHome?.(outId);
    enqueueLiveAction("markInjury", [
      auth,
      gameId,
      { player_id: outId, injured: true, quarter: nextQuarter, elapsed_ms: 0, reason: "out" },
    ]);
  }

  const outReplacementCandidates = useMemo<InjuryReplacementCandidate[]>(() => {
    return draft.bench
      .filter((id) => !sidelinedSet.has(id))
      .map((id) => playersById.get(id))
      .filter((p): p is Player => !!p)
      .map((p) => ({ player: p, totalMs: totalMsByPlayer[p.id] ?? 0 }))
      .sort((a, b) => a.totalMs - b.totalMs);
  }, [draft.bench, sidelinedSet, playersById, totalMsByPlayer]);

  // ─── Start ──────────────────────────────────────────────────
  // Start Q{n} (the sheet's "now" or "anyway"): period_break_swap, then
  // quarter_start. Nobody injured, lent or out starts on court however
  // the draft got there; kids brought back count as available.
  function handleConfirmQuarterStart() {
    setError(null);
    let staged = draft;
    sidelinedSet.forEach((pid) => {
      if (!forcedBenchIds.has(pid)) staged = benchPlayerInPositionLineup(staged, pid);
    });
    // Sidelined kids stay in the game, on the bench: nobody is lost from
    // the lineup, whichever strategy built the draft.
    staged = { ...staged, bench: withSidelined(staged).bench };
    // Optimistic writes through the live screen's `write`: the quarter
    // starts at the tap, with or without signal (it used to wait for the
    // save and a refresh). With no signal the clock's start rides along
    // too (queuedStartClockMark).
    const mark = queuedStartClockMark(nextQuarter);
    startTransition(() => {
      write(
        "periodBreakSwap",
        [auth, gameId, nextQuarter, staged, midQuarterSubs],
        liveEvents.netballBreakSwap({ quarter: nextQuarter, lineup: staged, midQuarterSubs }),
      );
      write("startNetballQuarter", [auth, gameId, nextQuarter], liveEvents.periodStart(nextQuarter));
      if (mark) write("recordClockPause", [auth, gameId, mark], liveEvents.clockPause(mark));
      // The staged lineup is now the quarter's: nothing left to restore.
      stagedBreakDraft.clear();
      onStarted();
      // D-14: this period's plan is used; later planned periods stay.
      if (plannedRotation && plannedRotation.gameId === gameId) {
        setPlannedRotation(consumePeriodPin(plannedRotation, upcomingPeriodIndex));
      }
      // Medium haptic — the "go!" tap, aligned to the umpire's whistle.
      void hapticTap("medium");
    });
  }

  // ─── The break screen ───────────────────────────────────────
  const config = useMemo(
    () => breakConfigFor("netball", ageGroup, { onFieldSize: effectiveOnFieldSize }),
    [ageGroup, effectiveOnFieldSize],
  );

  // Who's sidelined among the kids in this game, and why.
  const sidelined = useMemo(() => {
    const out: Record<string, string> = {};
    loanedIds.forEach((id) => {
      if (playersById.has(id)) out[id] = "Lent";
    });
    injuredIds.forEach((id) => {
      if (playersById.has(id)) out[id] = wentHomeIds?.has(id) ? "Went home" : "Injured";
    });
    forcedBenchIds.forEach((id) => delete out[id]);
    return out;
  }, [injuredIds, loanedIds, playersById, forcedBenchIds, wentHomeIds]);
  const sidelinedNow = useMemo(() => new Set(Object.keys(sidelined)), [sidelined]);

  // The board: the staged lineup, with sidelined kids at the end of the
  // bench (faded, not tappable) rather than in a strip of their own.
  const withSidelined = (l: GenericLineup): StagedLineup => {
    const s = stagedOf(l);
    const onBoard = new Set([...Object.values(s.groups).flat(), ...s.bench]);
    return { groups: s.groups, bench: [...s.bench, ...Object.keys(sidelined).filter((id) => !onBoard.has(id))] };
  };
  const board = useMemo(
    () => buildBoard(config.zones, withSidelined(draft), sidelinedNow),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.zones, draft, sidelined, sidelinedNow],
  );
  const previous = useMemo(() => placesOf(stagedOf(previousLineup)), [previousLineup]);

  // Rules: the lineup's validity (an empty bib, a kid in two places) is
  // a broken rule with a Fix, never a block; then the team's rules.
  const ruleCheck = useMemo(() => {
    const names: Record<string, string> = {};
    for (const p of squad) names[p.id] = p.full_name;
    return (lineup: GenericLineup): RuleCheckItem[] => {
      // Kids who can't play aren't held to the rules.
      const l = { ...lineup, bench: lineup.bench.filter((id) => !sidelinedNow.has(id)) };
      const valid = netballSport.validateLineup?.(l, ageGroup, effectiveOnFieldSize);
      const errors: RuleCheckItem[] = (valid?.issues ?? [])
        .filter((i) => i.kind === "error")
        .map((i, n) => ({ id: `lineup-${n}`, status: "fail", text: i.message, rule: "Every position on court has a player" }));
      const team = netballPlaybook
        ? netballRuleCheck({
            lineup: l,
            previousLineup,
            names,
            thirdMs,
            period: nextQuarter,
            periodCount: ageGroup.periodCount ?? 4,
            periodMs: periodSeconds * 1000,
            input: netballPlaybook,
          }).items
        : [];
      return [...errors, ...team];
    };
  }, [squad, ageGroup, effectiveOnFieldSize, netballPlaybook, previousLineup, thirdMs, nextQuarter, periodSeconds, sidelinedNow]);

  const issues = useMemo(
    () =>
      breakIssues({
        lineup: draft,
        check: ruleCheck,
        board: (l) => buildBoard(config.zones, withSidelined(l), sidelinedNow),
        swap: (l, a, b) => lineupOf(swapInStaged(stagedOf(l), a, b)),
        sidelined: sidelinedNow,
        // An empty bib is already a broken rule here, unless the court
        // is played short: then the check aims at the smaller court.
        emptySpots: false,
        extraWarnings:
          effectiveOnFieldSize < ageGroup.positions.length
            ? [netballShortCourtNote(draft.positions, ageGroup.positions)].filter((n): n is string => !!n)
            : [],
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, ruleCheck, config.zones, sidelined, sidelinedNow, ageGroup.positions, effectiveOnFieldSize],
  );

  const asBreakPlayer = (p: Player): BreakPlayer => ({ id: p.id, name: p.full_name, jerseyNumber: p.jersey_number });
  const breakPlayers = useMemo(() => new Map(squad.map((p) => [p.id, asBreakPlayer(p)])), [squad]);
  const scores = useMemo(() => {
    const out: Record<string, { text: string; label: string }> = {};
    for (const [pid, n] of Object.entries(playerGoals)) if (n > 0) out[pid] = { text: String(n), label: `${n} goals` };
    return out;
  }, [playerGoals]);
  const inLineup = new Set<string>([...draft.bench, ...Object.values(draft.positions).flat()]);
  const availSet = new Set(availableIds);
  const healthyNotSidelined = squad.filter((p) => !sidelinedNow.has(p.id));

  function onSwap(a: BoardSlot, b: BoardSlot) {
    setDraft((prev) => lineupOf(swapInStaged(stagedOf(prev), a, b)));
  }

  return (
    <PeriodBreak
      header={{ exitHref, game, onHelp }}
      config={config}
      nextPeriod={nextQuarter}
      slots={board}
      players={breakPlayers}
      previous={previous}
      gameMs={totalMsByPlayer}
      scores={scores}
      sidelined={sidelined}
      onSwap={onSwap}
      strategy={STRATEGY_OF[lineupMode]}
      onStrategy={(next) => {
        const mode = MODE_OF[next];
        if (mode === lineupMode) return;
        setLineupMode(mode);
        // Repeat is a one-off per-break decision: never persisted.
        if (mode !== "keep") setPersistedRotationMode(mode);
      }}
      issues={issues}
      score={
        trackScoring && currentQuarter >= 1
          ? {
              line: config.formatScore({ us: { goal: cumUs }, them: { goal: cumThem } }),
              editor: (
                <div className="space-y-4">
                  <QuarterScoreTable
                    scoreByQuarter={[
                      { ours: { goals: 0 }, theirs: { goals: 0 } },
                      ...scoreByQuarter.map((q) => ({ ours: { goals: q.ours }, theirs: { goals: q.theirs } })),
                    ]}
                    currentQuarter={currentQuarter}
                    quarterEnded={true}
                    sport="netball"
                    teamName="Us"
                    opponentName={game.opponent || "Them"}
                  />
                  <div className="border-t border-hairline pt-4">
                    <ScoreReviewPanel
                      auth={auth}
                      gameId={gameId}
                      players={squad}
                      includeBehinds={false}
                      defaultQuarter={currentQuarter}
                    />
                  </div>
                </div>
              ),
            }
          : undefined
      }
      settings={{
        size: {
          value: effectiveOnFieldSize,
          options: sizeOptions,
          defaultValue: ageGroup.defaultOnFieldSize,
          word: "Players on court",
          onChange: handleOnFieldSizeChange,
          pending: sizePending,
          error: sizeError,
        },
        injured: {
          players: squad.filter((p) => injuredIds.has(p.id) && !forcedBenchIds.has(p.id)).map(asBreakPlayer),
          candidates: healthyNotSidelined.map(asBreakPlayer),
          onToggle: handleInjuryToggleAtBreak,
        },
        lent: {
          players: squad
            .filter((p) => loanedIds.has(p.id) && !injuredIds.has(p.id) && !forcedBenchIds.has(p.id))
            .map(asBreakPlayer),
          candidates: healthyNotSidelined.map(asBreakPlayer),
          onToggle: handleLendToggleAtBreak,
        },
        arrived: {
          candidates: squad.filter((p) => !inLineup.has(p.id) && !availSet.has(p.id) && !sidelinedNow.has(p.id)).map(asBreakPlayer),
          onAdd: handleAddArrived,
        },
        markOut: {
          candidates: Object.values(draft.positions)
            .flat()
            .filter((id) => !sidelinedNow.has(id))
            .map((id) => playersById.get(id))
            .filter((p): p is Player => !!p)
            .map(asBreakPlayer),
          replacements: outReplacementCandidates,
          spotLabel: (pid) => positionOfPlayer(pid, draft)?.toUpperCase() ?? null,
          player: (pid) => playersById.get(pid),
          onOut: handleOut,
        },
      }}
      banner={
        hasPlannedSeed ? (
          <p
            data-testid="planned-seed-banner"
            className="text-center font-mono text-nano font-bold uppercase tracking-micro text-brand-700"
          >
            Pre-filled from your planned Q{nextQuarter} lineup
          </p>
        ) : undefined
      }
      start={{ onStart: handleConfirmQuarterStart, pending: isPending, cue: "umpire calls play", error }}
    />
  );
}
