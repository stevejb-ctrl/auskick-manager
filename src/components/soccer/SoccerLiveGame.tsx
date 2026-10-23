"use client";

// ─── SoccerLiveGame ──────────────────────────────────────────
// The soccer family's live game: Football (soccer), futsal and hockey,
// each in its own words and on its own surface (SoccerFamilyRules).
// Mirrors AFL's LiveGame and league's LeagueLiveGame end to end, so a
// coach who runs both sports finds the same shell: the shared
// LiveTopBar (sub due as a banner under it), the next-sub card, the
// pitch and bench, the shared player dock and LockModal long-press
// actions, the sticky scorebug with undo, the clock menu, the break, and
// the full-time review and share card. What's the family's own:
//
//   - The keeper is a slot, held for the period. Rolling subs fill
//     outfield lines only (the engine never suggests taking the keeper
//     off); "Swap keeper" on the keeper's actions changes it on purpose
//     where the sport allows a mid-period swap. Where it doesn't
//     (hockey: keeper kit takes minutes), goal changes hands only at a
//     break, the next keeper hears before it, and an injury is the one
//     way to replace the keeper mid-period.
//   - The break plans the next period (suggestSoccerHalfTime): who
//     takes the keeper's gear, who plays and where. The break edits that
//     plan; Start commits it as one lineup_set before the period starts.
//   - Subs are rolling (any time) or in windows a period, per the age
//     group's sub mode; either way the card rotates the bench, each
//     sub evening time.
//   - Periods are the age group's own: halves, or hockey's quarters
//     (periodLabels), "H1" or "Q1".
//
// Every write goes through the shared write queue (registerLiveActions)
// in the one game lane, so the event log keeps the coach's order.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SFButton } from "@/components/sf";
import { LiveTopBar } from "@/components/live/LiveTopBar";
import { LiveAdminUtilityRow } from "@/components/live/LiveAdminUtilityRow";
import { LiveStickyScoreBar } from "@/components/live/LiveStickyScoreBar";
import { ManualEndQuarterConfirm } from "@/components/live/ManualEndQuarterConfirm";
import { ClockMenu } from "@/components/live/ClockMenu";
import { StartQuarterModal } from "@/components/live/StartQuarterModal";
import { SubDueBanner } from "@/components/live/SubDueBanner";
import { subDueBannerShows } from "@/components/live/SubDue";
import { ScoreRecordingDock } from "@/components/live/ScoreRecordingDock";
import { LongPressHint } from "@/components/live/LongPressHint";
import { LockModal } from "@/components/live/LockModal";
import { UndoStrip } from "@/components/live/UndoStrip";
import { NextSubCard } from "@/components/live/NextSubCard";
import {
  InjuryReplacementModal,
  type InjuryReplacementCandidate,
} from "@/components/live/InjuryReplacementModal";
import { SlotFillSheet } from "@/components/ui/SlotFillSheet";
import { InlineAlert } from "@/components/ui/InlineAlert";
import {
  enqueueLiveAction,
  type LiveActionArgs,
  type LiveActionKind,
} from "@/lib/live/registerLiveActions";
import { playSubDueBeep, useSubDueAudioUnlock } from "@/lib/live/subDueBeep";
import { hapticTap } from "@/lib/haptics";
import {
  computePeriodClockMs,
  togglePeriodPause,
  RUNNING_CLOCK,
  type PeriodPause,
} from "@/lib/live/periodClock";
import { openSubBatch, resolveSubAnchorElapsed } from "@/lib/live/subAnchor";
import { presentPlayerIds } from "@/lib/live/presentPlayers";
import { periodBreakName } from "@/lib/live/periodBreakName";
import type { Game, GameEvent, LiveAuth, Player } from "@/lib/types";
import { periodLabels, type SoccerSport } from "@/lib/sports";
import { soccerFormations } from "@/lib/sports/soccer";
import { soccerFamilyRules } from "@/lib/sports/soccer/family";
import {
  normalizeSoccerLineup,
  soccerOnField,
  soccerOutfield,
  soccerUnitOf,
  type SoccerLineup,
} from "@/lib/sports/soccer/lineup";
import { replaySoccerGame, soccerGameMs, type SoccerGameState } from "@/lib/sports/soccer/replay";
import { suggestSoccerHalfTime, suggestSoccerWindowBatch, type SoccerSeasonBalance } from "@/lib/sports/soccer/suggest";
import { soccerSubDue } from "@/lib/sports/soccer/live";
import {
  SOCCER_LINES,
  type SoccerAgeGroupConfig,
  type SoccerFormation,
  type SoccerKeeperStrategy,
  type SoccerUnit,
} from "@/lib/sports/soccer/types";
import type { SoccerKeeperPrefs } from "@/lib/sports/soccer/keeper";
import { SoccerField } from "./SoccerField";
import { SoccerBench } from "./SoccerBench";
import { SoccerScoreBug } from "./SoccerScoreBug";
import { SoccerBreak } from "./SoccerBreak";
import { SoccerFullTimeReview, SoccerGameSummaryCard } from "./SoccerFullTime";
import { kitUpKey as kitUpKeyFor, readKitUp, writeKitUp } from "./keeperKitUp";

