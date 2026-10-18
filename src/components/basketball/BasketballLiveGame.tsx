"use client";

// ─── BasketballLiveGame ──────────────────────────────────────
// The basketball live game. Mirrors soccer's SoccerLiveGame and AFL's
// LiveGame end to end, so a coach who runs both sports finds the same
// shell: the shared LiveTopBar (sub due as a banner under it), the
// next-sub card, the court and bench, the shared player dock and
// LockModal long-press actions, the sticky scorebug with undo, the clock
// menu, the breaks, and the full-time review and share card. What's
// basketball's own (.planning/BASKETBALL-PLAN.md):
//
//   - Positions are optional: the team's How we play strategy plays no
//     positions (one court line), guards and forwards, or 1 to 5.
//   - Subs go at a dead ball, through the table: the card names who
//     goes to the table, and the coach taps them on when the whistle
//     goes. No sub prompt in the last minute of a period.
//   - The running clock stops at 0:00 and waits for the real hooter:
//     the stadium clock stops in the last minutes, so the coach ends the
//     period. A pause (a timeout) is saved on the phone, so a reload
//     doesn't count it as play.
//   - Fouls: the coach's tally on each tile, foul trouble in the sub
//     suggestions, a foul-out at the age's limit (out for the game), and
//     a timed sit-out (the 5-minute sin bin) from the player's actions.
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
import { computePeriodClockMs, togglePeriodPause } from "@/lib/live/periodClock";
import { usePeriodPause } from "@/lib/live/periodPauseStorage";
import { resolveSubAnchorElapsed } from "@/lib/live/subAnchor";
import { presentPlayerIds } from "@/lib/live/presentPlayers";
import type { Game, GameEvent, LiveAuth, Player } from "@/lib/types";
import { BASKETBALL_POSITION_DEFS } from "@/lib/sports/basketball";
import {
  basketballLineOf,
  basketballOnCourt,
  normalizeBasketballLineup,
  type BasketballLineup,
} from "@/lib/sports/basketball/lineup";
import {
  basketballCanPlay,
  basketballGameMs,
  replayBasketballGame,
  type BasketballGameState,
} from "@/lib/sports/basketball/replay";
import {
  basketballShapeFor,
  suggestBasketballBreakPlan,
  suggestBasketballSubs,
  type BasketballPrefs,
  type BasketballSeasonBalance,
} from "@/lib/sports/basketball/suggest";
import {
  basketballSubDue,
  benchOutInBasketballLineup,
  placeInBasketballLineup,
  swapInBasketballLineup,
  withEveryoneInBasketballLineup,
} from "@/lib/sports/basketball/live";
import {
  BASKETBALL_LINES,
  usesBasketballLines,
  type BasketballAgeGroupConfig,
  type BasketballLine,
  type BasketballStrategy,
} from "@/lib/sports/basketball/types";
import { BasketballCourt } from "./BasketballCourt";
import { BasketballBench } from "./BasketballBench";
import { BasketballScoreBug } from "./BasketballScoreBug";
import { BasketballFullTimeReview, BasketballGameSummaryCard } from "./BasketballFullTime";
import {
  BASKETBALL_LINE_LABEL,
  BASKETBALL_LINE_SHORT,
  type BasketballTileCaption,
} from "./BasketballPlayerTile";

type Points = 1 | 2 | 3;

/** A sit-out's length: the 5-minute sin bin. */
export const SIT_OUT_MS = 5 * 60_000;

interface BasketballLiveGameProps {
  auth: LiveAuth;
  game: Game;
  teamName: string;
  /** Every kid who could play: the squad and today's fill-ins. */
  squad: Player[];
  /** The age group as the team plays it (halves or quarters). */
  ageGroup: BasketballAgeGroupConfig;
  /** A period's length in seconds (game, team or age group). */
  periodSeconds: number;
  /** Seconds between subs. */
  subIntervalSeconds: number | null;
  /** Game seconds per real second: 1 for a real game, 8 for the demo. */
  clockMultiplier?: number;
  trackScoring: boolean;
  /** The coach's foul tally (the age's default, or the team's). */
  trackFouls: boolean;
  /** 3-pointers count (the +3 chips show). */
  threePointers: boolean;
  events: GameEvent[];
  /** How we play: the rotation, roles and season balance. */
  strategy: BasketballStrategy;
  prefs?: BasketballPrefs;
  season?: BasketballSeasonBalance;
  isAdmin: boolean;
  exitHref: string;
}

/** Line colours on the dark next-sub card, as the tiles colour them. */
const CARD_LABEL_CLASS: Record<BasketballLine, string> = {
  guard: "text-zone-c-dark",
  forward: "text-zone-f-dark",
  court: "text-brand-200",
};

const POSITION_LABEL = Object.fromEntries(BASKETBALL_POSITION_DEFS.map((p) => [p.key, p.label])) as Record<string, string>;

