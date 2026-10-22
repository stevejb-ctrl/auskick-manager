"use client";

// ─── TouchLiveGame ───────────────────────────────────────────
// The touch and Oztag live game. Mirrors basketball's BasketballLiveGame
// and AFL's LiveGame end to end, so a coach who runs both sports finds
// the same shell: the shared LiveTopBar (sub due as a banner under it),
// the next-sub card, the field and bench, the shared player dock and
// LockModal long-press actions, the sticky scorebug with undo, the clock
// menu, the break, and the full-time review and share card. What's the
// touch family's own (.planning/FOUR-SPORTS-PLAN.md):
//
//   - Lanes are optional: the team's How we play strategy plays no
//     positions (one field) or middles, links and wings.
//   - Rolling subs through the interchange, unlimited. No interchange
//     after a turnover until the next touch, so the sub-due banner says
//     to make the change next time you have the ball.
//   - A mixed team's rule: suggestions keep the boys' cap (a boy comes on
//     for a boy, a girl for a girl), a manual swap that breaks it warns,
//     and short of girls the field shrinks ("You can field 4: 3 boys and
//     1 girl"), recorded as roster_shrink.
//   - Tries are 1; on an Oztag mixed team a girl's try is 2, and the
//     opponent's chips are +1 and +2 (girl).
//
// Every write goes through the shared write queue (registerLiveActions)
// in the one game lane, so the event log keeps the coach's order. Who
// counts as a girl or a boy is never drawn on a tile.

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SFButton } from "@/components/sf";
import { LiveTopBar } from "@/components/live/LiveTopBar";
import { LiveAdminUtilityRow } from "@/components/live/LiveAdminUtilityRow";
import { LiveStickyScoreBar } from "@/components/live/LiveStickyScoreBar";
import { QuarterKickoffBar } from "@/components/quarter-break/QuarterKickoffBar";
import { BreakScoreRow } from "@/components/quarter-break/BreakScoreRow";
import { ManualEndQuarterConfirm } from "@/components/live/ManualEndQuarterConfirm";
import { ClockMenu } from "@/components/live/ClockMenu";
import { StartQuarterModal } from "@/components/live/StartQuarterModal";
import { SubDueBanner } from "@/components/live/SubDueBanner";
import { ScoreRecordingDock } from "@/components/live/ScoreRecordingDock";
import { LongPressHint } from "@/components/live/LongPressHint";
import { LockModal } from "@/components/live/LockModal";
import { UndoStrip } from "@/components/live/UndoStrip";
import { NextSubCard } from "@/components/live/NextSubCard";
import type { LineTileCaption } from "@/components/live/LinePlayerTile";
import { InjuryReplacementModal, type InjuryReplacementCandidate } from "@/components/live/InjuryReplacementModal";
import { SlotFillSheet } from "@/components/ui/SlotFillSheet";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { enqueueLiveAction, type LiveActionArgs, type LiveActionKind } from "@/lib/live/registerLiveActions";
import { playSubDueBeep, useSubDueAudioUnlock } from "@/lib/live/subDueBeep";
import { hapticTap } from "@/lib/haptics";
import { computePeriodClockMs, togglePeriodPause } from "@/lib/live/periodClock";
import { usePeriodPause } from "@/lib/live/periodPauseStorage";
import { resolveSubAnchorElapsed } from "@/lib/live/subAnchor";
import { presentPlayerIds } from "@/lib/live/presentPlayers";
import { countTags, keepsComposition, rollingSubDue } from "@/lib/live/rollingSubs";
import type { Game, GameEvent, LiveAuth, MixedGroup, Player } from "@/lib/types";
import { normalizeTouchLineup, touchLineOf, touchOnField, type TouchLineup } from "@/lib/sports/touch/lineup";
import { replayTouchGame, touchCanPlay, touchGameMs, type TouchGameState } from "@/lib/sports/touch/replay";
import {
  suggestTouchBreakPlan,
  suggestTouchSubs,
  touchFieldPlan,
  touchShapeFor,
  touchShapeIdOf,
  usesTouchLanes,
  type TouchMixed,
  type TouchPrefs,
  type TouchSeasonBalance,
} from "@/lib/sports/touch/suggest";
import {
  benchOutInTouchLineup,
  placeInTouchLineup,
  swapInTouchLineup,
  withEveryoneInTouchLineup,
} from "@/lib/sports/touch/live";
import { mixedConstraints, mixedFieldMessage, mixedTags } from "@/lib/sports/touch/mixed";
import { TOUCH_LANES, TOUCH_LINES, type MixedRule, type TouchAgeGroupConfig, type TouchLine, type TouchStrategy } from "@/lib/sports/touch/types";
import { TouchField } from "./TouchField";
import { TouchBench } from "./TouchBench";
import { TouchScoreBug } from "./TouchScoreBug";
import { TouchFullTimeReview, TouchGameSummaryCard } from "./TouchFullTime";
import {
  TOUCH_CARD_LABEL_CLASS,
  TOUCH_LINE_LABEL,
  TOUCH_LINE_ONE,
  TOUCH_LINE_SHORT,
  TOUCH_SUB_DUE_HINT,
} from "./touchWords";

