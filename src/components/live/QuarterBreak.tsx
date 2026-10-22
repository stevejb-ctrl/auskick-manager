"use client";

// AFL's quarter break: its engine (the fairness suggester, Rotate, the
// plan-ahead seed, the staged draft, the writers) adapted onto the one
// break screen every sport shares (quarter-break/PeriodBreak). The
// layout lives there; nothing here draws a zone or a tile.

import { useRouter } from "next/navigation";
import { startTransition as reactStartTransition, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { rotateLines } from "@/lib/live/rotateLines";
import { type InjuryReplacementCandidate } from "@/components/live/InjuryReplacementModal";
import { enqueueLiveAction } from "@/lib/live/registerLiveActions";
import { Guernsey, SFButton } from "@/components/sf";
import {
  markInjury,
  markLoan,
  recordLineupSet,
  setOnFieldSize as setOnFieldSizeAction,
  startQuarter as startQuarterAction,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import { type ChipMode } from "@/lib/chips";
import {
  ALL_ZONES,
  deriveEffectiveZoneCaps,
  suggestStartingLineup,
  zoneCapsFor,
  zoneTeammatesFromLineup,
  type PlayerZoneMinutes,
  type SeasonAvailability,
  type ZoneCaps,
  type ZoneMinutes,
} from "@/lib/fairness";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import { hapticTap } from "@/lib/haptics";
import { emptyLineup, type Game, type Lineup, type Player, type PositionModel, type Zone } from "@/lib/types";
import type { AgeGroupConfig } from "@/lib/sports/types";
import { positionsFor, ZONE_SHORT_LABELS } from "@/lib/ageGroups";
import { QuarterScoreTable } from "@/components/live/QuarterScoreTable";
import { ScoreReviewPanel } from "@/components/live/ScoreReviewPanel";
import { consumePeriodPin, seedNextPeriodLineup } from "@/lib/game-plan";
import { benchPlayerInLineup, benchSidelinedInLineup, replaceInLineup } from "@/lib/live/lineupOps";
import { useStagedBreakDraft } from "@/lib/live/useStagedBreakDraft";
import { Modal } from "@/components/ui/Modal";
import { PlayerInsightSummary } from "@/components/live/PlayerInsightSummary";
import { breakInsightInput } from "@/lib/player-insight";
import { getSportConfig } from "@/lib/sports/registry";
import { breakConfigFor } from "@/lib/sports/break";
import { aflRuleCheck, type AflPlaybookInput } from "@/lib/sports/afl/engine";
import { PeriodBreak, type BreakPlayer, type BreakStrategy } from "@/components/quarter-break/PeriodBreak";
import { buildBoard, placesOf, swapInStaged, type BoardSlot, type StagedLineup } from "@/lib/live/break/board";
import { breakIssues } from "@/lib/live/break/issues";

// Players who came on shortly before the quarter break — keep them in their
// zone rather than moving them again immediately.
const RECENT_ARRIVAL_MS = 3 * 60 * 1000; // 3 minutes

interface QuarterBreakProps {
  auth: import("@/lib/types").LiveAuth;
  gameId: string;
  game: Game;
  /** The top bar's Exit (absent: the bar isn't shown, as in live play). */
  exitHref?: string;
  /** The top bar's "?" (the walkthrough). */
  onHelp?: () => void;
  ageGroup: AgeGroupConfig;
  /** The team keeps score: the break shows the score chip. */
  trackScoring: boolean;
  players: Player[];
  season: PlayerZoneMinutes;
  /**
   * Per-player played-vs-available quarter counts across PRIOR
   * games. Drives the suggester's tiebreak so an under-utilised
   * regular climbs the queue ahead of a teammate with similar
   * in-game minutes today.
   */
  seasonAvailability: Record<string, SeasonAvailability>;
  zoneCaps: ZoneCaps;
  positionModel: PositionModel;
  /** Current persisted on-field size — drives the size dropdown. */
  currentOnFieldSize: number;
  /** Sport+age legal range for the on-field size dropdown. */
  minOnFieldSize: number;
  maxOnFieldSize: number;
  /** Default on-field size for the team's age group (shown as a hint). */
  defaultOnFieldSize: number;
  /**
   * Per-game effective full-period length in ms — fed to the suggester's
   * season-diversity threshold so it tracks THIS game's clock rather than a
   * fixed 12 min (CONFIG-01 / D-03). LiveGame supplies its `quarterMs`.
   */
  fullPeriodMs: number;
  /** Per-chip mode (split / group) — drives the suggester's chip cost. */
  chipModeByKey?: Partial<Record<"a" | "b" | "c", ChipMode>>;
  /** Periods in a game (4 quarters / 2 halves), for the rule check. */
  periodCount?: number;
  /**
   * How we play (UX plan 3.6): strategy, season balance and player
   * roles for the AFL suggesters. Omitted = today's behaviour.
   */
  aflPlaybook?: AflPlaybookInput;
  onStarted: () => void;
  /**
   * Fired SYNCHRONOUSLY when the coach taps Start (issue 1) — before the
   * async lineup/quarter writes — so the host can unlock audio inside the
   * user gesture (browsers only honour programmatic playback that
   * descends from a real gesture). AFL passes `primeSong`; optional so
   * other sports can omit it.
   */
  onPrimeAudio?: () => void;
}

type Slot = Zone | "bench";

/** AFL's lineup-build modes at the break, as the store and draft keep them. */
type RotationMode = "suggested" | "keep" | "manual" | "rotate";

// The break screen's strategy names over the store's rotation modes
// ("keep" is the screen's Repeat).
const STRATEGY_OF: Record<RotationMode, BreakStrategy> = {
  suggested: "suggested",
  rotate: "rotate",
  keep: "repeat",
  manual: "manual",
};
const MODE_OF: Record<BreakStrategy, RotationMode> = {
  suggested: "suggested",
  rotate: "rotate",
  repeat: "keep",
  manual: "manual",
};

function emptyZM(): ZoneMinutes {
  return { back: 0, hback: 0, mid: 0, hfwd: 0, fwd: 0 };
}

function stagedOf(l: Lineup): StagedLineup {
  return { groups: { back: l.back, hback: l.hback, mid: l.mid, hfwd: l.hfwd, fwd: l.fwd }, bench: l.bench };
}

function lineupOf(s: StagedLineup): Lineup {
  return {
    back: s.groups.back ?? [],
    hback: s.groups.hback ?? [],
    mid: s.groups.mid ?? [],
    hfwd: s.groups.hfwd ?? [],
    fwd: s.groups.fwd ?? [],
    bench: s.bench,
  };
}

export function QuarterBreak({
  auth,
  gameId,
  game,
  exitHref,
  onHelp,
  ageGroup,
  trackScoring,
  players,
  season,
  seasonAvailability,
  positionModel,
  currentOnFieldSize,
  minOnFieldSize,
  maxOnFieldSize,
  defaultOnFieldSize,
  fullPeriodMs,
  chipModeByKey = {},
  aflPlaybook,
  periodCount = 4,
  onStarted,
  onPrimeAudio,
}: QuarterBreakProps) {
  const lineup = useLiveGame((s) => s.lineup);
  const currentQuarter = useLiveGame((s) => s.currentQuarter);
  // Steve 2026-05-16: parity with netball Q-break — a per-player goal
  // badge on the tiles, from the live store's `playerScores`.
  const playerScores = useLiveGame((s) => s.playerScores);
  const setLineup = useLiveGame((s) => s.setLineup);
  // Started locally inside handleConfirmStart so the clock kicks off
  // the moment the modal Start tap commits — without it, the LiveGame
  // mount after refresh would land with clockStartedAt=null (because
  // beginNextQuarter resets it). Steve 2026-05-13.
  const startClock = useLiveGame((s) => s.startClock);
  const basePlayedZoneMs = useLiveGame((s) => s.basePlayedZoneMs);
  const lastStintMs = useLiveGame((s) => s.lastStintMs);
  const lastStintZone = useLiveGame((s) => s.lastStintZone);
  const lockedIds = useLiveGame((s) => s.lockedIds);
  const zoneLockedPlayers = useLiveGame((s) => s.zoneLockedPlayers);
  const injuredIds = useLiveGame((s) => s.injuredIds);
  const loanedIds = useLiveGame((s) => s.loanedIds);
  const setLoaned = useLiveGame((s) => s.setLoaned);
  const setInjured = useLiveGame((s) => s.setInjured);
  const addBenchPlayer = useLiveGame((s) => s.addBenchPlayer);
  // F2 plan-ahead (ROTPLAN-02): the coach may have pinned THIS upcoming
  // period's lineup during the dying minutes of the last one. Read the
  // pin so the break can open PRE-SEEDED on it (D-12), and the clearer
  // so we can consume it once the next period starts (D-14).
  const plannedRotation = useLiveGame((s) => s.plannedRotation);
  const setPlannedRotation = useLiveGame((s) => s.setPlannedRotation);
  const sidelinedSet = useMemo(() => new Set<string>([...injuredIds, ...loanedIds]), [injuredIds, loanedIds]);
  const injuredSet = useMemo(() => new Set(injuredIds), [injuredIds]);
  const loanedSet = useMemo(() => new Set(loanedIds), [loanedIds]);

  const zones = useMemo(() => positionsFor(positionModel), [positionModel]);
  // Labelled zones (config-derived, age-group filtered) for the shared
  // PlayerInsightSummary — same derivation the in-game LockModal uses.
  const insightZones = useMemo(
    () => getSportConfig("afl").zones.filter((z) => (zones as readonly string[]).includes(z.id)),
    [zones],
  );
  // ─── Long-press → player insight + injury toggle (issues 8 & 9) ──
  const [insightPlayerId, setInsightPlayerId] = useState<string | null>(null);
  const slots = useMemo<Slot[]>(() => [[...zones].reverse(), "bench"].flat() as Slot[], [zones]);

  const currentGameZoneMins = useMemo(() => {
    const out: PlayerZoneMinutes = {};
    for (const [pid, zm] of Object.entries(basePlayedZoneMs)) {
      const next = emptyZM();
      for (const z of ALL_ZONES) next[z] = zm[z] / 60000;
      out[pid] = next;
    }
    return out;
  }, [basePlayedZoneMs]);

  const combinedZoneMins = useMemo(() => {
    const out: PlayerZoneMinutes = {};
    for (const [pid, zm] of Object.entries(season)) {
      const next = emptyZM();
      for (const z of ALL_ZONES) next[z] = zm[z];
      out[pid] = next;
    }
    for (const [pid, zm] of Object.entries(currentGameZoneMins)) {
      out[pid] ??= emptyZM();
      for (const z of ALL_ZONES) out[pid][z] += zm[z];
    }
    return out;
  }, [season, currentGameZoneMins]);

  const [draft, setDraft] = useState<Lineup>(lineup);

  // This game's minutes so far, per player.
  const gameTotalMs = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [pid, zm] of Object.entries(basePlayedZoneMs)) {
      out[pid] = ALL_ZONES.reduce((a, z) => a + zm[z], 0);
    }
    return out;
  }, [basePlayedZoneMs]);

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Q-break lineup-build mode (the screen's Suggested / Rotate / Repeat /
  // Manual). All four are fully editable via tap-tap; the picker just sets
  // the starting state. Initial value defers to the live store's
  // rotationMode (set by the pre-game LineupPicker) so a coach who picked
  // "Set manually" pre-game sees Manual at every break. "keep" (Repeat) is
  // a per-break decision, never persisted.
  const persistedRotationMode = useLiveGame((s) => s.rotationMode);
  const setPersistedRotationMode = useLiveGame((s) => s.setRotationMode);
  const [lineupMode, setLineupMode] = useState<RotationMode>(
    persistedRotationMode === "manual" ? "manual" : persistedRotationMode === "rotate" ? "rotate" : "suggested",
  );

  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const ruleCheckFor = useMemo(() => {
    if (!aflPlaybook) return null;
    const names: Record<string, string> = {};
    for (const p of players) names[p.id] = p.full_name;
    return (l: Lineup) =>
      aflRuleCheck({
        lineup: l,
        names,
        gameMinutes: currentGameZoneMins,
        previousZones: lastStintZone,
        period: currentQuarter + 1,
        periodCount,
        periodMs: fullPeriodMs,
        season,
        input: aflPlaybook,
      }).items;
  }, [aflPlaybook, players, currentGameZoneMins, lastStintZone, currentQuarter, periodCount, fullPeriodMs, season]);

  const availableForLineup = useMemo(() => {
    const all: string[] = [...lineup.bench];
    for (const z of ALL_ZONES) all.push(...lineup[z]);
    return all.map((id) => playersById.get(id)).filter((p): p is Player => !!p);
  }, [lineup, playersById]);
  // Injured / loaned players stay parked on the bench — never fed to the
  // reshuffler, never rotated onto the field at quarter breaks.
  const healthyForLineup = useMemo(
    () => availableForLineup.filter((p) => !sidelinedSet.has(p.id)),
    [availableForLineup, sidelinedSet],
  );
  const sidelinedIdsInLineup = useMemo(
    () => availableForLineup.filter((p) => sidelinedSet.has(p.id)).map((p) => p.id),
    [availableForLineup, sidelinedSet],
  );

  // Effective suggester caps preserve the previous quarter's zone shape:
  // a coach's blank-in-a-zone choice survives, a short squad keeps its
  // 3/4/3 (Steve 2026-07-07), and a mid-game injury leaves an empty slot
  // rather than re-solving the formation (Steve 2026-08-16). Only shrink
  // when fewer players are IN THE GAME at all than the configured size.
  const effectiveOnFieldSize = Math.min(currentOnFieldSize, availableForLineup.length);
  const effectiveZoneCaps = useMemo<ZoneCaps>(
    () =>
      deriveEffectiveZoneCaps(
        lineup,
        effectiveOnFieldSize,
        positionModel,
        zoneCapsFor(effectiveOnFieldSize, positionModel),
      ),
    [lineup, effectiveOnFieldSize, positionModel],
  );

  const nextQuarter = currentQuarter + 1;

  // ─── F2 plan-ahead pre-seed (ROTPLAN-02 / D-12, D-13) ──────────────
  const upcomingPeriodIndex = nextQuarter - 1;
  const seededDraft = useMemo<Lineup | null>(() => {
    const seed = seedNextPeriodLineup({
      pin: plannedRotation && plannedRotation.gameId === gameId ? plannedRotation : null,
      periodIndex: upcomingPeriodIndex,
      // Only currently-available players may be fielded — a pinned player
      // who is now injured/loaned/out is reconciled OUT (D-13).
      availableIds: healthyForLineup.map((p) => p.id),
      groupIds: zones,
    });
    if (!seed) return null;
    // Any healthy player the pin didn't place (e.g. a late arrival added
    // after the pin) lands on the bench so nobody is lost; sidelined
    // players stay parked on the bench as everywhere else.
    const placed = new Set(Object.values(seed.groups).flat());
    const onBench = new Set(seed.bench);
    const extraBench = healthyForLineup.map((p) => p.id).filter((id) => !placed.has(id) && !onBench.has(id));
    return {
      back: seed.groups.back ?? [],
      hback: seed.groups.hback ?? [],
      mid: seed.groups.mid ?? [],
      hfwd: seed.groups.hfwd ?? [],
      fwd: seed.groups.fwd ?? [],
      bench: [...seed.bench, ...extraBench, ...sidelinedIdsInLineup],
    };
  }, [plannedRotation, gameId, upcomingPeriodIndex, healthyForLineup, zones, sidelinedIdsInLineup]);
  const hasPlannedSeed = seededDraft !== null;

  function slotOf(pid: string, l: Lineup): Slot | null {
    for (const s of slots) if (l[s].includes(pid)) return s;
    return null;
  }

  const pinnedPositions = useMemo<Record<string, Zone>>(() => {
    const pins: Record<string, Zone> = {};
    // Recent arrivals: short last stint, in GAME time. Steve 2026-05-20.
    for (const [pid, dur] of Object.entries(lastStintMs)) {
      const z = lastStintZone[pid];
      if (z && dur < RECENT_ARRIVAL_MS) pins[pid] = z;
    }
    // Field-locked: always stay in their last zone (never go to bench)
    for (const pid of lockedIds) {
      const z = lastStintZone[pid];
      if (z) pins[pid] = z;
    }
    // Zone-locked: prefer their locked zone at quarter breaks
    for (const [pid, z] of Object.entries(zoneLockedPlayers)) {
      pins[pid] = z;
    }
    return pins;
  }, [lastStintMs, lastStintZone, lockedIds, zoneLockedPlayers]);

  // Q-just-ended teammate cohorts — the suggester's partnership penalty.
  const previousZoneTeammates = useMemo(() => zoneTeammatesFromLineup(lineup), [lineup]);

  const suggestedLineup = useMemo(() => {
    if (availableForLineup.length === 0) return lineup;
    // Cohort chips retired with How we play (UX plan 5.8): their intent now lives in roles and rules.
    const chipByPlayerId: Record<string, "a" | "b" | "c" | null | undefined> = {};
    const suggested = suggestStartingLineup(
      healthyForLineup,
      combinedZoneMins,
      currentQuarter * 1000 + healthyForLineup.length,
      effectiveZoneCaps,
      currentGameZoneMins,
      pinnedPositions,
      lastStintZone,
      previousZoneTeammates,
      seasonAvailability,
      chipByPlayerId,
      chipModeByKey,
      fullPeriodMs,
      aflPlaybook,
    );
    // Injured / loaned players back on the bench: visible, never sent on.
    return { ...suggested, bench: [...suggested.bench, ...sidelinedIdsInLineup] };
  }, [
    availableForLineup.length,
    healthyForLineup,
    sidelinedIdsInLineup,
    combinedZoneMins,
    currentQuarter,
    lineup,
    effectiveZoneCaps,
    currentGameZoneMins,
    pinnedPositions,
    lastStintZone,
    previousZoneTeammates,
    seasonAvailability,
  ]);

  // Manual: a blank field, every healthy player on the bench.
  const manualLineup = useMemo<Lineup>(
    () => ({ back: [], hback: [], mid: [], hfwd: [], fwd: [], bench: healthyForLineup.map((p) => p.id) }),
    [healthyForLineup],
  );

  // Rotate (Idea 2, Steve 2026-07-07): everyone shifts one line up the
  // ground, zone sizes fixed, overflow filled by least time in the zone.
  const rotatedLineup = useMemo<Lineup>(() => {
    if (availableForLineup.length === 0) return lineup;
    return rotateLines({
      players: healthyForLineup.map((p) => p.id),
      caps: effectiveZoneCaps,
      zoneMins: currentGameZoneMins,
      lastZone: lastStintZone,
      sidelinedIds: sidelinedIdsInLineup,
    });
  }, [availableForLineup.length, healthyForLineup, effectiveZoneCaps, currentGameZoneMins, lastStintZone, sidelinedIdsInLineup, lineup]);

  // Only re-derive `draft` when the coach EXPLICITLY changes the mode:
  // the suggestion recomputes as the store re-hydrates, and on Start, and
  // must never stomp the coach's edits (Steve 2026-05-09).
  const lastAppliedModeRef = useRef<typeof lineupMode | null>(null);
  // F2 pre-seed: open the break ON the pinned plan (D-12), applied once.
  const didSeedRef = useRef(false);
  useEffect(() => {
    if (availableForLineup.length === 0) return;
    if (didSeedRef.current) return;
    if (!seededDraft) return;
    didSeedRef.current = true;
    setDraft(seededDraft);
    lastAppliedModeRef.current = lineupMode;
  }, [seededDraft, lineupMode, availableForLineup.length]);
  useEffect(() => {
    if (availableForLineup.length === 0) return;
    if (lastAppliedModeRef.current === lineupMode) return;
    lastAppliedModeRef.current = lineupMode;
    const next =
      lineupMode === "suggested"
        ? suggestedLineup
        : lineupMode === "rotate"
          ? rotatedLineup
          : lineupMode === "manual"
            ? manualLineup
            : lineup;
    setDraft(next);
  }, [lineupMode, suggestedLineup, rotatedLineup, manualLineup, lineup, availableForLineup.length]);

  // The coach's staged lineup survives leaving the live screen (the team
  // page and back, a reload, the app backgrounded): kept in the live
  // store, restored here over the seed and suggestion above (declared
  // after them, so it wins), for the kids who can still play.
  const stagedForStore = useMemo(() => stagedOf(draft), [draft]);
  const healthyIds = useMemo(() => healthyForLineup.map((p) => p.id), [healthyForLineup]);
  const stagedBreakDraft = useStagedBreakDraft({
    gameId,
    period: nextQuarter,
    ready: availableForLineup.length > 0,
    groupIds: ALL_ZONES,
    availableIds: healthyIds,
    benchOnlyIds: sidelinedIdsInLineup,
    staged: stagedForStore,
    mode: lineupMode,
    onRestore: (restored) => {
      setDraft(lineupOf(restored));
      const mode = restored.mode as RotationMode;
      if (["suggested", "keep", "manual", "rotate"].includes(mode)) {
        lastAppliedModeRef.current = mode;
        setLineupMode(mode);
      }
      didSeedRef.current = true;
    },
  });

  // ─── Players on the field ─────────────────────────────────────
  // The new caps come down via router.refresh; the coach sees the change
  // take in the sheet.
  const sizeOptions = useMemo(() => {
    const out: number[] = [];
    for (let s = maxOnFieldSize; s >= minOnFieldSize; s--) out.push(s);
    return out;
  }, [minOnFieldSize, maxOnFieldSize]);
  const [pendingSize, setPendingSize] = useState<number>(currentOnFieldSize);
  useEffect(() => {
    setPendingSize(currentOnFieldSize);
  }, [currentOnFieldSize]);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [sizePending, startSizeTransition] = useTransition();

  function handleSizeChange(next: number) {
    if (next === currentOnFieldSize) {
      setPendingSize(next);
      return;
    }
    setSizeError(null);
    setPendingSize(next);
    startSizeTransition(async () => {
      const result = await setOnFieldSizeAction(auth, gameId, next);
      if (!result.success) {
        setSizeError(result.error);
        setPendingSize(currentOnFieldSize);
        return;
      }
      reactStartTransition(() => router.refresh());
    });
  }

  // ─── Lend / injured / arrived / out ───────────────────────────
  const [loanPending, startLoanTransition] = useTransition();
  const [loanError, setLoanError] = useState<string | null>(null);

  function handleLoanToggle(pid: string, nextLoaned: boolean) {
    setLoanError(null);
    setLoaned(pid, nextLoaned);
    // Recall: onto the staged bench so they're fieldable at THIS break
    // (a kid lent before kickoff was never in the lineup).
    const wasInDraft = draft.bench.includes(pid) || ALL_ZONES.some((z) => draft[z].includes(pid));
    const addedToDraft = !nextLoaned && !wasInDraft;
    if (addedToDraft) setDraft((d) => ({ ...d, bench: [...d.bench, pid] }));
    // A kid lent at the break sits out from the next quarter.
    if (nextLoaned) setDraft((prev) => benchPlayerInLineup(prev, pid));
    startLoanTransition(async () => {
      const result = await markLoan(auth, gameId, {
        player_id: pid,
        loaned: nextLoaned,
        // Loan stints flip at the boundary: "from the start of Q{next}".
        quarter: nextQuarter,
        elapsed_ms: 0,
      });
      if (!result.success) {
        setLoaned(pid, !nextLoaned);
        if (addedToDraft) setDraft((d) => ({ ...d, bench: d.bench.filter((p) => p !== pid) }));
        setLoanError(result.error);
      }
    });
  }

  // "Kid had to leave at quarter time": applies from the next quarter.
  // An injured player comes off the staged field (Steve 2026-06-15); the
  // vacated slot shows empty for the coach to fill.
  function handleInjuryToggle(pid: string, nextInjured: boolean) {
    setLoanError(null);
    setInjured(pid, nextInjured);
    if (nextInjured) setDraft((prev) => benchPlayerInLineup(prev, pid));
    startLoanTransition(async () => {
      const result = await markInjury(auth, gameId, {
        player_id: pid,
        injured: nextInjured,
        quarter: nextQuarter,
        elapsed_ms: 0,
      });
      if (!result.success) {
        setInjured(pid, !nextInjured);
        setLoanError(result.error);
      }
    });
  }

  // A squad member who turns up at the break (AVAIL-02): the canonical
  // addLateArrival writer, onto the staged bench and the store's lineup.
  function handleAddArrived(playerId: string) {
    setLoanError(null);
    setDraft((prev) => (prev.bench.includes(playerId) ? prev : { ...prev, bench: [...prev.bench, playerId] }));
    addBenchPlayer(playerId);
    startLoanTransition(async () => {
      const { flushed } = enqueueLiveAction("addLateArrival", [
        auth,
        gameId,
        { player_id: playerId, quarter: nextQuarter, elapsed_ms: 0 },
      ]);
      await flushed;
      router.refresh();
    });
  }

  // Mark a player out WITHOUT a replacement: the slot is left short.
  function handleOutDirect(playerId: string) {
    setLoanError(null);
    setInjured(playerId, true);
    setDraft((prev) => benchPlayerInLineup(prev, playerId));
    startLoanTransition(async () => {
      const result = await markInjury(auth, gameId, {
        player_id: playerId,
        injured: true,
        quarter: nextQuarter,
        elapsed_ms: 0,
        reason: "out",
      });
      if (!result.success) {
        setInjured(playerId, false);
        setLoanError(result.error);
      }
    });
  }

  // Mark out with a bench replacement (D-09): out THEN swap, so the
  // replacement lands at the vacated zone; the out kid keeps their time.
  function handleOutReplacement(outId: string, replacementId: string, zone: Zone) {
    setLoanError(null);
    setInjured(outId, true);
    setDraft((prev) => replaceInLineup(prev, outId, replacementId, zone));
    enqueueLiveAction("markInjury", [
      auth,
      gameId,
      { player_id: outId, injured: true, quarter: nextQuarter, elapsed_ms: 0, reason: "out" },
    ]);
    const { flushed } = enqueueLiveAction("recordSwap", [
      auth,
      gameId,
      { off_player_id: outId, on_player_id: replacementId, zone, quarter: nextQuarter, elapsed_ms: 0 },
    ]);
    startLoanTransition(async () => {
      await flushed;
      router.refresh();
    });
  }

  const asBreakPlayer = (p: Player): BreakPlayer => ({ id: p.id, name: p.full_name, jerseyNumber: p.jersey_number });

  // Bench replacements for a kid marked out, least field time first.
  const outReplacementCandidates = useMemo<InjuryReplacementCandidate[]>(() => {
    return draft.bench
      .filter((id) => !sidelinedSet.has(id))
      .map((id) => playersById.get(id))
      .filter((p): p is Player => !!p)
      .map((p) => {
        const zm = basePlayedZoneMs[p.id];
        const totalMs = zm ? ALL_ZONES.reduce((a, z) => a + (zm[z] ?? 0), 0) : 0;
        return { player: p, totalMs };
      })
      .sort((a, b) => a.totalMs - b.totalMs);
  }, [draft.bench, sidelinedSet, playersById, basePlayedZoneMs]);

  // ─── Score ────────────────────────────────────────────────────
  const scoreByQuarter = useLiveGame((s) => s.scoreByQuarter);
  const totalUs = useLiveGame((s) => s.teamScore);
  const totalThem = useLiveGame((s) => s.opponentScore);

  function lineupsEqual(a: Lineup, b: Lineup): boolean {
    const keys: (keyof Lineup)[] = ["back", "hback", "mid", "hfwd", "fwd", "bench"];
    for (const k of keys) {
      if (a[k].length !== b[k].length) return false;
      const sa = [...a[k]].sort();
      const sb = [...b[k]].sort();
      for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
    }
    return true;
  }

  // Start Q{n} (the sheet's "now" or "anyway") commits both writes:
  // lineup_set first (only if the draft differs), then quarter_start.
  // Fix first / Back to lineup cancels with zero writes.
  function handleConfirmStart() {
    setError(null);
    // Unlock audio INSIDE this tap, before any await (issue 1).
    onPrimeAudio?.();
    // Nobody injured, lent or out starts the quarter on the field.
    const full: Lineup = benchSidelinedInLineup({ ...emptyLineup(), ...draft }, sidelinedSet);
    startTransition(async () => {
      if (!lineupsEqual(lineup, full)) {
        const r = await recordLineupSet(auth, gameId, full);
        if (!r.success) {
          setError(r.error);
          return;
        }
        setLineup(full);
      }
      const result = await startQuarterAction(auth, gameId, nextQuarter);
      if (!result.success) {
        setError(result.error);
        return;
      }
      // The staged lineup is now the quarter's: nothing left to restore.
      stagedBreakDraft.clear();
      onStarted();
      // D-14: this period's plan is used; later planned periods stay.
      if (plannedRotation && plannedRotation.gameId === gameId) {
        setPlannedRotation(consumePeriodPin(plannedRotation, upcomingPeriodIndex));
      }
      // The sheet's Start is the umpire's whistle: start the clock now.
      startClock();
      // Medium haptic — the "go!" tap (P1-10).
      void hapticTap("medium");
      reactStartTransition(() => router.refresh());
    });
  }

  // ─── The break screen ─────────────────────────────────────────
  const config = useMemo(
    () => breakConfigFor("afl", ageGroup, { onFieldSize: effectiveOnFieldSize, shape: effectiveZoneCaps }),
    [ageGroup, effectiveOnFieldSize, effectiveZoneCaps],
  );
  const staged = useMemo(() => stagedOf(draft), [draft]);
  const board = useMemo(() => buildBoard(config.zones, staged, sidelinedSet), [config.zones, staged, sidelinedSet]);
  const previous = useMemo(() => placesOf(stagedOf(lineup)), [lineup]);

  const issues = useMemo(
    () =>
      breakIssues({
        lineup: draft,
        // Kids who can't play aren't held to the rules.
        check: (l) => (ruleCheckFor ? ruleCheckFor({ ...l, bench: l.bench.filter((id) => !sidelinedSet.has(id)) }) : []),
        board: (l) => buildBoard(config.zones, stagedOf(l), sidelinedSet),
        swap: (l, a, b) => lineupOf(swapInStaged(stagedOf(l), a, b)),
        sidelined: sidelinedSet,
      }),
    [config.zones, ruleCheckFor, draft, sidelinedSet],
  );

  const sidelined = useMemo(() => {
    const out: Record<string, string> = {};
    for (const id of loanedIds) out[id] = "Lent";
    for (const id of injuredIds) out[id] = "Injured";
    return out;
  }, [injuredIds, loanedIds]);

  const breakPlayers = useMemo(() => new Map(players.map((p) => [p.id, asBreakPlayer(p)])), [players]);

  const scores = useMemo(() => {
    const out: Record<string, { text: string; label: string }> = {};
    for (const [pid, s] of Object.entries(playerScores)) {
      if (s.goals + s.behinds > 0) out[pid] = { text: `${s.goals}.${s.behinds}`, label: `${s.goals} goals, ${s.behinds} behinds` };
    }
    return out;
  }, [playerScores]);

  const inGame = useMemo(() => new Set(availableForLineup.map((p) => p.id)), [availableForLineup]);
  const onFieldIds = ALL_ZONES.flatMap((z) => draft[z]).filter((id) => !sidelinedSet.has(id));
  const healthyNotSidelined = players.filter((p) => !loanedSet.has(p.id) && !injuredSet.has(p.id));

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
      gameMs={gameTotalMs}
      scores={scores}
      sidelined={sidelined}
      onSwap={onSwap}
      onLongPress={(pid) => setInsightPlayerId(pid)}
      strategy={STRATEGY_OF[lineupMode]}
      onStrategy={(next) => {
        const mode = MODE_OF[next];
        setLineupMode(mode);
        // Repeat ("keep") is a per-break decision — never persisted.
        if (mode !== "keep") setPersistedRotationMode(mode);
      }}
      issues={issues}
      score={
        trackScoring && currentQuarter >= 1
          ? {
              line: config.formatScore({
                us: { goal: totalUs.goals, behind: totalUs.behinds },
                them: { goal: totalThem.goals, behind: totalThem.behinds },
              }),
              editor: (
                <div className="space-y-4">
                  <QuarterScoreTable
                    scoreByQuarter={scoreByQuarter}
                    currentQuarter={currentQuarter}
                    quarterEnded={true}
                    sport="afl"
                    teamName="Us"
                    opponentName={game.opponent || "Them"}
                  />
                  <div className="border-t border-hairline pt-4">
                    <ScoreReviewPanel
                      auth={auth}
                      gameId={gameId}
                      players={players}
                      includeBehinds={true}
                      defaultQuarter={currentQuarter || 1}
                    />
                  </div>
                </div>
              ),
            }
          : undefined
      }
      settings={{
        size: {
          value: pendingSize,
          options: sizeOptions,
          defaultValue: defaultOnFieldSize,
          word: "On-field size",
          onChange: handleSizeChange,
          pending: sizePending || isPending,
          error: sizeError,
        },
        injured: {
          players: players.filter((p) => injuredSet.has(p.id)).map(asBreakPlayer),
          candidates: healthyNotSidelined.map(asBreakPlayer),
          onToggle: handleInjuryToggle,
        },
        lent: {
          players: players.filter((p) => loanedSet.has(p.id) && !injuredSet.has(p.id)).map(asBreakPlayer),
          candidates: healthyNotSidelined.map(asBreakPlayer),
          onToggle: handleLoanToggle,
        },
        arrived: {
          candidates: players.filter((p) => !inGame.has(p.id)).map(asBreakPlayer),
          onAdd: handleAddArrived,
        },
        markOut: {
          candidates: onFieldIds
            .map((id) => playersById.get(id))
            .filter((p): p is Player => !!p)
            .map(asBreakPlayer),
          replacements: outReplacementCandidates,
          spotLabel: (pid) => {
            const z = slotOf(pid, draft);
            return z && z !== "bench" ? ZONE_SHORT_LABELS[z] : null;
          },
          player: (pid) => playersById.get(pid),
          onOut: (pid, replacementId) => {
            const z = slotOf(pid, draft);
            if (replacementId && z && z !== "bench") handleOutReplacement(pid, replacementId, z);
            else handleOutDirect(pid);
          },
        },
        pending: loanPending,
        error: loanError,
      }}
      banner={
        hasPlannedSeed ? (
          <p
            data-testid="planned-seed-banner"
            className="text-center font-mono text-[10px] font-bold uppercase tracking-micro text-brand-700"
          >
            Pre-filled from your planned Q{nextQuarter} lineup
          </p>
        ) : undefined
      }
      start={{
        onStart: handleConfirmStart,
        pending: isPending,
        cue: "siren goes",
        error,
      }}
    >
      {/* Long-press player sheet (issues 8 & 9): the in-game LockModal's
          stats breakdown (shared PlayerInsightSummary), plus mark-injured
          / mark-lent / bring back straight from the break lineup. */}
      {insightPlayerId &&
        (() => {
          const ip = playersById.get(insightPlayerId);
          if (!ip) return null;
          const isInjured = injuredSet.has(insightPlayerId);
          const isLoaned = loanedSet.has(insightPlayerId);
          const status = isInjured ? "Injured" : isLoaned ? "Lent" : "Available";
          return (
            <Modal>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Guernsey num={ip.jersey_number ?? ""} size={32} />
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-bold text-ink">{ip.full_name}</h2>
                    <p className="font-mono text-[10px] font-bold uppercase tracking-micro text-ink-mute">{status}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInsightPlayerId(null)}
                  aria-label="Close"
                  className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-ink-mute transition-colors hover:bg-surface-alt hover:text-ink"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
                <PlayerInsightSummary
                  input={breakInsightInput({
                    zones: insightZones,
                    inGameZoneMs: basePlayedZoneMs[insightPlayerId] ?? {},
                    seasonZoneMs: season[insightPlayerId] ?? {},
                    seasonPeriod: fullPeriodMs / 60000,
                  })}
                />
              </div>

              <div className="mt-1 flex flex-col gap-2">
                {isInjured ? (
                  <SFButton
                    variant="primary"
                    data-testid="break-insight-injury-toggle"
                    onClick={() => {
                      handleInjuryToggle(insightPlayerId, false);
                      setInsightPlayerId(null);
                    }}
                  >
                    Mark available
                  </SFButton>
                ) : isLoaned ? (
                  <SFButton
                    variant="primary"
                    data-testid="break-insight-lent-toggle"
                    onClick={() => {
                      handleLoanToggle(insightPlayerId, false);
                      setInsightPlayerId(null);
                    }}
                  >
                    Return to game
                  </SFButton>
                ) : (
                  <>
                    <SFButton
                      variant="danger"
                      data-testid="break-insight-injury-toggle"
                      onClick={() => {
                        handleInjuryToggle(insightPlayerId, true);
                        setInsightPlayerId(null);
                      }}
                    >
                      Mark as injured
                    </SFButton>
                    <SFButton
                      variant="subtle"
                      data-testid="break-insight-lent-toggle"
                      onClick={() => {
                        handleLoanToggle(insightPlayerId, true);
                        setInsightPlayerId(null);
                      }}
                    >
                      Mark as lent
                    </SFButton>
                  </>
                )}
                <SFButton variant="ghost" size="sm" onClick={() => setInsightPlayerId(null)}>
                  Close
                </SFButton>
              </div>
            </Modal>
          );
        })()}
    </PeriodBreak>
  );
}