interface SoccerLiveGameProps {
  auth: LiveAuth;
  /** The team's sport: its words, surface and keeper rules. */
  sport: SoccerSport;
  game: Game;
  teamName: string;
  /** Every kid who could play: the squad and today's fill-ins. */
  squad: Player[];
  /** The team's age group, in its halves or quarters. */
  ageGroup: SoccerAgeGroupConfig;
  /** A period's length in seconds (game, team or age group). */
  periodSeconds: number;
  /** Rolling subs: seconds between subs. */
  subIntervalSeconds: number | null;
  /** Game seconds per real second: 1 for a real game, 8 for the demo. */
  clockMultiplier?: number;
  trackScoring: boolean;
  events: GameEvent[];
  /** Season time per line and in goal, for the break's plan. */
  season?: SoccerSeasonBalance;
  /** How we play: who goes in goal, and who'd rather not. */
  keeperStrategy?: SoccerKeeperStrategy;
  keeperPrefs?: SoccerKeeperPrefs;
  isAdmin: boolean;
  exitHref: string;
}

/** Line colours on the dark next-sub card, as the tiles colour them. */
const CARD_LABEL_CLASS: Record<SoccerUnit, string> = {
  gk: "text-warm",
  def: "text-zone-b-dark",
  mid: "text-zone-c-dark",
  att: "text-zone-f-dark",
  field: "text-brand-200",
};

/** The shape a lineup plays (its line counts), else the size's default. */
function shapeOf(ag: SoccerAgeGroupConfig, lineup: SoccerLineup | null, fallbackSize: number): SoccerFormation {
  const size = lineup ? soccerOnField(lineup).length : fallbackSize;
  const shapes = soccerFormations(ag, Math.max(size, ag.minOnFieldSize));
  return (
    (lineup && shapes.find((f) => SOCCER_LINES.every((l) => f.lines[l] === lineup.lines[l].length))) ||
    shapes[0]
  );
}

/** The latest whole lineup set (kick-off, a break, a reshuffle). */
function lastSetLineup(events: GameEvent[]): SoccerLineup | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.type === "lineup_set") {
      const raw = (ev.metadata as { lineup?: unknown } | null)?.lineup;
      if (raw) return normalizeSoccerLineup(raw);
    }
  }
  return null;
}

/**
 * Why a tap-swap with the keeper is refused mid-period, where the sport
 * changes keepers only at a break (keeperSwapMidPeriod false).
 */
const KEEPER_AT_BREAKS =
  "The keeper changes at the break: kit takes a few minutes to put on. If the keeper's hurt, long-press them to mark the injury.";

function firstName(p: Player): string {
  return p.full_name.trim().split(/\s+/)[0] ?? p.full_name;
}

