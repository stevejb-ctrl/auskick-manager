"use client";

// ─── SoccerLiveGame ──────────────────────────────────────────
// The Football (soccer) live game. Mirrors AFL's LiveGame and league's
// LeagueLiveGame end to end, so a coach who runs both sports finds the
// same shell: the shared LiveTopBar (sub due as a banner under it),
// the next-sub card, the pitch and bench, the shared player dock and
// LockModal long-press actions, the sticky scorebug with undo, the
// clock menu, the half-time break, and the full-time review and share
// card. What's soccer's own:
//
//   - The keeper is a slot, held for the half. Rolling subs fill
//     outfield lines only (the engine never suggests taking the keeper
//     off); "Swap keeper" on the keeper's actions changes it on purpose.
//   - Half-time plans the next half (suggestSoccerHalfTime): who takes
//     the keeper top, who plays and where. The break edits that plan;
//     Start commits it as one lineup_set before the half starts.
//   - Subs are rolling (any time) or in windows a half, per the age
//     group's sub mode; either way the card rotates the bench, each
//     sub evening time.
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
import { resolveSubAnchorElapsed } from "@/lib/live/subAnchor";
import { presentPlayerIds } from "@/lib/live/presentPlayers";
import type { Game, GameEvent, LiveAuth, Player } from "@/lib/types";
import { soccerFormations } from "@/lib/sports/soccer";
import {
  normalizeSoccerLineup,
  soccerOnField,
  soccerOutfield,
  soccerUnitOf,
  type SoccerLineup,
} from "@/lib/sports/soccer/lineup";
import { replaySoccerGame, soccerGameMs, type SoccerGameState } from "@/lib/sports/soccer/replay";
import {
  suggestSoccerHalfTime,
  suggestSoccerWindowBatch,
  type SoccerSeasonBalance,
} from "@/lib/sports/soccer/suggest";
import {
  benchOutInSoccerLineup,
  placeInSoccerLineup,
  soccerSubDue,
  swapInSoccerLineup,
  withEveryoneInSoccerLineup,
} from "@/lib/sports/soccer/live";
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
import { KeeperHandoverCard } from "./KeeperHandoverCard";
import { SoccerFullTimeReview, SoccerGameSummaryCard } from "./SoccerFullTime";
import { SOCCER_UNIT_LABEL, SOCCER_UNIT_SHORT, type SoccerTileCaption } from "./SoccerPlayerTile";
import { soccerKeeperNote } from "./soccerWords";