interface TouchLiveGameProps {
  auth: LiveAuth;
  game: Game;
  teamName: string;
  /** Every kid who could play: the squad and today's fill-ins. */
  squad: Player[];
  /** The age group as the team plays it (halves or one period). */
  ageGroup: TouchAgeGroupConfig;
  /** A period's length in seconds (game, team or age group). */
  periodSeconds: number;
  /** Seconds between subs. */
  subIntervalSeconds: number | null;
  /** Game seconds per real second: 1 for a real game, 8 for the demo. */
  clockMultiplier?: number;
  trackScoring: boolean;
  /** A girl's try counts 2 (Oztag mixed, unless the team turned it off). */
  girlsTryDouble: boolean;
  /** A mixed team's rule; null when it isn't a mixed team. */
  mixedRule?: MixedRule | null;
  /** Who each kid (and fill-in) counts as under the rule. */
  mixedGroups?: Record<string, MixedGroup | null>;
  events: GameEvent[];
  /** How we play: the rotation, roles and season balance. */
  strategy: TouchStrategy;
  prefs?: TouchPrefs;
  season?: TouchSeasonBalance;
  isAdmin: boolean;
  exitHref: string;
}

/** The latest whole lineup set (the start, a break, a reshuffle). */
function lastSetLineup(events: GameEvent[]): TouchLineup | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.type === "lineup_set") {
      const raw = (ev.metadata as { lineup?: unknown } | null)?.lineup;
      if (raw) return normalizeTouchLineup(raw);
    }
  }
  return null;
}