/** The latest whole lineup set (tip-off, a break, a reshuffle). */
function lastSetLineup(events: GameEvent[]): BasketballLineup | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.type === "lineup_set") {
      const raw = (ev.metadata as { lineup?: unknown } | null)?.lineup;
      if (raw) return normalizeBasketballLineup(raw);
    }
  }
  return null;
}

/** The shape a lineup plays ("2-3" / "3-2"), from its line counts. */
function shapeIdOf(lineup: BasketballLineup | null): string | null {
  if (!lineup || lineup.lines.court.length > 0) return null;
  return `${lineup.lines.guard.length}-${lineup.lines.forward.length}`;
}

function readBreakDraft(key: string): BasketballLineup | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? normalizeBasketballLineup(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
function writeBreakDraft(key: string, lineup: BasketballLineup | null) {
  try {
    if (lineup) window.sessionStorage.setItem(key, JSON.stringify(lineup));
    else window.sessionStorage.removeItem(key);
  } catch {
    // Private mode or storage blocked: the plan just won't survive a reload.
  }
}

export function BasketballLiveGame({
  auth,
  game,
  teamName,
  squad,
  ageGroup,
  periodSeconds,
  subIntervalSeconds,
  clockMultiplier = 1,
  trackScoring,
  trackFouls,
  threePointers,
  events,
  strategy,
  prefs,
  season,
  isAdmin,
  exitHref,
}: BasketballLiveGameProps) {
  const router = useRouter();
  const opponentName = game.opponent || "Opponent";
  const playerById = useMemo(() => new Map(squad.map((p) => [p.id, p])), [squad]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [clockMenuOpen, setClockMenuOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const [scorerPoints, setScorerPoints] = useState<Points | null>(null);
  const [actionPlayerId, setActionPlayerId] = useState<string | null>(null);
  const [fillLine, setFillLine] = useState<BasketballLine | null>(null);
  const [leaving, setLeaving] = useState<{
    playerId: string;
    line: BasketballLine;
    reason: "injured" | "fouled_out" | "sitting_out";
  } | null>(null);
  const [subAckKey, setSubAckKey] = useState<string | null>(null);
  const liveRootRef = useRef<HTMLDivElement>(null);
  const periodMs = periodSeconds * 1000;
  const periodLetter = ageGroup.periodCount === 4 ? "Q" : "H";
  const periodWord = ageGroup.periodCount === 4 ? "quarter" : "half";

  // ── The game so far (without the open stints), for the clock ──
  const base = useMemo(() => replayBasketballGame(events), [events]);
  const isPeriodActive = base.currentPeriod >= 1 && !base.periodEnded && !base.finalised;
  const isAtBreak =
    base.periodEnded && base.currentPeriod >= 1 && base.currentPeriod < ageGroup.periodCount && !base.finalised;
  const isAtFinal = base.periodEnded && base.currentPeriod >= ageGroup.periodCount && !base.finalised;
  const isFinished = base.finalised || isAtFinal;
  const isPreTipoff = base.currentPeriod === 0 && !base.finalised;

  // ── Clock: the shared period clock, its pause saved on the phone ──
  // Game ms since the period started, less real time paused, scaled by
  // the clock multiplier, held at the period's length: the stadium clock
  // stops in the last minutes, so the phone waits there for the hooter.
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [pause, setPause] = usePeriodPause(game.id, base.currentPeriod);
  const running = pause.pausedAtMs === null;
  useEffect(() => {
    if (!isPeriodActive || !running) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isPeriodActive, running, base.periodStartedAt]);

  const elapsedMs = useMemo(() => {
    const fallback = base.periodEnded ? base.periodElapsedMs : 0;
    if (nowMs == null) return fallback;
    const startedAtMs = base.periodStartedAt ? Date.parse(base.periodStartedAt) : NaN;
    const raw = computePeriodClockMs({
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
    return isPeriodActive ? Math.min(raw, periodMs) : raw;
  }, [nowMs, base, pause, clockMultiplier, isPeriodActive, periodMs]);
  const elapsedSecond = Math.floor(elapsedMs / 1000);

  // ── The game now: every kid's time so far, open stints credited ──
  const state: BasketballGameState = useMemo(
    () => (isPeriodActive ? replayBasketballGame(events, { nowMs: elapsedSecond * 1000 }) : base),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, isPeriodActive, elapsedSecond, base],
  );
  const absNowMs = state.completedPeriodMs + (isPeriodActive ? elapsedMs : 0);
  const injuredSet = useMemo(() => new Set(state.injuredIds), [state.injuredIds]);
  const loanedSet = useMemo(() => new Set(state.loanedIds), [state.loanedIds]);
  const fouledOutSet = useMemo(() => new Set(state.fouledOutIds), [state.fouledOutIds]);
  const totalMsByPlayer = useMemo(
    () => Object.fromEntries(squad.map((p) => [p.id, basketballGameMs(state, p.id)])),
    [squad, state],
  );
  const sitOutMsLeft = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [pid, until] of Object.entries(state.sittingOut)) {
      const left = until - absNowMs;
      if (left > 0) out[pid] = left;
    }
    return out;
  }, [state.sittingOut, absNowMs]);
  const foulsByPlayer = trackFouls ? state.fouls : undefined;

  // ── The break: the plan for the next period ─────────────────
  // Suggested once per break and kept in session storage, so an edit
  // survives a trip to the team page; Start commits it.
  const draftKey = `basketball-break:${game.id}:${base.currentPeriod}`;
  const breakPlan = useMemo(
    () =>
      isAtBreak
        ? suggestBasketballBreakPlan({
            state: base,
            onCourtSize: game.on_field_size,
            strategy,
            shapeId: shapeIdOf(lastSetLineup(events)),
            prefs,
            season,
          })
        : null,
    [isAtBreak, base, game.on_field_size, strategy, events, prefs, season],
  );
  const [storedDraft, setBreakDraftState] = useState<BasketballLineup | null>(null);
  useEffect(() => {
    if (!isAtBreak) {
      setBreakDraftState(null);
      return;
    }
    setBreakDraftState(readBreakDraft(draftKey) ?? breakPlan?.lineup ?? null);
  }, [isAtBreak, draftKey, breakPlan]);
  const setBreakDraft = useCallback(
    (next: BasketballLineup) => {
      setBreakDraftState(next);
      writeBreakDraft(draftKey, next);
    },
    [draftKey],
  );
  // The plan, with anyone who has arrived since it was made on its bench.
  const breakDraft = useMemo(
    () => (storedDraft && state.lineup ? withEveryoneInBasketballLineup(storedDraft, state.lineup) : storedDraft),
    [storedDraft, state.lineup],
  );

  // What the screen shows: the break's plan, else the lineup in play.
  const lineup: BasketballLineup | null = isAtBreak ? breakDraft : state.lineup;
  const shape = useMemo(
    () => basketballShapeFor(strategy, game.on_field_size, shapeIdOf(isAtBreak ? breakDraft : lastSetLineup(events))),
    [strategy, game.on_field_size, isAtBreak, breakDraft, events],
  );
  const lineCaps = useMemo(() => {
    const caps = { ...shape.lines };
    if (lineup) for (const l of BASKETBALL_LINES) caps[l] = Math.max(caps[l], lineup.lines[l].length);
    return caps;
  }, [shape, lineup]);
  const positionLabels = useMemo(() => {
    if (!lineup?.slots) return undefined;
    return Object.fromEntries(Object.entries(lineup.slots).map(([pid, pos]) => [pid, POSITION_LABEL[pos] ?? pos]));
  }, [lineup]);

  // ── Subs ────────────────────────────────────────────────────
  const anchorMs = useMemo(
    () => (isPeriodActive ? resolveSubAnchorElapsed(events, base.currentPeriod) : null),
    [events, base.currentPeriod, isPeriodActive],
  );
  const subDue = basketballSubDue({
    subIntervalMs: subIntervalSeconds != null ? subIntervalSeconds * 1000 : null,
    periodMs,
    cutoffMs: ageGroup.subCutoffSeconds * 1000,
    anchorMs,
    elapsedMs,
  });
  const nextSubs = useMemo(
    () =>
      isPeriodActive
        ? suggestBasketballSubs({ state, nowMs: absNowMs, strategy, prefs, season, foulOutAt: trackFouls ? ageGroup.foulOutAt : 0 })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPeriodActive, state, strategy, prefs, season, trackFouls, ageGroup.foulOutAt],
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

  const endPeriodAt = useCallback(
    async (elapsed: number) => {
      setPending(true);
      await enqueueLiveAction("endBasketballPeriod", [auth, game.id, base.currentPeriod, elapsed]).flushed;
      setPending(false);
      router.refresh();
    },
    [auth, game.id, base.currentPeriod, router],
  );

  function sub(offId: string | null, onId: string, line?: BasketballLine) {
    return run("recordBasketballSwap", [
      auth,
      game.id,
      { off_player_id: offId, on_player_id: onId, ...(line ? { line } : {}), ...at() },
    ]);
  }
  function move(a: string, b: string | null, zoneB: BasketballLine) {
    const zoneA = state.lineup ? basketballLineOf(state.lineup, a) : null;
    if (!zoneA) return Promise.resolve();
    return run("recordBasketballMove", [
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
        enqueueLiveAction("recordBasketballSwap", [
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
  function lineOf(pid: string): BasketballLine | null {
    return lineup ? basketballLineOf(lineup, pid) : null;
  }
  const canComeOn = (pid: string) => basketballCanPlay(state, pid, absNowMs);

  function handleTap(pid: string, line: BasketballLine | null) {
    setError(null);
    if (!lineup) return;
    // At a break a tap edits the plan; the period's Start commits it.
    if (isAtBreak) {
      if (pid === "") {
        if (selectedId && line) setBreakDraft(placeInBasketballLineup(lineup, selectedId, line));
        else if (line) setFillLine(line);
        setSelectedId(null);
        return;
      }
      if (!selectedId || selectedId === pid) {
        setSelectedId(selectedId === pid ? null : pid);
        return;
      }
      setBreakDraft(swapInBasketballLineup(lineup, selectedId, pid));
      setSelectedId(null);
      return;
    }
    if (!isPeriodActive) return;

    if (pid === "") {
      if (!line) return;
      if (selectedId) {
        const from = lineOf(selectedId);
        if (from) void move(selectedId, null, line);
        else if (canComeOn(selectedId)) void sub(null, selectedId, line);
        setSelectedId(null);
      } else {
        setFillLine(line);
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
    const aLine = lineOf(selectedId);
    const bLine = lineOf(pid);
    setSelectedId(null);
    if (aLine && bLine) void move(selectedId, pid, bLine);
    else if (aLine && !bLine && canComeOn(pid)) void sub(selectedId, pid);
    else if (!aLine && bLine && canComeOn(selectedId)) void sub(pid, selectedId);
    else setSelectedId(pid); // two bench kids: the second is the selection
  }

  // ── Score ───────────────────────────────────────────────────
  const canScore = isPeriodActive || isAtBreak || isAtFinal;
  function teamScore(points: Points, scorerId: string | null) {
    if (!trackScoring) return;
    setSelectedId(null);
    void run("recordBasketballScore", [
      auth,
      game.id,
      { side: "ours", points, player_id: scorerId, quarter: base.currentPeriod, elapsed_ms: elapsedMs },
    ]);
  }
  const opponentScore = (points: Points) =>
    void run("recordBasketballScore", [
      auth,
      game.id,
      { side: "theirs", points, player_id: null, quarter: base.currentPeriod, elapsed_ms: elapsedMs },
    ]);
  const undoScore = () => void run("undoBasketballScore", [auth, game.id]);

  // ── Sideline: injuries, loans, late arrivals, holds ─────────
  const swappableBench = useMemo(
    () => (state.lineup?.bench ?? []).filter((id) => canComeOn(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.lineup, state.injuredIds, state.loanedIds, state.sittingOut, absNowMs],
  );
  const lateArrivalCandidates = useMemo(() => {
    const placed = new Set(state.lineup ? [...basketballOnCourt(state.lineup), ...state.lineup.bench] : []);
    return squad.filter((p) => !placed.has(p.id));
  }, [squad, state.lineup]);

  async function markInjured(pid: string, injured: boolean, reason?: string) {
    await run("markInjury", [auth, game.id, { player_id: pid, injured, ...at(), ...(reason ? { reason } : {}) }]);
  }
  /** A kid leaves the court (hurt, fouled out, sat out): pick who comes on. */
  function startLeaving(pid: string, reason: "injured" | "fouled_out" | "sitting_out") {
    const line = state.lineup ? basketballLineOf(state.lineup, pid) : null;
    if (isPeriodActive && line && swappableBench.length > 0) {
      setLeaving({ playerId: pid, line, reason });
      return;
    }
    void leaveNow(pid, reason);
  }
  async function leaveNow(pid: string, reason: "injured" | "fouled_out" | "sitting_out") {
    if (reason === "sitting_out") {
      await run("recordBasketballSitOut", [auth, game.id, { player_id: pid, duration_ms: SIT_OUT_MS, ...at() }]);
    } else {
      await markInjured(pid, true, reason === "fouled_out" ? "fouled_out" : undefined);
    }
  }
  async function leaveAndReplace(pid: string, replacementId: string, line: BasketballLine, reason: "injured" | "fouled_out" | "sitting_out") {
    setLeaving(null);
    await leaveNow(pid, reason);
    await sub(pid, replacementId, line);
  }
  const setLoan = (pid: string, loaned: boolean) =>
    void run("markLoan", [auth, game.id, { player_id: pid, loaned, ...at() }]);
  const setHold = (pid: string, lock: { kind: "field" } | null) =>
    void run("recordPlayerLock", [auth, game.id, { player_id: pid, lock, ...at() }]);
  const addLateArrival = (pid: string) =>
    void run("addLateArrival", [auth, game.id, { player_id: pid, ...at() }]);

  // ── Fouls ───────────────────────────────────────────────────
  async function foul(pid: string) {
    setSelectedId(null);
    const count = (state.fouls[pid] ?? 0) + 1;
    await run("recordBasketballFoul", [auth, game.id, { player_id: pid, kind: "personal", ...at() }]);
    // The limit: out for the game. The coach picks who comes on.
    if (count >= ageGroup.foulOutAt && !fouledOutSet.has(pid)) startLeaving(pid, "fouled_out");
  }
  const undoFoul = (pid: string) =>
    void run("recordBasketballFoul", [auth, game.id, { player_id: pid, undo: true, ...at() }]);

  // ── The next period's Start ─────────────────────────────────
  async function handleStartNextPeriod() {
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
      const startMs = state.completedPeriodMs;
      const out = new Set([...basketballOnCourt(plan), ...plan.bench].filter((p) => !basketballCanPlay(state, p, startMs)));
      await enqueueLiveAction("recordBasketballLineupSet", [auth, game.id, benchOutInBasketballLineup(plan, out), undefined])
        .flushed;
    }
    await enqueueLiveAction("startBasketballPeriod", [auth, game.id, base.currentPeriod + 1]).flushed;
    writeBreakDraft(draftKey, null);
    setPending(false);
    router.refresh();
  }

  // ── Tile decorations ────────────────────────────────────────
  const lockModes = useMemo(() => {
    const out: Record<string, "field" | "zone"> = {};
    for (const [pid, lock] of Object.entries(state.locks)) {
      if (lock.kind === "field") out[pid] = "field";
      else if (lock.kind === "zone") out[pid] = "zone";
    }
    return out;
  }, [state.locks]);
  const swapOffs = new Map<string, number>();
  const swapOns = new Map<string, { pair: number; line: BasketballLine; positionLabel?: string | null }>();
  if (!selectedId && isPeriodActive) {
    nextSubs.forEach((s, i) => {
      swapOffs.set(s.off_player_id, i + 1);
      const pos = state.lineup?.slots?.[s.off_player_id];
      swapOns.set(s.on_player_id, { pair: i + 1, line: s.line, positionLabel: pos ? POSITION_LABEL[pos] : null });
    });
  }
  // At a break, each kid's tile says where they're heading.
  const captions = useMemo(() => {
    if (!isAtBreak || !breakDraft || !state.lineup) return undefined;
    const out: Record<string, BasketballTileCaption> = {};
    const word = (lu: BasketballLineup, pid: string) => {
      const pos = lu.slots?.[pid];
      if (pos) return POSITION_LABEL[pos];
      const line = basketballLineOf(lu, pid);
      return line ? BASKETBALL_LINE_SHORT[line] || "On" : "Bench";
    };
    for (const pid of basketballOnCourt(breakDraft)) {
      const was = basketballLineOf(state.lineup, pid) ? word(state.lineup, pid) : "Bench";
      const to = word(breakDraft, pid);
      out[pid] = was === to ? { text: "Stays", tone: "stay" } : { text: `${was} → ${to}`, tone: "move" };
    }
    return out;
  }, [isAtBreak, breakDraft, state.lineup]);

  const selectedPlayer = selectedId ? playerById.get(selectedId) ?? null : null;
  const selectedOnCourt = selectedId !== null && lineOf(selectedId) !== null;
  const remainingMs = Math.max(0, periodMs - elapsedMs);
  const clockReadout = `${Math.floor(remainingMs / 60_000)}:${Math.floor((remainingMs % 60_000) / 1000)
    .toString()
    .padStart(2, "0")}`;
  const atHooter = isPeriodActive && elapsedMs >= periodMs;
  const breakName =
    base.currentPeriod >= ageGroup.periodCount
      ? "Full time"
      : ageGroup.periodCount === 4 && base.currentPeriod === 2
        ? "Half time"
        : ageGroup.periodCount === 4
          ? `${base.currentPeriod === 1 ? "Quarter" : "Three-quarter"} time`
          : "Half time";
  const playerDockVisible = isPeriodActive && selectedPlayer !== null;
  const scoreDockVisible = playerDockVisible && selectedOnCourt && (trackScoring || trackFouls);
  const hasStickyBottom = !isPreTipoff;
  const stickyPb = playerDockVisible
    ? "pb-[calc(13rem+env(safe-area-inset-bottom))]"
    : hasStickyBottom
      ? "pb-[calc(7rem+env(safe-area-inset-bottom))]"
      : "";

  const actionPlayer = actionPlayerId ? playerById.get(actionPlayerId) ?? null : null;
  const actionLine = actionPlayerId && state.lineup ? basketballLineOf(state.lineup, actionPlayerId) : null;
  const actionHeld = actionPlayerId ? lockModes[actionPlayerId] ?? null : null;
  const lentPlayers = squad.filter((p) => loanedSet.has(p.id) && !injuredSet.has(p.id));
  const scoreChips: Points[] = threePointers ? [1, 2, 3] : [1, 2];
  const otherLine: Record<BasketballLine, BasketballLine | null> = { guard: "forward", forward: "guard", court: null };

  return (
    <div ref={liveRootRef} className={`space-y-3 ${stickyPb}`.trim()}>
      <LiveTopBar
        exitHref={exitHref}
        game={game}
        isLive={base.currentPeriod > 0}
        banner={subDueShowing ? <SubDueBanner onAcknowledge={() => setSubAckKey(subDueKey)} /> : null}
      />

      {error && <InlineAlert kind="danger">{error}</InlineAlert>}

      {isPreTipoff && state.lineup && (
        <section className="rounded-xl border border-brand-500/40 bg-brand-50 p-4 shadow-card">
          <p className="mb-3 text-sm font-medium text-ink">The lineup is set. Start the first {periodWord} at the tip-off.</p>
          <SFButton onClick={() => setStartConfirmOpen(true)} disabled={pending} variant="accent" size="lg" full>
            Start {periodLetter}1
          </SFButton>
        </section>
      )}

      {isPeriodActive && nextSubs.length > 0 && (
        <NextSubCard
          pairs={nextSubs.map((s) => {
            const pos = state.lineup?.slots?.[s.off_player_id];
            return {
              offId: s.off_player_id,
              onId: s.on_player_id,
              label: pos ? POSITION_LABEL[pos] : BASKETBALL_LINE_SHORT[s.line] || "ON",
              labelClass: CARD_LABEL_CLASS[s.line],
            };
          })}
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
          pairTestIdPrefix="basketball-swap-pair"
        />
      )}
      {isPeriodActive && nextSubs.length > 0 && subDue.due && (
        <p className="-mt-1 px-1 text-[11px] text-ink-dim">
          Send them to the table now, and tap them on when the whistle goes.
        </p>
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
            {periodLetter}
            {base.currentPeriod} done.
            {trackScoring && (
              <>
                {" "}
                Score: <strong>{state.teamScore.points}</strong> – <strong>{state.opponentScore.points}</strong>.
              </>
            )}
          </p>
          <p className="mb-3 text-xs text-ink-dim">
            Here&apos;s the plan for the next {periodWord}: who starts{usesBasketballLines(strategy) ? " and where" : ""}. Tap two
            players to swap them.
          </p>
          <SFButton onClick={() => setStartConfirmOpen(true)} disabled={pending || !breakDraft} variant="accent" size="lg" full>
            Start {periodLetter}
            {base.currentPeriod + 1}
          </SFButton>
        </section>
      )}

      {!isFinished && lineup && (
        <>
          <BasketballCourt
            lineup={lineup}
            lineCaps={lineCaps}
            playersById={playerById}
            onTap={handleTap}
            onLongPress={isPeriodActive ? setActionPlayerId : undefined}
            selectedPlayerId={selectedId}
            dimUnselected={isPeriodActive}
            swapOffs={swapOffs}
            totalPairs={nextSubs.length}
            swapDue={subDue.due}
            totalMsByPlayer={totalMsByPlayer}
            lineMsByPlayer={state.ms}
            injuredIds={state.injuredIds}
            fouledOutIds={state.fouledOutIds}
            foulsByPlayer={foulsByPlayer}
            foulOutAt={ageGroup.foulOutAt}
            lockModes={lockModes}
            pointsByPlayer={trackScoring ? state.playerPoints : undefined}
            captions={captions}
            positionLabels={positionLabels}
          />
          <BasketballBench
            bench={lineup.bench}
            playersById={playerById}
            onTap={(pid) => handleTap(pid, null)}
            onLongPress={isPeriodActive || isAtBreak ? setActionPlayerId : undefined}
            selectedPlayerId={selectedId}
            dimUnselected={isPeriodActive}
            swapOns={swapOns}
            totalPairs={nextSubs.length}
            totalMsByPlayer={totalMsByPlayer}
            lineMsByPlayer={state.ms}
            injuredIds={state.injuredIds}
            loanedIds={state.loanedIds}
            fouledOutIds={state.fouledOutIds}
            sitOutMsLeft={sitOutMsLeft}
            foulsByPlayer={foulsByPlayer}
            foulOutAt={ageGroup.foulOutAt}
            lockModes={lockModes}
            pointsByPlayer={trackScoring ? state.playerPoints : undefined}
          />
        </>
      )}

      {selectedPlayer && !selectedOnCourt && isPeriodActive && (
        <p className="rounded-md bg-brand-50 px-3 py-2 text-xs text-brand-800">
          Selected from bench: <strong>{selectedPlayer.full_name}</strong> — tap a player on court to swap them on.{" "}
          <button type="button" onClick={() => setSelectedId(null)} className="text-brand-700 underline">
            Cancel
          </button>
        </p>
      )}

      {isAtFinal && (
        <BasketballFullTimeReview
          auth={auth}
          gameId={game.id}
          state={state}
          periodCount={ageGroup.periodCount}
          periodLetter={periodLetter}
          trackScoring={trackScoring}
          threePointers={threePointers}
          finalisedElapsedMs={base.periodElapsedMs}
          teamName={teamName}
          opponentName={opponentName}
          onTeamScore={(n) => setScorerPoints(n)}
          onOpponentScore={opponentScore}
          onUndo={undoScore}
          scorePending={pending}
        />
      )}

      {base.finalised && (
        <BasketballGameSummaryCard
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
                {trackScoring ? "Points or a foul for " : "A foul for "}
                <span className="text-brand-700">{selectedPlayer.full_name}</span>
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
                {trackScoring && (
                  <div className="flex gap-2">
                    {scoreChips.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => teamScore(n, selectedPlayer.id)}
                        disabled={pending}
                        className="flex-1 rounded-sm bg-brand-600 py-3 font-mono text-base font-bold uppercase tracking-micro text-white shadow-card transition-colors duration-fast ease-out-quart hover:bg-brand-500 disabled:opacity-60"
                      >
                        +{n}
                      </button>
                    ))}
                  </div>
                )}
                {trackFouls && (
                  <button
                    type="button"
                    data-testid="basketball-foul"
                    onClick={() => void foul(selectedPlayer.id)}
                    disabled={pending}
                    className="w-full rounded-sm border border-due/50 bg-due-tint py-2.5 font-mono text-sm font-bold uppercase tracking-micro text-due transition-colors duration-fast ease-out-quart hover:bg-due/10 disabled:opacity-60"
                  >
                    + Foul ({state.fouls[selectedPlayer.id] ?? 0} of {ageGroup.foulOutAt})
                  </button>
                )}
                <p className="text-center text-[11px] text-ink-mute">
                  Or tap a bench player to swap <strong>{selectedPlayer.full_name}</strong> off.
                </p>
              </div>
            ) : (
              <p className="text-xs text-ink-dim">
                {selectedOnCourt ? "Tap a bench player to swap them off." : "Tap a player on court to swap them on."}
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
            <BasketballScoreBug
              teamName={teamName}
              opponentName={opponentName}
              teamPoints={state.teamScore.points}
              opponentPoints={state.opponentScore.points}
              periodLetter={periodLetter}
              currentPeriod={base.currentPeriod}
              periodCount={ageGroup.periodCount}
              clockReadout={clockReadout}
              running={running}
              isPreGame={isPreTipoff}
              isFinished={base.finalised}
              atHooter={atHooter}
              breakName={breakName}
              trackScoring={trackScoring}
              threePointers={threePointers}
              pending={pending}
              onTeamScore={canScore ? (n) => setScorerPoints(n) : undefined}
              onOpponentScore={canScore ? opponentScore : undefined}
              onClockTap={isPeriodActive ? () => (atHooter ? setEndConfirmOpen(true) : setClockMenuOpen(true)) : undefined}
              clockPulseKey={base.periodEnded ? `end-${base.currentPeriod}` : null}
            />
          }
          undoStrip={
            (state.teamScore.points > 0 || state.opponentScore.points > 0) && !base.finalised ? (
              <UndoStrip flashing={false} message="" onUndo={undoScore} disabled={pending} />
            ) : undefined
          }
        />
      )}

      {startConfirmOpen && (
        <StartQuarterModal
          quarter={base.currentPeriod + 1}
          periodLabel={periodWord}
          cue={isPreTipoff ? "ball goes up" : "whistle goes"}
          loading={pending}
          onStart={() => {
            if (isPreTipoff) {
              setStartConfirmOpen(false);
              void run("startBasketballPeriod", [auth, game.id, 1]);
            } else {
              void handleStartNextPeriod();
            }
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
            // Ending credits the whole period, as every sport does: the
            // real game ran on while the phone's clock waited or stopped.
            void endPeriodAt(periodMs);
          }}
          onCancel={() => setEndConfirmOpen(false)}
          playersLabel="on-court"
          periodLabel={periodWord}
        />
      )}

      {scorerPoints !== null && (
        <SlotFillSheet
          slotLabel={scorerPoints === 1 ? "free throw" : scorerPoints === 2 ? "basket" : "three"}
          titleVerb="Who scored the"
          candidates={(state.lineup ? basketballOnCourt(state.lineup) : [])
            .map((id) => playerById.get(id))
            .filter((p): p is Player => Boolean(p))
            .map((p) => ({ id: p.id, name: p.full_name, jerseyNumber: p.jersey_number }))}
          emptyMessage="Nobody is on court."
          extraOption={{
            label: "Not sure who",
            subLabel: "Counts the points without a scorer",
            onSelect: () => {
              const n = scorerPoints;
              setScorerPoints(null);
              teamScore(n, null);
            },
          }}
          onPick={(pid) => {
            const n = scorerPoints;
            setScorerPoints(null);
            teamScore(n, pid);
          }}
          onCancel={() => setScorerPoints(null)}
        />
      )}

      {actionPlayer && (
        <LockModal
          player={actionPlayer}
          currentLock={actionHeld}
          currentZone={null}
          isInjured={injuredSet.has(actionPlayer.id)}
          isLoaned={loanedSet.has(actionPlayer.id)}
          seasonLoanMins={0}
          squadLoanMins={0}
          outForGameNote={
            fouledOutSet.has(actionPlayer.id)
              ? `Fouled out — ${ageGroup.foulOutAt} fouls. Out for the rest of the game, and skipped by the sub rotation.`
              : undefined
          }
          onLockField={
            isPeriodActive && actionLine
              ? () => {
                  setActionPlayerId(null);
                  setHold(actionPlayer.id, { kind: "field" });
                }
              : undefined
          }
          onUnlock={() => {
            const pid = actionPlayer.id;
            setActionPlayerId(null);
            if (actionHeld) setHold(pid, null);
          }}
          onToggleInjury={() => {
            const pid = actionPlayer.id;
            setActionPlayerId(null);
            if (injuredSet.has(pid)) void markInjured(pid, false);
            else startLeaving(pid, "injured");
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
          moveToLabel={actionLine && otherLine[actionLine] ? BASKETBALL_LINE_LABEL[otherLine[actionLine]!] : undefined}
          onMovePosition={
            isPeriodActive && actionLine && otherLine[actionLine]
              ? () => {
                  const pid = actionPlayer.id;
                  setActionPlayerId(null);
                  void move(pid, null, otherLine[actionLine]!);
                }
              : undefined
          }
          extraActions={
            isPeriodActive && !injuredSet.has(actionPlayer.id) && !loanedSet.has(actionPlayer.id)
              ? [
                  ...(sitOutMsLeft[actionPlayer.id]
                    ? [
                        {
                          label: "End the sit-out",
                          hint: "They can come back on now",
                          testId: "basketball-end-sit-out",
                          onClick: () => {
                            const pid = actionPlayer.id;
                            setActionPlayerId(null);
                            void run("recordBasketballSitOut", [auth, game.id, { player_id: pid, duration_ms: 0, ...at() }]);
                          },
                        },
                      ]
                    : [
                        {
                          label: "Sit out 5 min",
                          hint: "A technical or unsportsmanlike foul: off for 5 minutes of playing time",
                          testId: "basketball-sit-out",
                          onClick: () => {
                            const pid = actionPlayer.id;
                            setActionPlayerId(null);
                            if (actionLine) startLeaving(pid, "sitting_out");
                            else void leaveNow(pid, "sitting_out");
                          },
                        },
                      ]),
                  ...(trackFouls && (state.fouls[actionPlayer.id] ?? 0) > 0
                    ? [
                        {
                          label: "Take back a foul",
                          hint: `${state.fouls[actionPlayer.id]} so far`,
                          testId: "basketball-undo-foul",
                          onClick: () => {
                            const pid = actionPlayer.id;
                            setActionPlayerId(null);
                            undoFoul(pid);
                          },
                        },
                      ]
                    : []),
                  {
                    label: "Fouled out",
                    hint: "Out for the rest of the game",
                    testId: "basketball-foul-out",
                    onClick: () => {
                      const pid = actionPlayer.id;
                      setActionPlayerId(null);
                      startLeaving(pid, "fouled_out");
                    },
                  },
                ]
              : undefined
          }
          onClose={() => setActionPlayerId(null)}
        />
      )}

      {fillLine && lineup && (
        <SlotFillSheet
          slotLabel={fillLine === "court" ? "spot" : `${BASKETBALL_LINE_LABEL[fillLine].toLowerCase().replace(/s$/, "")} spot`}
          candidates={lineup.bench
            .filter((id) => (isAtBreak ? !injuredSet.has(id) && !loanedSet.has(id) : canComeOn(id)))
            .map((id) => playerById.get(id))
            .filter((p): p is Player => Boolean(p))
            .map((p) => ({ id: p.id, name: p.full_name, jerseyNumber: p.jersey_number }))}
          emptyMessage="Nobody on the bench can come on."
          onPick={(pid) => {
            const line = fillLine;
            setFillLine(null);
            if (isAtBreak) setBreakDraft(placeInBasketballLineup(lineup, pid, line));
            else void sub(null, pid, line);
          }}
          onCancel={() => setFillLine(null)}
        />
      )}

      {leaving &&
        (() => {
          const who = playerById.get(leaving.playerId);
          if (!who) return null;
          const candidates: InjuryReplacementCandidate[] = swappableBench
            .map((id) => playerById.get(id))
            .filter((p): p is Player => Boolean(p))
            .map((p) => ({ player: p, totalMs: totalMsByPlayer[p.id] ?? 0 }))
            .sort((a, b) => a.totalMs - b.totalMs);
          const pos = state.lineup?.slots?.[leaving.playerId];
          return (
            <InjuryReplacementModal
              injuredPlayer={who}
              reason={leaving.reason}
              spotLabel={pos ? POSITION_LABEL[pos] : leaving.line === "court" ? "their spot" : BASKETBALL_LINE_LABEL[leaving.line].replace(/s$/, "")}
              candidates={candidates}
              onPickReplacement={(rid) => void leaveAndReplace(leaving.playerId, rid, leaving.line, leaving.reason)}
              onSkipReplacement={() => {
                const { playerId, reason } = leaving;
                setLeaving(null);
                void leaveNow(playerId, reason);
              }}
              onCancel={() => setLeaving(null)}
            />
          );
        })()}

      <LongPressHint enabled={isPeriodActive && !selectedId} />
    </div>
  );
}