export function SoccerLiveGame({
  auth,
  sport,
  game,
  teamName,
  squad,
  ageGroup,
  periodSeconds,
  subIntervalSeconds,
  clockMultiplier = 1,
  trackScoring,
  events,
  season,
  keeperStrategy,
  keeperPrefs,
  isAdmin,
  exitHref,
}: SoccerLiveGameProps) {
  const router = useRouter();
  const opponentName = game.opponent || "Opponent";
  const playerById = useMemo(() => new Map(squad.map((p) => [p.id, p])), [squad]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [clockMenuOpen, setClockMenuOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const [scorerPickerOpen, setScorerPickerOpen] = useState(false);
  const [actionPlayerId, setActionPlayerId] = useState<string | null>(null);
  const [keeperPickerOpen, setKeeperPickerOpen] = useState(false);
  const [fillUnit, setFillUnit] = useState<SoccerUnit | null>(null);
  const [injury, setInjury] = useState<{ injuredId: string; unit: SoccerUnit } | null>(null);
  const [subAckKey, setSubAckKey] = useState<string | null>(null);
  const liveRootRef = useRef<HTMLDivElement>(null);
  const periodMs = periodSeconds * 1000;
  // The sport's own words and keeper rules, and the age group's periods
  // ("half" and "H", or hockey's "quarter" and "Q").
  const rules = soccerFamilyRules(sport);
  const words = rules.lineLabels;
  const periodWord = periodLabels(sport, ageGroup).label;
  const PeriodWord = periodWord.charAt(0).toUpperCase() + periodWord.slice(1);
  const periodLetter = periodWord.charAt(0).toUpperCase();

  // ── The game so far (without the open stints), for the clock ──
  const base = useMemo(() => replaySoccerGame(events), [events]);
  const isPeriodActive = base.currentPeriod >= 1 && !base.periodEnded && !base.finalised;
  const isAtBreak =
    base.periodEnded && base.currentPeriod >= 1 && base.currentPeriod < ageGroup.periodCount && !base.finalised;
  const isAtFinal = base.periodEnded && base.currentPeriod >= ageGroup.periodCount && !base.finalised;
  const isFinished = base.finalised || isAtFinal;
  const isPreKickoff = base.currentPeriod === 0 && !base.finalised;

  // ── Clock: league's and netball's period clock ──────────────
  // Game ms since the period started, less real time paused, scaled by
  // the clock multiplier. Pause is client-only, as in league.
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [pause, setPause] = useState<PeriodPause>(RUNNING_CLOCK);
  const running = pause.pausedAtMs === null;
  useEffect(() => {
    if (!isPeriodActive || !running) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isPeriodActive, running, base.periodStartedAt]);
  useEffect(() => {
    setPause(RUNNING_CLOCK);
  }, [base.currentPeriod, base.periodEnded]);

  const elapsedMs = useMemo(() => {
    const fallback = base.periodEnded ? base.periodElapsedMs : 0;
    if (nowMs == null) return fallback;
    const startedAtMs = base.periodStartedAt ? Date.parse(base.periodStartedAt) : NaN;
    return computePeriodClockMs({
      currentQuarter: base.currentPeriod,
      quarterEnded: base.periodEnded,
      finalised: base.finalised,
      quarterStartedAtMs: Number.isNaN(startedAtMs) ? null : startedAtMs,
      pausedAtMs: pause.pausedAtMs,
      accumulatedPauseMs: pause.accumulatedPauseMs,
      fallbackElapsedMs: fallback,
      clockMultiplier,
      nowMs,
    });
  }, [nowMs, base, pause, clockMultiplier]);
  const elapsedSecond = Math.floor(elapsedMs / 1000);

  // ── The game now: every kid's time so far, open stints credited ──
  const state: SoccerGameState = useMemo(
    () => (isPeriodActive ? replaySoccerGame(events, { nowMs: elapsedSecond * 1000 }) : base),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, isPeriodActive, elapsedSecond, base],
  );
  const absNowMs = state.completedPeriodMs + (isPeriodActive ? elapsedMs : 0);
  const injuredSet = useMemo(() => new Set(state.injuredIds), [state.injuredIds]);
  const loanedSet = useMemo(() => new Set(state.loanedIds), [state.loanedIds]);
  const totalMsByPlayer = useMemo(
    () => Object.fromEntries(squad.map((p) => [p.id, soccerGameMs(state, p.id)])),
    [squad, state],
  );

  // Half-time is SoccerBreak, the shared break screen (below); this
  // screen shows the lineup in play.
  const lineup: SoccerLineup | null = state.lineup;
  // The keeper named in this period's kit-up heads-up (below), if any.
  const kitUpKey = kitUpKeyFor(game.id, base.currentPeriod);
  const shape = useMemo(
    () => shapeOf(ageGroup, lastSetLineup(events), game.on_field_size),
    [ageGroup, events, game.on_field_size],
  );
  const lineCaps = useMemo(() => {
    const caps = { ...shape.lines };
    if (lineup) for (const l of SOCCER_LINES) caps[l] = Math.max(caps[l], lineup.lines[l].length);
    return caps;
  }, [shape, lineup]);

  // ── Subs ────────────────────────────────────────────────────
  const anchorMs = useMemo(
    () => (isPeriodActive ? resolveSubAnchorElapsed(events, base.currentPeriod) : null),
    [events, base.currentPeriod, isPeriodActive],
  );
  const subDue = soccerSubDue({
    mode: ageGroup.subMode,
    subIntervalMs: subIntervalSeconds != null ? subIntervalSeconds * 1000 : null,
    periodMs,
    // The windows and the period are both in game ms here (the period
    // clock is already scaled), so no further scaling.
    clockMultiplier: 1,
    anchorMs,
    elapsedMs,
  });
  // A due batch made one swap at a time: just the swaps it has left, not
  // the kid just taken off straight back on (lib/live/subAnchor).
  const batchLeft = useMemo(
    () => (isPeriodActive ? openSubBatch(events, base.currentPeriod) : 0),
    [events, base.currentPeriod, isPeriodActive],
  );
  const nextSubs = useMemo(() => {
    const batch = isPeriodActive ? suggestSoccerWindowBatch({ state, nowMs: absNowMs, prefs: keeperPrefs }) : [];
    return batchLeft > 0 ? batch.slice(0, batchLeft) : batch;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPeriodActive, state, keeperPrefs, batchLeft]);
  const subDueKey = subDue.key === null ? null : `${base.currentPeriod}:${subDue.key}`;
  const subDueShowing = isPeriodActive && subDue.due && nextSubs.length > 0 && subAckKey !== subDueKey;
  useSubDueAudioUnlock();
  const subDueShowingRef = useRef(false);
  useEffect(() => {
    if (subDueShowing && !subDueShowingRef.current) {
      playSubDueBeep();
      void hapticTap("heavy");
    }
    subDueShowingRef.current = subDueShowing;
  }, [subDueShowing]);

  // ── The next keeper's heads-up ──────────────────────────────
  // Where goal changes hands only at a break (hockey: keeper kit takes
  // minutes to put on), the keeper the break will plan for is named
  // rules.keeperKitUpSeconds before it: "Mia's in goal next half: start
  // kitting up". The name is kept for the break, whose plan puts them in
  // goal. Not before the last break: there's no next period.
  const kitUpDue =
    rules.keeperKitUpSeconds !== null &&
    isPeriodActive &&
    base.currentPeriod < ageGroup.periodCount &&
    shape.keeper &&
    !!state.lineup?.keeper &&
    periodMs - elapsedMs <= rules.keeperKitUpSeconds * 1000;
  const [kitUpKeeperId, setKitUpKeeperId] = useState<string | null>(null);
  useEffect(() => {
    setKitUpKeeperId(isPeriodActive ? readKitUp(kitUpKey) : null);
  }, [isPeriodActive, kitUpKey]);
  useEffect(() => {
    if (!kitUpDue || kitUpKeeperId) return;
    const next = suggestSoccerHalfTime({
      state,
      ageGroup,
      onFieldSize: game.on_field_size,
      formationId: shape.id,
      season,
      keeperStrategy,
      prefs: keeperPrefs,
    })?.keeper.to;
    if (!next) return;
    setKitUpKeeperId(next);
    writeKitUp(kitUpKey, next);
  }, [kitUpDue, kitUpKeeperId, kitUpKey, state, ageGroup, game.on_field_size, shape.id, season, keeperStrategy, keeperPrefs]);
  const kitUpKeeper = kitUpDue && kitUpKeeperId ? playerById.get(kitUpKeeperId) ?? null : null;

  // ── Writes ──────────────────────────────────────────────────
  const at = () => ({ quarter: base.currentPeriod, elapsed_ms: elapsedMs });

  async function run<K extends LiveActionKind>(kind: K, args: LiveActionArgs<K>) {
    setPending(true);
    setError(null);
    try {
      await enqueueLiveAction(kind, args).flushed;
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Try again.");
    } finally {
      setPending(false);
    }
    router.refresh();
  }

  const endHalfAtClient = useCallback(
    async (elapsed: number) => {
      setPending(true);
      await enqueueLiveAction("endSoccerHalf", [auth, game.id, base.currentPeriod, elapsed]).flushed;
      setPending(false);
      router.refresh();
    },
    [auth, game.id, base.currentPeriod, router],
  );

  // The hooter: the period ends itself at full time on the clock (not
  // while paused; the coach is stopping on purpose).
  const hooterFiredRef = useRef(false);
  useEffect(() => {
    if (!isPeriodActive) {
      hooterFiredRef.current = false;
      return;
    }
    if (hooterFiredRef.current || !running || !base.periodStartedAt) return;
    if (elapsedMs >= periodMs) {
      hooterFiredRef.current = true;
      void endHalfAtClient(periodMs);
    }
  }, [elapsedMs, isPeriodActive, running, base.periodStartedAt, periodMs, endHalfAtClient]);

  /** `batchLeft`: a due batch's swaps still to make after this one (the sub clock waits for them). */
  function sub(offId: string | null, onId: string, line?: SoccerUnit, batchLeft?: number) {
    return run("recordSoccerSwap", [
      auth,
      game.id,
      { off_player_id: offId, on_player_id: onId, ...(line ? { line } : {}), ...(batchLeft ? { batch_left: batchLeft } : {}), ...at() },
    ]);
  }
  function move(a: string, b: string | null, zoneB: SoccerUnit) {
    const zoneA = state.lineup ? soccerUnitOf(state.lineup, a) : null;
    if (!zoneA) return Promise.resolve();
    return run("recordSoccerMove", [
      auth,
      game.id,
      { player_a_id: a, zone_a: zoneA, ...(b ? { player_b_id: b } : {}), zone_b: zoneB, ...at() },
    ]);
  }

  async function applyAllSubs() {
    if (nextSubs.length === 0) return;
    setPending(true);
    const flushed = nextSubs.map(
      (s) =>
        enqueueLiveAction("recordSoccerSwap", [
          auth,
          game.id,
          { off_player_id: s.off_player_id, on_player_id: s.on_player_id, line: s.line, ...at() },
        ]).flushed,
    );
    await Promise.all(flushed).catch(() => {
      // A failed op rolls back in the queue; just unfreeze the screen.
    });
    setPending(false);
    setSubAckKey(subDueKey);
    router.refresh();
  }

  // ── Taps ────────────────────────────────────────────────────
  function unitOf(pid: string): SoccerUnit | null {
    return lineup ? soccerUnitOf(lineup, pid) : null;
  }

  function handleTap(pid: string, unit: SoccerUnit | null) {
    setError(null);
    if (!lineup) return;
    if (!isPeriodActive) return;

    if (pid === "") {
      if (!unit) return;
      if (selectedId) {
        const from = unitOf(selectedId);
        // An empty goal can be filled any time; the keeper leaving goal
        // waits for the break where the sport says so.
        if (from === "gk" && !rules.keeperSwapMidPeriod) {
          setSelectedId(null);
          setError(KEEPER_AT_BREAKS);
          return;
        }
        if (from) void move(selectedId, null, unit);
        else void sub(null, selectedId, unit);
        setSelectedId(null);
      } else {
        setFillUnit(unit);
      }
      return;
    }
    if (!selectedId) {
      setSelectedId(pid);
      return;
    }
    if (selectedId === pid) {
      setSelectedId(null);
      return;
    }
    const aUnit = unitOf(selectedId);
    const bUnit = unitOf(pid);
    setSelectedId(null);
    if ((aUnit === "gk" || bUnit === "gk") && !rules.keeperSwapMidPeriod) {
      setError(KEEPER_AT_BREAKS);
      return;
    }
    if (aUnit && bUnit) void move(selectedId, pid, bUnit);
    else if (aUnit && !bUnit) void sub(selectedId, pid);
    else if (!aUnit && bUnit) void sub(pid, selectedId);
    else setSelectedId(pid); // two bench kids: the second is the selection
  }

  // ── Score ───────────────────────────────────────────────────
  const canScore = isPeriodActive || isAtBreak || isAtFinal;
  function teamGoal(scorerId: string | null) {
    if (!trackScoring) return;
    setSelectedId(null);
    void run("recordSoccerGoal", [auth, game.id, scorerId, base.currentPeriod, elapsedMs]);
  }
  const opponentGoal = () => void run("recordSoccerOpponentGoal", [auth, game.id, base.currentPeriod, elapsedMs]);
  const undoGoal = () => void run("undoSoccerScore", [auth, game.id]);

  // ── Sideline: injuries, loans, late arrivals, holds ─────────
  const swappableBench = useMemo(
    () => (state.lineup?.bench ?? []).filter((id) => !injuredSet.has(id) && !loanedSet.has(id)),
    [state.lineup, injuredSet, loanedSet],
  );
  const lateArrivalCandidates = useMemo(() => {
    const placed = new Set(state.lineup ? [...soccerOnField(state.lineup), ...state.lineup.bench] : []);
    return squad.filter((p) => !placed.has(p.id));
  }, [squad, state.lineup]);

  async function markInjured(pid: string, injured: boolean) {
    await run("markInjury", [auth, game.id, { player_id: pid, injured, ...at() }]);
  }
  function startInjury(pid: string) {
    const unit = state.lineup ? soccerUnitOf(state.lineup, pid) : null;
    if (isPeriodActive && unit && swappableBench.length > 0) setInjury({ injuredId: pid, unit });
    else void markInjured(pid, true);
  }
  async function injuryReplace(injuredId: string, replacementId: string, unit: SoccerUnit) {
    setInjury(null);
    await markInjured(injuredId, true);
    await sub(injuredId, replacementId, unit);
  }
  const setLoan = (pid: string, loaned: boolean) =>
    void run("markLoan", [auth, game.id, { player_id: pid, loaned, ...at() }]);
  const setHold = (pid: string, lock: { kind: "field" } | null) =>
    void run("recordPlayerLock", [auth, game.id, { player_id: pid, lock, ...at() }]);
  const addLateArrival = (pid: string) =>
    void run("addLateArrival", [auth, game.id, { player_id: pid, ...at() }]);

  // ── Tile decorations ────────────────────────────────────────
  const lockModes = useMemo(() => {
    const out: Record<string, "field" | "zone"> = {};
    for (const [pid, lock] of Object.entries(state.locks)) {
      if (lock.kind === "field" || (lock.kind === "position" && lock.position === "gk")) out[pid] = "field";
      else if (lock.kind === "zone") out[pid] = "zone";
    }
    return out;
  }, [state.locks]);
  const swapOffs = new Map<string, number>();
  const swapOns = new Map<string, { pair: number; unit: SoccerUnit }>();
  if (!selectedId && isPeriodActive) {
    nextSubs.forEach((s, i) => {
      swapOffs.set(s.off_player_id, i + 1);
      swapOns.set(s.on_player_id, { pair: i + 1, unit: s.line });
    });
  }
  const selectedPlayer = selectedId ? playerById.get(selectedId) ?? null : null;
  const selectedOnField = selectedId !== null && unitOf(selectedId) !== null;
  const remainingMs = Math.max(0, periodMs - elapsedMs);
  const clockReadout = `${Math.floor(remainingMs / 60_000)}:${Math.floor((remainingMs % 60_000) / 1000)
    .toString()
    .padStart(2, "0")}`;
  const atHooter = isPeriodActive && elapsedMs >= periodMs;
  const breakName = periodBreakName(base.currentPeriod, ageGroup.periodCount);
  const playerDockVisible = isPeriodActive && selectedPlayer !== null;
  const scoreDockVisible = playerDockVisible && trackScoring && selectedOnField;
  const hasStickyBottom = !isPreKickoff;
  const stickyPb = playerDockVisible
    ? "pb-[calc(13rem+env(safe-area-inset-bottom))]"
    : hasStickyBottom
      ? "pb-[calc(7rem+env(safe-area-inset-bottom))]"
      : "";

  const actionPlayer = actionPlayerId ? playerById.get(actionPlayerId) ?? null : null;
  const actionUnit = actionPlayerId && state.lineup ? soccerUnitOf(state.lineup, actionPlayerId) : null;
  const actionIsKeeper = actionUnit === "gk";
  const actionHeld = actionPlayerId ? lockModes[actionPlayerId] ?? null : null;
  const lentPlayers = squad.filter((p) => loanedSet.has(p.id) && !injuredSet.has(p.id));

  // Half-time: the shared break screen.
  if (isAtBreak) {
    return (
      <div ref={liveRootRef}>
        <SoccerBreak
          auth={auth}
          sport={sport}
          game={game}
          exitHref={exitHref}
          squad={squad}
          ageGroup={ageGroup}
          state={base}
          periodMs={periodMs}
          teamName={teamName}
          trackScoring={trackScoring}
          season={season}
          keeperStrategy={keeperStrategy}
          keeperPrefs={keeperPrefs}
          formation={shape}
        />
      </div>
    );
  }

  return (
    <div ref={liveRootRef} className={`space-y-3 ${stickyPb}`.trim()}>
      <LiveTopBar
        exitHref={exitHref}
        game={game}
        isLive={base.currentPeriod > 0}
        // The sub card is the alert while it has pairs (SubDue.tsx); the
        // banner speaks only for a due sub with nothing to suggest.
        banner={
          isPeriodActive && subDueBannerShows(subDue.due, nextSubs.length) && subAckKey !== subDueKey ? (
            <SubDueBanner onAcknowledge={() => setSubAckKey(subDueKey)} />
          ) : null
        }
      />

      {error && <InlineAlert kind="danger">{error}</InlineAlert>}

      {kitUpKeeper && (
        <InlineAlert kind="warn" className="font-medium">
          <span data-testid="keeper-kit-up">
            {kitUpKeeperId === state.lineup?.keeper
              ? `${firstName(kitUpKeeper)} stays in goal next ${periodWord}.`
              : `${firstName(kitUpKeeper)}'s in goal next ${periodWord}: start kitting up.`}
          </span>
        </InlineAlert>
      )}

      {isPreKickoff && state.lineup && (
        <section className="rounded-xl border border-brand-500/40 bg-brand-50 p-4 shadow-card">
          <p className="mb-3 text-sm font-medium text-ink">
            The lineup is set. Start the first {periodWord} when the whistle goes.
          </p>
          <SFButton onClick={() => setStartConfirmOpen(true)} disabled={pending} variant="accent" size="lg" full>
            Start {periodLetter}1
          </SFButton>
        </section>
      )}

      {isPeriodActive && nextSubs.length > 0 && (
        <NextSubCard
          pairs={nextSubs.map((s) => ({
            offId: s.off_player_id,
            onId: s.on_player_id,
            label: words[s.line].short || "ON",
            labelClass: CARD_LABEL_CLASS[s.line],
          }))}
          msUntilDue={subDue.msUntilDue}
          subIntervalMs={subDue.spanMs}
          due={subDue.due}
          onApplyAll={() => void applyAllSubs()}
          onApplyOne={(i) => {
            const s = nextSubs[i];
            // One of a due batch: the rest stay due until they're made.
            if (s) void sub(s.off_player_id, s.on_player_id, s.line, subDue.due ? nextSubs.length - 1 : undefined);
          }}
          pending={pending}
          playerById={playerById}
          pairTestIdPrefix="soccer-swap-pair"
        />
      )}

      {!isFinished && lentPlayers.length > 0 && (
        <div className="rounded-lg border border-warn/40 bg-warn-soft/60 px-3 py-2">
          <p className="text-xs font-semibold text-warn">Lent to the other team</p>
          <p className="mt-0.5 text-[11px] text-warn/80">Tap &ldquo;Bring back&rdquo; to return a player to your bench.</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {lentPlayers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setLoan(p.id, false)}
                disabled={pending}
                aria-label={`Bring ${p.full_name} back`}
                className="inline-flex items-center gap-1 rounded-full border border-warn/50 bg-surface px-2.5 py-1 text-xs font-medium text-warn transition-colors hover:bg-warn/15 disabled:opacity-60 motion-safe:active:scale-[0.97]"
              >
                <span>{p.full_name}</span>
                <span className="ml-0.5 text-[11px] font-semibold text-warn/80">Bring back</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!isFinished && lineup && (
        <>
          <SoccerField
            words={words}
            surface={rules.surface}
            lineup={lineup}
            lineCaps={lineCaps}
            hasKeeper={shape.keeper}
            playersById={playerById}
            onTap={handleTap}
            onLongPress={isPeriodActive ? setActionPlayerId : undefined}
            selectedPlayerId={selectedId}
            dimUnselected={isPeriodActive}
            primedEmptyUnit={null}
            swapOffs={swapOffs}
            totalPairs={nextSubs.length}
            swapDue={subDue.due}
            totalMsByPlayer={totalMsByPlayer}
            unitMsByPlayer={state.ms}
            injuredIds={state.injuredIds}
            lockModes={lockModes}
            goalsByPlayer={state.playerGoals}
          />
          <SoccerBench
            words={words}
            bench={lineup.bench}
            playersById={playerById}
            onTap={(pid) => handleTap(pid, null)}
            onLongPress={isPeriodActive ? setActionPlayerId : undefined}
            selectedPlayerId={selectedId}
            dimUnselected={isPeriodActive}
            swapOns={swapOns}
            totalPairs={nextSubs.length}
            totalMsByPlayer={totalMsByPlayer}
            unitMsByPlayer={state.ms}
            injuredIds={state.injuredIds}
            loanedIds={state.loanedIds}
            lockModes={lockModes}
            goalsByPlayer={state.playerGoals}
          />
        </>
      )}

      {selectedPlayer && !selectedOnField && isPeriodActive && (
        <p className="rounded-md bg-brand-50 px-3 py-2 text-xs text-brand-800">
          Selected from bench: <strong>{selectedPlayer.full_name}</strong> — tap a player on the field to swap them on.{" "}
          <button type="button" onClick={() => setSelectedId(null)} className="text-brand-700 underline">
            Cancel
          </button>
        </p>
      )}

      {isAtFinal && (
        <SoccerFullTimeReview
          auth={auth}
          gameId={game.id}
          state={state}
          periodCount={ageGroup.periodCount}
          periodWord={periodWord}
          trackScoring={trackScoring}
          finalisedElapsedMs={base.periodElapsedMs}
          teamName={teamName}
          opponentName={opponentName}
          onTeamGoal={() => setScorerPickerOpen(true)}
          onOpponentGoal={opponentGoal}
          onUndo={undoGoal}
          scorePending={pending}
        />
      )}

      {base.finalised && (
        <SoccerGameSummaryCard
          emoji={rules.emoji}
          state={state}
          squad={squad}
          presentIds={presentPlayerIds(events)}
          trackScoring={trackScoring}
          teamName={teamName}
          opponentName={opponentName}
          showArrivalPulse
        />
      )}

      <LiveAdminUtilityRow
        candidates={lateArrivalCandidates}
        onLateArrival={addLateArrival}
        lateArrivalPending={pending}
        isAdmin={isAdmin}
        finished={base.finalised}
        auth={auth}
        gameId={game.id}
      />

      {playerDockVisible && selectedPlayer && (
        <ScoreRecordingDock
          heading={
            scoreDockVisible ? (
              <>
                Record a goal for <span className="text-brand-700">{selectedPlayer.full_name}</span>
              </>
            ) : (
              <span className="text-brand-700">{selectedPlayer.full_name}</span>
            )
          }
          onCancel={() => setSelectedId(null)}
          onPlayerActions={() => {
            const id = selectedPlayer.id;
            setSelectedId(null);
            setActionPlayerId(id);
          }}
          actions={
            scoreDockVisible ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => teamGoal(selectedPlayer.id)}
                  disabled={pending}
                  className="w-full rounded-sm bg-brand-600 py-3 font-mono text-base font-bold uppercase tracking-micro text-white shadow-card transition-colors duration-fast ease-out-quart hover:bg-brand-500 disabled:opacity-60"
                >
                  + Goal
                </button>
                <p className="text-center text-[11px] text-ink-mute">
                  Or tap a bench player to swap <strong>{selectedPlayer.full_name}</strong> off.
                </p>
              </div>
            ) : (
              <p className="text-xs text-ink-dim">
                {selectedOnField ? "Tap a bench player to swap them off." : "Tap a field player to swap them on."}
              </p>
            )
          }
        />
      )}

      {hasStickyBottom && (
        <LiveStickyScoreBar
          scoringOff={
            !trackScoring
              ? { settingsHref: auth.kind === "team" && isAdmin ? `/teams/${auth.teamId}/settings#section-game-day-extras` : null }
              : undefined
          }
          scorebug={
            <SoccerScoreBug
              teamName={teamName}
              opponentName={opponentName}
              teamGoals={state.teamScore.goals}
              opponentGoals={state.opponentScore.goals}
              periodLetter={periodLetter}
              currentPeriod={base.currentPeriod}
              periodCount={ageGroup.periodCount}
              clockReadout={clockReadout}
              running={running}
              isPreGame={isPreKickoff}
              isFinished={base.finalised}
              atHooter={atHooter}
              breakName={breakName}
              trackScoring={trackScoring}
              pending={pending}
              onTeamGoal={canScore ? () => setScorerPickerOpen(true) : undefined}
              onOpponentGoal={canScore ? opponentGoal : undefined}
              onClockTap={isPeriodActive ? () => setClockMenuOpen(true) : undefined}
              clockPulseKey={base.periodEnded ? `end-${base.currentPeriod}` : null}
            />
          }
          undoStrip={
            (state.teamScore.goals > 0 || state.opponentScore.goals > 0) && !base.finalised ? (
              <UndoStrip flashing={false} message="" onUndo={undoGoal} disabled={pending} />
            ) : undefined
          }
        />
      )}

      {startConfirmOpen && (
        <StartQuarterModal
          quarter={base.currentPeriod + 1}
          periodLabel={periodWord}
          cue="whistle goes"
          loading={pending}
          onStart={() => {
            setStartConfirmOpen(false);
            void run("startSoccerHalf", [auth, game.id, 1]);
          }}
          onCancel={() => setStartConfirmOpen(false)}
        />
      )}

      {clockMenuOpen && (
        <ClockMenu
          periodAbbr={`${periodLetter}${base.currentPeriod}`}
          running={running}
          onPause={() => setPause((p) => togglePeriodPause(p, Date.now()))}
          onResume={() => setPause((p) => togglePeriodPause(p, Date.now()))}
          onEndEarly={isPeriodActive ? () => setEndConfirmOpen(true) : undefined}
          onClose={() => setClockMenuOpen(false)}
        />
      )}

      {endConfirmOpen && (
        <ManualEndQuarterConfirm
          quarter={base.currentPeriod}
          onConfirm={() => {
            setEndConfirmOpen(false);
            // Ending early credits the whole period (AFL and league do the
            // same): the real game ran on while the app's clock stopped.
            void endHalfAtClient(periodMs);
          }}
          onCancel={() => setEndConfirmOpen(false)}
          playersLabel="on-field"
          periodLabel={periodWord}
        />
      )}

      {scorerPickerOpen && (
        <SlotFillSheet
          slotLabel="goal"
          titleVerb="Who scored the"
          candidates={(state.lineup ? soccerOnField(state.lineup) : [])
            .map((id) => playerById.get(id))
            .filter((p): p is Player => Boolean(p))
            .map((p) => ({ id: p.id, name: p.full_name, jerseyNumber: p.jersey_number }))}
          emptyMessage={`Nobody is on ${words.field.phrase}.`}
          extraOption={{
            label: "Not sure who",
            subLabel: "Counts the goal without a scorer",
            onSelect: () => {
              setScorerPickerOpen(false);
              teamGoal(null);
            },
          }}
          onPick={(pid) => {
            setScorerPickerOpen(false);
            teamGoal(pid);
          }}
          onCancel={() => setScorerPickerOpen(false)}
        />
      )}

      {actionPlayer && (
        <LockModal
          player={actionPlayer}
          currentLock={actionIsKeeper ? null : actionHeld}
          currentZone={null}
          isInjured={injuredSet.has(actionPlayer.id)}
          isLoaned={loanedSet.has(actionPlayer.id)}
          seasonLoanMins={0}
          squadLoanMins={0}
          onLockField={isPeriodActive && actionUnit && !actionIsKeeper ? () => {
            setActionPlayerId(null);
            setHold(actionPlayer.id, { kind: "field" });
          } : undefined}
          onUnlock={() => {
            const pid = actionPlayer.id;
            setActionPlayerId(null);
            if (actionHeld) setHold(pid, null);
          }}
          onToggleInjury={() => {
            const pid = actionPlayer.id;
            setActionPlayerId(null);
            if (injuredSet.has(pid)) void markInjured(pid, false);
            else startInjury(pid);
          }}
          onToggleLoan={() => {
            const pid = actionPlayer.id;
            setActionPlayerId(null);
            setLoan(pid, !loanedSet.has(pid));
          }}
          onSwitch={() => {
            setActionPlayerId(null);
            setSelectedId(actionPlayer.id);
          }}
          // "Swap keeper" mid-period, where the sport allows it (hockey
          // changes keepers at the break; an injury still replaces one).
          vestReplaceLabel={actionIsKeeper && isPeriodActive && rules.keeperSwapMidPeriod ? "keeper" : undefined}
          vestReplaceHint="Pick who goes in goal now"
          onReplaceVest={
            actionIsKeeper && isPeriodActive && rules.keeperSwapMidPeriod
              ? () => {
                  setActionPlayerId(null);
                  setKeeperPickerOpen(true);
                }
              : undefined
          }
          onClose={() => setActionPlayerId(null)}
        />
      )}

      {keeperPickerOpen && state.lineup && (
        <SlotFillSheet
          slotLabel="keeper"
          titleVerb="Who goes in as"
          subtitle="A player on the field swaps places with the keeper; a bench player comes on in goal."
          candidates={[...soccerOutfield(state.lineup), ...swappableBench]
            .map((id) => playerById.get(id))
            .filter((p): p is Player => Boolean(p) && !injuredSet.has(p!.id) && !loanedSet.has(p!.id))
            .map((p) => ({
              id: p.id,
              name: p.full_name,
              jerseyNumber: p.jersey_number,
              subLabel: soccerUnitOf(state.lineup!, p.id)
                ? `On ${words.field.phrase} · ${words[soccerUnitOf(state.lineup!, p.id)!].label}`
                : "Bench",
            }))}
          emptyMessage="Nobody can go in goal."
          onPick={(pid) => {
            setKeeperPickerOpen(false);
            const lu = state.lineup!;
            if (!lu.keeper) return;
            if (soccerUnitOf(lu, pid)) void move(lu.keeper, pid, soccerUnitOf(lu, pid)!);
            else void sub(lu.keeper, pid, "gk");
          }}
          onCancel={() => setKeeperPickerOpen(false)}
        />
      )}

      {fillUnit && lineup && (
        <SlotFillSheet
          slotLabel={`${words[fillUnit].label.toLowerCase()} spot`}
          candidates={lineup.bench
            .filter((id) => !injuredSet.has(id) && !loanedSet.has(id))
            .map((id) => playerById.get(id))
            .filter((p): p is Player => Boolean(p))
            .map((p) => ({ id: p.id, name: p.full_name, jerseyNumber: p.jersey_number }))}
          emptyMessage="Nobody on the bench can come on."
          onPick={(pid) => {
            const unit = fillUnit;
            setFillUnit(null);
            void sub(null, pid, unit);
          }}
          onCancel={() => setFillUnit(null)}
        />
      )}

      {injury &&
        (() => {
          const injured = playerById.get(injury.injuredId);
          if (!injured) return null;
          const candidates: InjuryReplacementCandidate[] = swappableBench
            .map((id) => playerById.get(id))
            .filter((p): p is Player => Boolean(p))
            .map((p) => ({ player: p, totalMs: totalMsByPlayer[p.id] ?? 0 }))
            .sort((a, b) => a.totalMs - b.totalMs);
          return (
            <InjuryReplacementModal
              injuredPlayer={injured}
              spotLabel={words[injury.unit].label}
              candidates={candidates}
              onPickReplacement={(rid) => void injuryReplace(injury.injuredId, rid, injury.unit)}
              onSkipReplacement={() => {
                setInjury(null);
                void markInjured(injury.injuredId, true);
              }}
              onCancel={() => setInjury(null)}
            />
          );
        })()}

      <LongPressHint enabled={isPeriodActive && !selectedId} />
    </div>
  );
}