function readBreakDraft(key: string): TouchLineup | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? normalizeTouchLineup(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
function writeBreakDraft(key: string, lineup: TouchLineup | null) {
  try {
    if (lineup) window.sessionStorage.setItem(key, JSON.stringify(lineup));
    else window.sessionStorage.removeItem(key);
  } catch {
    // Private mode or storage blocked: the plan just won't survive a reload.
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function TouchLiveGame({
  auth,
  game,
  teamName,
  squad,
  ageGroup,
  periodSeconds,
  subIntervalSeconds,
  clockMultiplier = 1,
  trackScoring,
  girlsTryDouble,
  mixedRule = null,
  mixedGroups,
  events,
  strategy,
  prefs,
  season,
  isAdmin,
  exitHref,
}: TouchLiveGameProps) {
  const router = useRouter();
  const opponentName = game.opponent || "Opponent";
  const playerById = useMemo(() => new Map(squad.map((p) => [p.id, p])), [squad]);
  const mixed: TouchMixed | undefined = useMemo(
    () => (mixedRule ? { rule: mixedRule, groupOf: (id: string) => mixedGroups?.[id] ?? null } : undefined),
    [mixedRule, mixedGroups],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [clockMenuOpen, setClockMenuOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const [pickingScorer, setPickingScorer] = useState(false);
  const [showBreakScore, setShowBreakScore] = useState(false);
  const [actionPlayerId, setActionPlayerId] = useState<string | null>(null);
  const [fillLine, setFillLine] = useState<TouchLine | null>(null);
  const [leaving, setLeaving] = useState<{ playerId: string; line: TouchLine } | null>(null);
  const [subAckKey, setSubAckKey] = useState<string | null>(null);
  const liveRootRef = useRef<HTMLDivElement>(null);
  const periodMs = periodSeconds * 1000;
  const onePeriod = ageGroup.periodCount === 1;
  const periodLetter = onePeriod ? "P" : "H";
  const periodWord = onePeriod ? "period" : "half";
  const periodLabel: "half" | "period" = onePeriod ? "period" : "half";

  // ── The game so far (without the open stints), for the clock ──
  const base = useMemo(() => replayTouchGame(events), [events]);
  const isPeriodActive = base.currentPeriod >= 1 && !base.periodEnded && !base.finalised;
  const isAtBreak = base.periodEnded && base.currentPeriod >= 1 && base.currentPeriod < ageGroup.periodCount && !base.finalised;
  const isAtFinal = base.periodEnded && base.currentPeriod >= ageGroup.periodCount && !base.finalised;
  const isFinished = base.finalised || isAtFinal;
  const isPreStart = base.currentPeriod === 0 && !base.finalised;

  // ── Clock: the shared period clock, its pause saved on the phone ──
  // Game ms since the period started, less real time paused, scaled by
  // the clock multiplier, held at the period's length: the phone waits
  // there for the referee's whistle.
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
  const state: TouchGameState = useMemo(
    () => (isPeriodActive ? replayTouchGame(events, { nowMs: elapsedSecond * 1000 }) : base),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, isPeriodActive, elapsedSecond, base],
  );
  const absNowMs = state.completedPeriodMs + (isPeriodActive ? elapsedMs : 0);
  const injuredSet = useMemo(() => new Set(state.injuredIds), [state.injuredIds]);
  const loanedSet = useMemo(() => new Set(state.loanedIds), [state.loanedIds]);
  const totalMsByPlayer = useMemo(
    () => Object.fromEntries(squad.map((p) => [p.id, touchGameMs(state, p.id)])),
    [squad, state],
  );

  // ── The mixed rule ───────────────────────────────────────────
  const tags = useMemo(() => (mixed ? mixedTags(mixed.groupOf) : () => [] as readonly string[]), [mixed]);
  const constraints = useMemo(() => (mixed ? mixedConstraints(mixed.rule) : []), [mixed]);
  // The field's size now: the game's, or what the rule allows.
  const fieldSize = state.fieldSize ?? game.on_field_size;
  // Who can play now, and the field the rule lets them make.
  const canPlayIds = useMemo(
    () => (state.lineup ? [...touchOnField(state.lineup), ...state.lineup.bench].filter((p) => touchCanPlay(state, p)) : []),
    [state],
  );
  const fieldPlan = useMemo(() => touchFieldPlan(game.on_field_size, canPlayIds, mixed), [game.on_field_size, canPlayIds, mixed]);
  // Record the field's size when the rule changes it (a girl hurt, lent
  // or back): once per change, from whichever phone sees it first.
  const sizeWriteRef = useRef<string | null>(null);
  useEffect(() => {
    if (!fieldPlan || base.finalised || isPreStart) return;
    const legal = fieldPlan.size;
    if (legal === fieldSize || legal < 1) return;
    const key = `${base.currentPeriod}:${fieldSize}->${legal}`;
    if (sizeWriteRef.current === key) return;
    sizeWriteRef.current = key;
    void enqueueLiveAction("recordTouchFieldSize", [
      auth,
      game.id,
      { on_field_size: legal, quarter: base.currentPeriod, elapsed_ms: isPeriodActive ? elapsedMs : base.periodElapsedMs },
    ]).flushed.then(() => startTransition(() => router.refresh()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldPlan?.size, fieldSize, base.finalised, isPreStart, base.currentPeriod]);

  // ── The break: the plan for the next half ───────────────────
  // Suggested once per break and kept in session storage, so an edit
  // survives a trip to the team page; Start commits it.
  const draftKey = `touch-break:${game.id}:${base.currentPeriod}`;
  const breakPlan = useMemo(
    () =>
      isAtBreak
        ? suggestTouchBreakPlan({
            state: base,
            ageGroup,
            onFieldSize: game.on_field_size,
            strategy,
            shapeId: touchShapeIdOf(lastSetLineup(events)),
            prefs,
            season,
            mixed,
          })
        : null,
    [isAtBreak, base, ageGroup, game.on_field_size, strategy, events, prefs, season, mixed],
  );
  const [storedDraft, setBreakDraftState] = useState<TouchLineup | null>(null);
  useEffect(() => {
    if (!isAtBreak) {
      setBreakDraftState(null);
      return;
    }
    setBreakDraftState(readBreakDraft(draftKey) ?? breakPlan?.lineup ?? null);
  }, [isAtBreak, draftKey, breakPlan]);
  const setBreakDraft = useCallback(
    (next: TouchLineup) => {
      setBreakDraftState(next);
      writeBreakDraft(draftKey, next);
    },
    [draftKey],
  );
  // The plan, with anyone who has arrived since it was made on its bench.
  const breakDraft = useMemo(
    () => (storedDraft && state.lineup ? withEveryoneInTouchLineup(storedDraft, state.lineup) : storedDraft),
    [storedDraft, state.lineup],
  );

  // What the screen shows: the break's plan, else the lineup in play.
  const lineup: TouchLineup | null = isAtBreak ? breakDraft : state.lineup;
  const onFieldNow = lineup ? touchOnField(lineup).length : 0;
  const shape = useMemo(
    () => touchShapeFor(ageGroup, strategy, isAtBreak ? onFieldNow : fieldSize, touchShapeIdOf(isAtBreak ? breakDraft : lastSetLineup(events))),
    [ageGroup, strategy, isAtBreak, onFieldNow, fieldSize, breakDraft, events],
  );
  // Places in each lane: the shape's, and an empty place only while the
  // field is short of its size (a field the rule shrank shows none).
  const lineCaps = useMemo(() => {
    const caps = { ...shape.lines };
    if (!lineup) return caps;
    const full = !isAtBreak && touchOnField(lineup).length >= fieldSize;
    for (const l of TOUCH_LINES) caps[l] = full ? lineup.lines[l].length : Math.max(caps[l], lineup.lines[l].length);
    return caps;
  }, [shape, lineup, isAtBreak, fieldSize]);

  // ── Subs ────────────────────────────────────────────────────
  const anchorMs = useMemo(
    () => (isPeriodActive ? resolveSubAnchorElapsed(events, base.currentPeriod) : null),
    [events, base.currentPeriod, isPeriodActive],
  );
  const subDue = rollingSubDue({
    subIntervalMs: subIntervalSeconds != null ? subIntervalSeconds * 1000 : null,
    periodMs,
    anchorMs,
    elapsedMs,
  });
  const msUntilDue = subDue.msUntilDue;
  const nextSubs = useMemo(() => {
    if (!isPeriodActive) return [];
    const opts = { strategy, prefs, season, mixed };
    const now = suggestTouchSubs({ state, nowMs: absNowMs, ...opts });
    if (now.length > 0 || msUntilDue === null || msUntilDue <= 0) return now;
    // Nothing evens time yet, so show the subs due at the next sub time,
    // as basketball does: kids who just came on need time before anyone
    // on the bench is owed theirs.
    const aheadMs = Math.min(periodMs, elapsedMs + msUntilDue);
    const ahead = replayTouchGame(events, { nowMs: aheadMs });
    return suggestTouchSubs({ state: ahead, nowMs: ahead.completedPeriodMs + aheadMs, ...opts });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPeriodActive, state, events, strategy, prefs, season, mixed, periodMs, msUntilDue !== null && msUntilDue <= 0, Math.floor((msUntilDue ?? 0) / 5000)]);
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
      await enqueueLiveAction("endTouchPeriod", [auth, game.id, base.currentPeriod, elapsed]).flushed;
      setPending(false);
      router.refresh();
    },
    [auth, game.id, base.currentPeriod, router],
  );

  /** The mixed rule's warning for a swap a coach makes by hand (a warning, not a block). */
  function capWarning(offId: string | null, onId: string): string | null {
    if (!mixed || !state.lineup) return null;
    const counts = countTags(touchOnField(state.lineup), tags, constraints);
    if (keepsComposition(counts, offId, onId, tags, constraints)) return null;
    const boys = counts.boy - (offId && tags(offId).includes("boy") ? 1 : 0) + (tags(onId).includes("boy") ? 1 : 0);
    const girls = counts.girl - (offId && tags(offId).includes("girl") ? 1 : 0) + (tags(onId).includes("girl") ? 1 : 0);
    if (boys > mixed.rule.maxBoys) return `That puts ${plural(boys, "boy", "boys")} on: the mixed rule allows ${mixed.rule.maxBoys}.`;
    if (girls < mixed.rule.minGirls) return `That leaves ${plural(girls, "girl", "girls")} on: the mixed rule needs ${mixed.rule.minGirls}.`;
    return `That leaves ${plural(boys, "boy", "boys")} on: the mixed rule needs ${mixed.rule.minBoys}.`;
  }

  function sub(offId: string | null, onId: string, line?: TouchLine) {
    setWarning(capWarning(offId, onId));
    return run("recordTouchSwap", [auth, game.id, { off_player_id: offId, on_player_id: onId, ...(line ? { line } : {}), ...at() }]);
  }
  function move(a: string, b: string | null, zoneB: TouchLine) {
    const zoneA = state.lineup ? touchLineOf(state.lineup, a) : null;
    if (!zoneA) return Promise.resolve();
    return run("recordTouchMove", [auth, game.id, { player_a_id: a, zone_a: zoneA, ...(b ? { player_b_id: b } : {}), zone_b: zoneB, ...at() }]);
  }

  async function applyAllSubs() {
    if (nextSubs.length === 0) return;
    setPending(true);
    const flushed = nextSubs.map(
      (s) =>
        enqueueLiveAction("recordTouchSwap", [
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
  function lineOf(pid: string): TouchLine | null {
    return lineup ? touchLineOf(lineup, pid) : null;
  }
  const canComeOn = (pid: string) => touchCanPlay(state, pid);

  function handleTap(pid: string, line: TouchLine | null) {
    setError(null);
    if (!lineup) return;
    // At a break a tap edits the plan; the half's Start commits it.
    if (isAtBreak) {
      if (pid === "") {
        if (selectedId && line) setBreakDraft(placeInTouchLineup(lineup, selectedId, line));
        else if (line) setFillLine(line);
        setSelectedId(null);
        return;
      }
      if (!selectedId || selectedId === pid) {
        setSelectedId(selectedId === pid ? null : pid);
        return;
      }
      setBreakDraft(swapInTouchLineup(lineup, selectedId, pid));
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
  // A try shows the moment it's tapped and queues, as basketball's
  // baskets do. Each tap stays on top of the server's score until its
  // save has flushed and a refresh has landed. Whether ours is a girl's
  // try (2) is the scorer's group; the server decides it the same way.
  const canScore = isPeriodActive || isAtBreak || isAtFinal;
  const [unsavedTries, setUnsavedTries] = useState<
    { key: number; side: "ours" | "theirs"; points: 1 | 2; playerId: string | null; flushed: boolean }[]
  >([]);
  useEffect(() => {
    setUnsavedTries((list) => (list.some((b) => b.flushed) ? list.filter((b) => !b.flushed) : list));
  }, [events]);
  function recordTry(side: "ours" | "theirs", playerId: string | null, girl: boolean) {
    const key = Date.now() + Math.random();
    const isGirls =
      girlsTryDouble && (side === "theirs" || !playerId ? girl : mixed?.groupOf(playerId) === "girl");
    setUnsavedTries((list) => [...list, { key, side, points: isGirls ? 2 : 1, playerId, flushed: false }]);
    setError(null);
    enqueueLiveAction("recordTouchScore", [
      auth,
      game.id,
      { side, player_id: playerId, ...(girl ? { girl: true } : {}), quarter: base.currentPeriod, elapsed_ms: elapsedMs },
    ])
      .flushed.then(() => {
        setUnsavedTries((list) => list.map((b) => (b.key === key ? { ...b, flushed: true } : b)));
        startTransition(() => router.refresh());
      })
      .catch((e: unknown) => {
        setUnsavedTries((list) => list.filter((b) => b.key !== key));
        setError(e instanceof Error ? e.message : "That try didn't save. Try again.");
      });
  }
  function teamScore(scorerId: string | null, girl = false) {
    if (!trackScoring) return;
    setSelectedId(null);
    recordTry("ours", scorerId, girl);
  }
  const opponentScore = (girl: boolean) => recordTry("theirs", null, girl);
  const unsavedPoints = (side: "ours" | "theirs") => unsavedTries.reduce((n, b) => (b.side === side ? n + b.points : n), 0);
  const teamPoints = state.teamScore.points + unsavedPoints("ours");
  const opponentPoints = state.opponentScore.points + unsavedPoints("theirs");
  const playerTries = useMemo(() => {
    if (!unsavedTries.some((b) => b.side === "ours" && b.playerId)) return state.playerTries;
    const out = { ...state.playerTries };
    for (const b of unsavedTries) if (b.side === "ours" && b.playerId) out[b.playerId] = (out[b.playerId] ?? 0) + 1;
    return out;
  }, [state.playerTries, unsavedTries]);
  const undoScore = () => void run("undoTouchScore", [auth, game.id]);

  // ── Sideline: injuries, loans, late arrivals, holds ─────────
  const swappableBench = useMemo(
    () => (state.lineup?.bench ?? []).filter((id) => canComeOn(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.lineup, state.injuredIds, state.loanedIds],
  );
  const lateArrivalCandidates = useMemo(() => {
    const placed = new Set(state.lineup ? [...touchOnField(state.lineup), ...state.lineup.bench] : []);
    return squad.filter((p) => !placed.has(p.id));
  }, [squad, state.lineup]);
  /** Bench kids who can fill an empty place (or replace `leavingId`) and keep the mixed rule. */
  const keepsRule = useCallback(
    (onId: string, leavingId: string | null) => {
      if (!mixed || !state.lineup) return true;
      const counts = countTags(touchOnField(state.lineup), tags, constraints);
      return keepsComposition(counts, leavingId, onId, tags, constraints);
    },
    [mixed, state.lineup, tags, constraints],
  );

  async function markInjured(pid: string, injured: boolean) {
    await run("markInjury", [auth, game.id, { player_id: pid, injured, ...at() }]);
  }
  /** A kid leaves the field hurt: pick who comes on. */
  function startLeaving(pid: string) {
    const line = state.lineup ? touchLineOf(state.lineup, pid) : null;
    // Nobody who keeps the mixed rule can replace them: the field shrinks.
    if (isPeriodActive && line && swappableBench.some((id) => keepsRule(id, pid))) {
      setLeaving({ playerId: pid, line });
      return;
    }
    void markInjured(pid, true);
  }
  async function leaveAndReplace(pid: string, replacementId: string, line: TouchLine) {
    setLeaving(null);
    await markInjured(pid, true);
    await sub(pid, replacementId, line);
  }
  const setLoan = (pid: string, loaned: boolean) => void run("markLoan", [auth, game.id, { player_id: pid, loaned, ...at() }]);
  const setHold = (pid: string, lock: { kind: "field" } | null) =>
    void run("recordPlayerLock", [auth, game.id, { player_id: pid, lock, ...at() }]);
  const addLateArrival = (pid: string) => void run("addLateArrival", [auth, game.id, { player_id: pid, ...at() }]);

  // ── The next half's Start ───────────────────────────────────
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
      const out = new Set([...touchOnField(plan), ...plan.bench].filter((p) => !touchCanPlay(state, p)));
      await enqueueLiveAction("recordTouchLineupSet", [auth, game.id, benchOutInTouchLineup(plan, out), undefined]).flushed;
    }
    await enqueueLiveAction("startTouchPeriod", [auth, game.id, base.currentPeriod + 1]).flushed;
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
  const swapOns = new Map<string, { pair: number; line: TouchLine }>();
  if (!selectedId && isPeriodActive) {
    nextSubs.forEach((s, i) => {
      swapOffs.set(s.off_player_id, i + 1);
      swapOns.set(s.on_player_id, { pair: i + 1, line: s.line });
    });
  }
  // At a break, each kid's tile says where they're heading.
  const captions = useMemo(() => {
    if (!isAtBreak || !breakDraft || !state.lineup) return undefined;
    const out: Record<string, LineTileCaption> = {};
    const word = (lu: TouchLineup, pid: string) => {
      const line = touchLineOf(lu, pid);
      return line ? TOUCH_LINE_SHORT[line] || "On" : "Bench";
    };
    for (const pid of touchOnField(breakDraft)) {
      const was = touchLineOf(state.lineup, pid) ? word(state.lineup, pid) : "Bench";
      const to = word(breakDraft, pid);
      out[pid] = was === to ? { text: "Stays", tone: "stay" } : { text: `${was} → ${to}`, tone: "move" };
    }
    return out;
  }, [isAtBreak, breakDraft, state.lineup]);

  const selectedPlayer = selectedId ? (playerById.get(selectedId) ?? null) : null;
  const selectedOnField = selectedId !== null && lineOf(selectedId) !== null;
  const remainingMs = Math.max(0, periodMs - elapsedMs);
  const clockReadout = `${Math.floor(remainingMs / 60_000)}:${Math.floor((remainingMs % 60_000) / 1000)
    .toString()
    .padStart(2, "0")}`;
  const atHooter = isPeriodActive && elapsedMs >= periodMs;
  const breakName = base.currentPeriod >= ageGroup.periodCount ? "Full time" : "Half time";
  const playerDockVisible = isPeriodActive && selectedPlayer !== null;
  const scoreDockVisible = playerDockVisible && selectedOnField && trackScoring;
  // The break has the shared Start bar instead of the scorebug.
  const hasStickyBottom = !isPreStart && !isAtBreak;

  const actionPlayer = actionPlayerId ? (playerById.get(actionPlayerId) ?? null) : null;
  const actionLine = actionPlayerId && state.lineup ? touchLineOf(state.lineup, actionPlayerId) : null;
  const actionHeld = actionPlayerId ? (lockModes[actionPlayerId] ?? null) : null;
  const lentPlayers = squad.filter((p) => loanedSet.has(p.id) && !injuredSet.has(p.id));
  const lanes = usesTouchLanes(strategy);

  // The field the rule allows, when it's fewer than the game's size.
  const shortBanner =
    fieldPlan && !isFinished && (fieldPlan.short || fieldPlan.belowMinimum) ? (
      <InlineAlert kind="warn">
        <span data-testid="touch-field-size-banner">
          {fieldPlan.belowMinimum && fieldPlan.girls < (mixed?.rule.minGirls ?? 0)
            ? `The mixed rule needs at least ${plural(mixed!.rule.minGirls, "girl", "girls")} on the field. ${mixedFieldMessage(fieldPlan)}.`
            : `${mixedFieldMessage(fieldPlan)}.`}
        </span>
      </InlineAlert>
    ) : null;

  const noScorer = (girl: boolean) => () => {
    setPickingScorer(false);
    teamScore(null, girl);
  };
  const scorerOptions = girlsTryDouble
    ? [
        { label: "Not sure who", subLabel: "Counts a try (1 point) without a scorer", onSelect: noScorer(false) },
        { label: "Not sure who — a girl's try", subLabel: "Counts 2 points without a scorer", onSelect: noScorer(true) },
      ]
    : [{ label: "Not sure who", subLabel: "Counts the try without a scorer", onSelect: noScorer(false) }];

  return (
    // No bottom padding: LiveStickyScoreBar reserves its own height with
    // a measured in-flow spacer, and the player dock floats over the page.
    <div ref={liveRootRef} className={`space-y-3${isAtBreak ? " pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0" : ""}`}>
      <LiveTopBar
        exitHref={exitHref}
        game={game}
        isLive={base.currentPeriod > 0}
        banner={subDueShowing ? <SubDueBanner hint={TOUCH_SUB_DUE_HINT} onAcknowledge={() => setSubAckKey(subDueKey)} /> : null}
      />

      {error && <InlineAlert kind="danger">{error}</InlineAlert>}
      {warning && (
        <InlineAlert kind="warn">
          <span className="flex items-start justify-between gap-2">
            <span>{warning}</span>
            <button type="button" onClick={() => setWarning(null)} className="shrink-0 underline">
              OK
            </button>
          </span>
        </InlineAlert>
      )}
      {shortBanner}

      {isPreStart && state.lineup && (
        <section className="rounded-xl border border-brand-500/40 bg-brand-50 p-4 shadow-card">
          <p className="mb-3 text-sm font-medium text-ink">The lineup is set. Start the first {periodWord} at the tap.</p>
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
            label: TOUCH_LINE_SHORT[s.line] || "ON",
            labelClass: TOUCH_CARD_LABEL_CLASS[s.line],
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
          pairTestIdPrefix="touch-swap-pair"
        />
      )}
      {isPeriodActive && nextSubs.length > 0 && subDue.due && (
        <p className="-mt-1 px-1 text-[11px] text-ink-dim">Make the change next time you have the ball, through the interchange.</p>
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

      {/* The break, as AFL's, netball's and basketball's: the orientation
          strip, the Score row (the per-half breakdown, and late tries),
          the swap hint, the field and bench with where each kid is
          heading, and the shared Start bar. */}
      {isAtBreak && (
        <>
          <div className="px-1">
            <p className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-dim">{breakName}</p>
            <p className="mt-0.5 text-lg font-bold text-ink">
              Lineup for {periodLetter}
              {base.currentPeriod + 1}
            </p>
          </div>

          {trackScoring && (
            <BreakScoreRow
              open={showBreakScore}
              onToggle={() => setShowBreakScore((v) => !v)}
              teamName={teamName}
              opponentName={opponentName}
              teamPoints={teamPoints}
              opponentPoints={opponentPoints}
              scoreByPeriod={state.scoreByPeriod}
              periodCount={ageGroup.periodCount}
              currentPeriod={base.currentPeriod}
              periodLetter={periodLetter}
              periodWord={periodWord}
              teamChips={[{ key: "try", text: "+T", label: `Add a try, ${teamName}`, onClick: () => setPickingScorer(true) }]}
              opponentChips={
                girlsTryDouble
                  ? [
                      { key: "try", text: "+1", label: `Add a try, ${opponentName}`, onClick: () => opponentScore(false) },
                      { key: "girls", text: "+2 (girl)", label: `Add a girl's try, ${opponentName}`, onClick: () => opponentScore(true) },
                    ]
                  : [{ key: "try", text: "+T", label: `Add a try, ${opponentName}`, onClick: () => opponentScore(false) }]
              }
              missedNote={`A try you missed counts in ${periodLetter}${base.currentPeriod}.`}
              onUndo={undoScore}
              undoDisabled={pending}
            />
          )}

          <p className="px-1 text-xs text-ink-dim">
            Who starts the next {periodWord}
            {lanes ? " and in which lane" : ""}. Tap any two players to swap them.
          </p>
          {mixed && <p className="px-1 text-[11px] text-ink-mute">Boys and girls are evened separately under the mixed rule.</p>}
        </>
      )}

      {!isFinished && lineup && (
        <>
          <TouchField
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
            lockModes={lockModes}
            triesByPlayer={trackScoring ? playerTries : undefined}
            captions={captions}
          />
          <TouchBench
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
            lockModes={lockModes}
            triesByPlayer={trackScoring ? playerTries : undefined}
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
        <TouchFullTimeReview
          auth={auth}
          gameId={game.id}
          state={state}
          periodCount={ageGroup.periodCount}
          periodLetter={periodLetter}
          trackScoring={trackScoring}
          girlsTryDouble={girlsTryDouble}
          finalisedElapsedMs={base.periodElapsedMs}
          teamName={teamName}
          opponentName={opponentName}
          onTeamScore={() => setPickingScorer(true)}
          onOpponentScore={opponentScore}
          onUndo={undoScore}
          scorePending={pending}
        />
      )}

      {base.finalised && (
        <TouchGameSummaryCard
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
                A try for <span className="text-brand-700">{selectedPlayer.full_name}</span>
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
                  data-testid="touch-dock-try"
                  onClick={() => teamScore(selectedPlayer.id)}
                  className="w-full rounded-sm bg-brand-600 py-3 font-mono text-base font-bold uppercase tracking-micro text-white shadow-card transition-colors duration-fast ease-out-quart hover:bg-brand-500 disabled:opacity-60"
                >
                  + Try
                </button>
                <p className="text-center text-[11px] text-ink-mute">
                  Or tap a bench player to swap <strong>{selectedPlayer.full_name}</strong> off.
                </p>
              </div>
            ) : (
              <p className="text-xs text-ink-dim">
                {selectedOnField ? "Tap a bench player to swap them off." : "Tap a player on the field to swap them on."}
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
            <TouchScoreBug
              teamName={teamName}
              opponentName={opponentName}
              teamPoints={teamPoints}
              opponentPoints={opponentPoints}
              periodLetter={periodLetter}
              currentPeriod={base.currentPeriod}
              periodCount={ageGroup.periodCount}
              clockReadout={clockReadout}
              running={running}
              isPreGame={isPreStart}
              isFinished={base.finalised}
              atHooter={atHooter}
              breakName={breakName}
              trackScoring={trackScoring}
              girlsTryDouble={girlsTryDouble}
              onTeamScore={canScore ? () => setPickingScorer(true) : undefined}
              onOpponentScore={canScore ? opponentScore : undefined}
              onClockTap={isPeriodActive ? () => (atHooter ? setEndConfirmOpen(true) : setClockMenuOpen(true)) : undefined}
              clockPulseKey={base.periodEnded ? `end-${base.currentPeriod}` : null}
            />
          }
          undoStrip={
            (teamPoints > 0 || opponentPoints > 0) && !base.finalised ? (
              <UndoStrip flashing={false} message="" onUndo={undoScore} disabled={pending} />
            ) : undefined
          }
        />
      )}

      {isAtBreak && (
        <QuarterKickoffBar
          onConfirm={() => setStartConfirmOpen(true)}
          confirmLabel={`Start ${periodLetter}${base.currentPeriod + 1}`}
          disabled={pending || !breakDraft}
        />
      )}

      {startConfirmOpen && (
        <StartQuarterModal
          quarter={base.currentPeriod + 1}
          periodLabel={periodLabel}
          cue={isPreStart ? "referee starts play" : "whistle goes"}
          loading={pending}
          onStart={() => {
            if (isPreStart) {
              setStartConfirmOpen(false);
              void run("startTouchPeriod", [auth, game.id, 1]);
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
            // Ending credits the whole period, as every sport does.
            void endPeriodAt(periodMs);
          }}
          onCancel={() => setEndConfirmOpen(false)}
          playersLabel="On-field"
          periodLabel={periodLabel}
        />
      )}

      {pickingScorer && (
        <SlotFillSheet
          slotLabel="try"
          titleVerb="Who scored the"
          subtitle="Pick who scored the try."
          dismissOnBackdrop={false}
          candidates={(state.lineup ? touchOnField(state.lineup) : [])
            .map((id) => playerById.get(id))
            .filter((p): p is Player => Boolean(p))
            .map((p) => ({ id: p.id, name: p.full_name, jerseyNumber: p.jersey_number }))}
          emptyMessage="Nobody is on the field."
          extraOptions={scorerOptions}
          onPick={(pid) => {
            setPickingScorer(false);
            teamScore(pid);
          }}
          onCancel={() => setPickingScorer(false)}
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
            else startLeaving(pid);
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
          extraActions={
            isPeriodActive && actionLine && actionLine !== "field"
              ? TOUCH_LANES.filter((l) => l !== actionLine).map((l) => ({
                  label: `Move to ${TOUCH_LINE_LABEL[l].toLowerCase()}`,
                  hint: `Plays ${TOUCH_LINE_ONE[l]} from now`,
                  testId: `touch-move-${l}`,
                  onClick: () => {
                    const pid = actionPlayer.id;
                    setActionPlayerId(null);
                    void move(pid, null, l);
                  },
                }))
              : undefined
          }
          onClose={() => setActionPlayerId(null)}
        />
      )}

      {fillLine && lineup && (
        <SlotFillSheet
          slotLabel={fillLine === "field" ? "spot" : `${TOUCH_LINE_ONE[fillLine]} spot`}
          candidates={lineup.bench
            .filter((id) => (isAtBreak ? !injuredSet.has(id) && !loanedSet.has(id) : canComeOn(id) && keepsRule(id, null)))
            .map((id) => playerById.get(id))
            .filter((p): p is Player => Boolean(p))
            .map((p) => ({ id: p.id, name: p.full_name, jerseyNumber: p.jersey_number }))}
          emptyMessage={mixed ? "Nobody on the bench can come on under the mixed rule." : "Nobody on the bench can come on."}
          onPick={(pid) => {
            const line = fillLine;
            setFillLine(null);
            if (isAtBreak) setBreakDraft(placeInTouchLineup(lineup, pid, line));
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
            .filter((id) => keepsRule(id, leaving.playerId))
            .map((id) => playerById.get(id))
            .filter((p): p is Player => Boolean(p))
            .map((p) => ({ player: p, totalMs: totalMsByPlayer[p.id] ?? 0 }))
            .sort((a, b) => a.totalMs - b.totalMs);
          return (
            <InjuryReplacementModal
              injuredPlayer={who}
              reason="injured"
              spotLabel={leaving.line === "field" ? "their spot" : TOUCH_LINE_ONE[leaving.line]}
              candidates={candidates}
              onPickReplacement={(rid) => void leaveAndReplace(leaving.playerId, rid, leaving.line)}
              onSkipReplacement={() => {
                const { playerId } = leaving;
                setLeaving(null);
                void markInjured(playerId, true);
              }}
              onCancel={() => setLeaving(null)}
            />
          );
        })()}

      <LongPressHint enabled={isPeriodActive && !selectedId} />
    </div>
  );
}