interface SoccerLiveGameProps {
  auth: LiveAuth;
  game: Game;
  teamName: string;
  /** Every kid who could play: the squad and today's fill-ins. */
  squad: Player[];
  ageGroup: SoccerAgeGroupConfig;
  /** A half's length in seconds (game, team or age group). */
  periodSeconds: number;
  /** Rolling subs: seconds between subs. */
  subIntervalSeconds: number | null;
  /** Game seconds per real second: 1 for a real game, 8 for the demo. */
  clockMultiplier?: number;
  trackScoring: boolean;
  events: GameEvent[];
  /** Season time per line and in goal, for the half-time plan. */
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

/** The latest whole lineup set (kick-off, half-time, a reshuffle). */
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

/** "Q" style abbreviation for the period: soccer plays halves. */
const PERIOD_LETTER = "H";

function readBreakDraft(key: string): SoccerLineup | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? normalizeSoccerLineup(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
function writeBreakDraft(key: string, lineup: SoccerLineup | null) {
  try {
    if (lineup) window.sessionStorage.setItem(key, JSON.stringify(lineup));
    else window.sessionStorage.removeItem(key);
  } catch {
    // Private mode or storage blocked: the plan just won't survive a reload.
  }
}

export function SoccerLiveGame({
  auth,
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

  // ── The game so far (without the open stints), for the clock ──
  const base = useMemo(() => replaySoccerGame(events), [events]);
  const isPeriodActive = base.currentPeriod >= 1 && !base.periodEnded && !base.finalised;
  const isAtBreak =
    base.periodEnded && base.currentPeriod >= 1 && base.currentPeriod < ageGroup.periodCount && !base.finalised;
  const isAtFinal = base.periodEnded && base.currentPeriod >= ageGroup.periodCount && !base.finalised;
  const isFinished = base.finalised || isAtFinal;
  const isPreKickoff = base.currentPeriod === 0 && !base.finalised;

  // ── Clock: league's and netball's period clock ──────────────
  // Game ms since the half started, less real time paused, scaled by
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

  // ── Half-time: the plan for the next half ──────────────────
  // Suggested once per break and kept in session storage, so an edit
  // survives a trip to the team page; Start commits it.
  const draftKey = `soccer-break:${game.id}:${base.currentPeriod}`;
  const halfTimePlan = useMemo(
    () =>
      isAtBreak
        ? suggestSoccerHalfTime({
            state: base,
            ageGroup,
            onFieldSize: game.on_field_size,
            formationId: shapeOf(ageGroup, lastSetLineup(events), game.on_field_size).id,
            season,
            keeperStrategy,
            prefs: keeperPrefs,
          })
        : null,
    [isAtBreak, base, ageGroup, game.on_field_size, events, season, keeperStrategy, keeperPrefs],
  );
  const [storedDraft, setBreakDraftState] = useState<SoccerLineup | null>(null);
  useEffect(() => {
    if (!isAtBreak) {
      setBreakDraftState(null);
      return;
    }
    setBreakDraftState(readBreakDraft(draftKey) ?? halfTimePlan?.lineup ?? null);
  }, [isAtBreak, draftKey, halfTimePlan]);
  const setBreakDraft = useCallback(
    (next: SoccerLineup) => {
      setBreakDraftState(next);
      writeBreakDraft(draftKey, next);
    },
    [draftKey],
  );
  // The plan, with anyone who has arrived since it was made on its
  // bench (a kept plan would otherwise drop them from the game at Start).
  const breakDraft = useMemo(
    () => (storedDraft && state.lineup ? withEveryoneInSoccerLineup(storedDraft, state.lineup) : storedDraft),
    [storedDraft, state.lineup],
  );

  // What the screen shows: the break's plan, else the lineup in play.
  const lineup: SoccerLineup | null = isAtBreak ? breakDraft : state.lineup;
  const shape = useMemo(
    () => shapeOf(ageGroup, isAtBreak ? breakDraft : lastSetLineup(events), game.on_field_size),
    [ageGroup, isAtBreak, breakDraft, events, game.on_field_size],
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
    // The windows and the half are both in game ms here (the period
    // clock is already scaled), so no further scaling.
    clockMultiplier: 1,
    anchorMs,
    elapsedMs,
  });
  const nextSubs = useMemo(
    () => (isPeriodActive ? suggestSoccerWindowBatch({ state, nowMs: absNowMs }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPeriodActive, state],
  );
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

  // The hooter: the half ends itself at full time on the clock (not
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

  function sub(offId: string | null, onId: string, line?: SoccerUnit) {
    return run("recordSoccerSwap", [
      auth,
      game.id,
      { off_player_id: offId, on_player_id: onId, ...(line ? { line } : {}), ...at() },
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
    // At half-time a tap edits the plan; the half's Start commits it.
    if (isAtBreak) {
      if (pid === "") {
        if (selectedId && unit) setBreakDraft(placeInSoccerLineup(lineup, selectedId, unit));
        else if (unit) setFillUnit(unit);
        setSelectedId(null);
        return;
      }
      if (!selectedId || selectedId === pid) {
        setSelectedId(selectedId === pid ? null : pid);
        return;
      }
      setBreakDraft(swapInSoccerLineup(lineup, selectedId, pid));
      setSelectedId(null);
      return;
    }
    if (!isPeriodActive) return;

    if (pid === "") {
      if (!unit) return;
      if (selectedId) {
        const from = unitOf(selectedId);
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

  // ── The half's Start ────────────────────────────────────────
  async function handleStartNextHalf() {
    setStartConfirmOpen(false);
    setPending(true);
    setError(null);
    let el = liveRootRef.current?.parentElement ?? null;
    while (el) {
      if (el.scrollTop > 0) el.scrollTop = 0;
      el = el.parentElement;
    }
    window.scrollTo({ top: 0, behavior: "auto" });
    const plan = breakDraft ?? state.lineup;
    if (plan) {
      // Kids who can't play now start on the bench, places left empty.
      const out = new Set([...state.injuredIds, ...state.loanedIds]);
      await enqueueLiveAction("recordSoccerLineupSet", [auth, game.id, benchOutInSoccerLineup(plan, out), undefined])
        .flushed;
    }
    await enqueueLiveAction("startSoccerHalf", [auth, game.id, base.currentPeriod + 1]).flushed;
    writeBreakDraft(draftKey, null);
    setPending(false);
    router.refresh();
  }

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
  // At the break, each kid's tile says where they're heading.
  const captions = useMemo(() => {
    if (!isAtBreak || !breakDraft || !state.lineup) return undefined;
    const out: Record<string, SoccerTileCaption> = {};
    for (const pid of soccerOnField(breakDraft)) {
      const was = soccerUnitOf(state.lineup, pid);
      const to = soccerUnitOf(breakDraft, pid)!;
      const toWord = SOCCER_UNIT_SHORT[to] || "ON";
      out[pid] =
        was === to
          ? { text: "Stays", tone: "stay" }
          : { text: `${was ? SOCCER_UNIT_SHORT[was] || "On" : "Bench"} → ${toWord}`, tone: "move" };
    }
    return out;
  }, [isAtBreak, breakDraft, state.lineup]);

  const selectedPlayer = selectedId ? playerById.get(selectedId) ?? null : null;
  const selectedOnField = selectedId !== null && unitOf(selectedId) !== null;
  const remainingMs = Math.max(0, periodMs - elapsedMs);
  const clockReadout = `${Math.floor(remainingMs / 60_000)}:${Math.floor((remainingMs % 60_000) / 1000)
    .toString()
    .padStart(2, "0")}`;
  const atHooter = isPeriodActive && elapsedMs >= periodMs;
  const breakName = base.currentPeriod >= ageGroup.periodCount ? "Full time" : "Half time";
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
  const keeper = lineup?.keeper ? playerById.get(lineup.keeper) ?? null : null;
  const lentPlayers = squad.filter((p) => loanedSet.has(p.id) && !injuredSet.has(p.id));

  return (
    <div ref={liveRootRef} className={`space-y-3 ${stickyPb}`.trim()}>
      <LiveTopBar
        exitHref={exitHref}
        game={game}
        isLive={base.currentPeriod > 0}
        banner={subDueShowing ? <SubDueBanner onAcknowledge={() => setSubAckKey(subDueKey)} /> : null}
      />

      {error && <InlineAlert kind="danger">{error}</InlineAlert>}

      {isPreKickoff && state.lineup && (
        <section className="rounded-xl border border-brand-500/40 bg-brand-50 p-4 shadow-card">
          <p className="mb-3 text-sm font-medium text-ink">The lineup is set. Start the first half when the whistle goes.</p>
          <SFButton onClick={() => setStartConfirmOpen(true)} disabled={pending} variant="accent" size="lg" full>
            Start H1
          </SFButton>
        </section>
      )}

      {isPeriodActive && nextSubs.length > 0 && (
        <NextSubCard
          pairs={nextSubs.map((s) => ({
            offId: s.off_player_id,
            onId: s.on_player_id,
            label: SOCCER_UNIT_SHORT[s.line] || "ON",
            labelClass: CARD_LABEL_CLASS[s.line],
          }))}
          msUntilDue={subDue.msUntilDue}
          subIntervalMs={subDue.spanMs}
          due={subDue.due}
          onApplyAll={() => void applyAllSubs()}
          onApplyOne={(i) => {
            const s = nextSubs[i];
            if (s) void sub(s.off_player_id, s.on_player_id, s.line);
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

      {isAtBreak && (
        <section className="rounded-xl border border-brand-500/40 bg-brand-50 p-4 shadow-card">
          <p className="mb-1 text-sm font-medium text-ink">
            Half {base.currentPeriod} done.
            {trackScoring && (
              <>
                {" "}
                Score: <strong>{state.teamScore.goals}</strong> – <strong>{state.opponentScore.goals}</strong>.
              </>
            )}
          </p>
          <p className="mb-3 text-xs text-ink-dim">
            Here&apos;s the plan for the next half: who goes in goal, who plays and where. Tap two players to swap them.
          </p>
          <SFButton onClick={() => setStartConfirmOpen(true)} disabled={pending || !breakDraft} variant="accent" size="lg" full>
            Start H{base.currentPeriod + 1}
          </SFButton>
        </section>
      )}

      {isAtBreak && breakDraft && shape.keeper && (
        <KeeperHandoverCard
          periodWord="half"
          period={base.currentPeriod + 1}
          from={state.lineup?.keeper ? playerById.get(state.keeperAtEnd[base.currentPeriod] ?? state.lineup.keeper) ?? null : null}
          to={keeper}
          candidates={squad.filter(
            (p) =>
              !injuredSet.has(p.id) &&
              !loanedSet.has(p.id) &&
              (soccerUnitOf(breakDraft, p.id) !== null || breakDraft.bench.includes(p.id)),
          )}
          suggestedId={halfTimePlan?.keeper.to ?? null}
          strategyNote={soccerKeeperNote(keeperStrategy ?? ageGroup.keeper)}
          onPick={(pid) => {
            if (breakDraft.keeper === pid) return;
            setBreakDraft(
              breakDraft.keeper ? swapInSoccerLineup(breakDraft, breakDraft.keeper, pid) : placeInSoccerLineup(breakDraft, pid, "gk"),
            );
          }}
          pending={pending}
        />
      )}

      {!isFinished && lineup && (
        <>
          <SoccerField
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
            captions={captions}
          />
          <SoccerBench
            bench={lineup.bench}
            playersById={playerById}
            onTap={(pid) => handleTap(pid, null)}
            onLongPress={isPeriodActive || isAtBreak ? setActionPlayerId : undefined}
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
              periodLetter={PERIOD_LETTER}
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
          periodLabel="half"
          cue="whistle goes"
          loading={pending}
          onStart={() => {
            if (isPreKickoff) {
              setStartConfirmOpen(false);
              void run("startSoccerHalf", [auth, game.id, 1]);
            } else {
              void handleStartNextHalf();
            }
          }}
          onCancel={() => setStartConfirmOpen(false)}
        />
      )}

      {clockMenuOpen && (
        <ClockMenu
          periodAbbr={`${PERIOD_LETTER}${base.currentPeriod}`}
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
            // Ending early credits the whole half (AFL and league do the
            // same): the real game ran on while the app's clock stopped.
            void endHalfAtClient(periodMs);
          }}
          onCancel={() => setEndConfirmOpen(false)}
          playersLabel="on-field"
          periodLabel="half"
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
          emptyMessage="Nobody is on the field."
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
          vestReplaceLabel={actionIsKeeper && isPeriodActive ? "keeper" : undefined}
          vestReplaceHint="Pick who goes in goal now"
          onReplaceVest={
            actionIsKeeper && isPeriodActive
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
              subLabel: soccerUnitOf(state.lineup!, p.id) ? `On the field · ${SOCCER_UNIT_LABEL[soccerUnitOf(state.lineup!, p.id)!]}` : "Bench",
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
          slotLabel={`${SOCCER_UNIT_LABEL[fillUnit].toLowerCase()} spot`}
          candidates={lineup.bench
            .filter((id) => !injuredSet.has(id) && !loanedSet.has(id))
            .map((id) => playerById.get(id))
            .filter((p): p is Player => Boolean(p))
            .map((p) => ({ id: p.id, name: p.full_name, jerseyNumber: p.jersey_number }))}
          emptyMessage="Nobody on the bench can come on."
          onPick={(pid) => {
            const unit = fillUnit;
            setFillUnit(null);
            if (isAtBreak) setBreakDraft(placeInSoccerLineup(lineup, pid, unit));
            else void sub(null, pid, unit);
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
              spotLabel={SOCCER_UNIT_LABEL[injury.unit]}
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
