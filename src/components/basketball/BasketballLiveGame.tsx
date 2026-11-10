"use client";

// ─── BasketballLiveGame ──────────────────────────────────────
// The basketball live game, on live v3's shell (LiveShell, Phase 10),
// the one AFL, netball and rugby use, so a coach who runs both sports
// finds the same screen: the top bar with ⋯ (LiveGameMenu), the light
// score header (tap it for Scores and fixes), the info line for the next
// sub (tap it for the pairs), the kids on the wood (FieldLines, a KidTile
// each, with their words and pair badges), the bench (KidBench, + Late),
// and the bar: + 1 + 2 + 3 a side in two rows, a picked kid's KidBar, or
// "Make all N swaps" when the sub is due. Before the tip-off the bar's
// Start H1 (or Q1) starts the game; the breaks and full time keep their
// screens. What's basketball's own (.planning/BASKETBALL-PLAN.md):
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
// in the one game lane, so the event log keeps the coach's order. The
// in-game writes are optimistic (useOptimisticEvents): a basket, an undo,
// a foul or a sub shows the moment it's tapped and the server's copy
// takes its place, as AFL's store does. The shared live chrome
// (useLiveChrome) is AFL's: the undo strip says what was recorded, a
// tap-tap sub happens at once with Undo on the toast, the long-press sheet knows the
// kid's line and lent minutes (UX audit 23 Oct 2026, "Drift from AFL").

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useOtherPhoneScores } from "@/components/live/useOtherPhoneScores";
import { WENT_HOME_REASON } from "@/lib/live/wentHome";
import { LiveTopBar } from "@/components/live/LiveTopBar";
import { LiveShell } from "@/components/live/LiveShell";
import { LiveGameMenu, settingsSummary } from "@/components/live/LiveGameMenu";
import { KidTile, KidSlot, type KidFigure, type KidOutKind } from "@/components/live/KidTile";
import { KidBench } from "@/components/live/KidBench";
import { FieldLines, type FieldLine } from "@/components/live/FieldLines";
import { woodCourt } from "./WoodMarks";
import { InfoLine } from "@/components/live/InfoLine";
import { PairsSheet, type SheetPair } from "@/components/live/PairsSheet";
import { KidBar, KidBarMore, TimeSplit } from "@/components/live/KidBar";
import { StartBarButton } from "@/components/live/StartBarButton";
import { WalkthroughOffer } from "@/components/live/WalkthroughOffer";
import { buildSharedWalkthroughSteps } from "@/components/live/WalkthroughModal";
import { LateArrivalMenu } from "@/components/live/LateArrivalMenu";
import { useSquadNames } from "@/components/live/SquadNames";
import { barButton, BAR_SMALL } from "@/components/live/barButtons";
import { kidWords, type KidOut, type KidSubRole, type KidWords } from "@/lib/live/kidWords";
import { pctOfGame } from "@/lib/live/minGameTime";
import { formatMinSec } from "@/lib/sports/netball/fairness";
import { getSportConfig } from "@/lib/sports/registry";
import { endPeriodWords } from "@/lib/sports/words";
import { reopenLineup } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import { ManualEndQuarterConfirm } from "@/components/live/ManualEndQuarterConfirm";
import { ClockMenu } from "@/components/live/ClockMenu";
import { StartQuarterModal } from "@/components/live/StartQuarterModal";
import { LongPressHint } from "@/components/live/LongPressHint";
import { LockModal } from "@/components/live/LockModal";
import { useLiveChrome } from "@/components/live/useLiveChrome";
import { undoSwaps } from "@/lib/live/liveChrome";
import {
  InjuryReplacementModal,
  type InjuryReplacementCandidate,
} from "@/components/live/InjuryReplacementModal";
import { SlotFillSheet } from "@/components/ui/SlotFillSheet";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useOptimisticEvents } from "@/lib/live/useOptimisticEvents";
import { liveEvents, type OptimisticEventInput } from "@/lib/live/optimisticEvents";
import { undoOf, undoTap, type UndoTap } from "@/lib/live/undoTarget";
import type { UndoEvent } from "@/lib/live/lastUndoable";
import { playSubDueBeep, useSubDueAudioUnlock } from "@/lib/live/subDueBeep";
import { useScrollToTopOnFinish } from "@/lib/live/useScrollToTopOnFinish";
import { hapticTap } from "@/lib/haptics";
import { computePeriodClockMs } from "@/lib/live/periodClock";
import { clockPauseInput } from "@/lib/live/clockPause";
import { queuedStartClockMark, useEventPeriodPause } from "@/lib/live/useClockPause";
import { openSubBatch, resolveSubAnchorElapsed } from "@/lib/live/subAnchor";
import { presentPlayerIds } from "@/lib/live/presentPlayers";
import type { Game, GameEvent, LiveAuth, Player } from "@/lib/types";
import { BASKETBALL_POSITION_DEFS } from "@/lib/sports/basketball";
import {
  BASKETBALL_SCORE_EVENT_TYPES,
  basketballPointsWords,
  basketballScoreEventType,
} from "@/lib/sports/basketball/scoreEvents";
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
  suggestBasketballSubs,
  type BasketballPrefs,
  type BasketballSeasonBalance,
} from "@/lib/sports/basketball/suggest";
import {
  basketballSubDue,
} from "@/lib/sports/basketball/live";
import {
  BASKETBALL_LINES,
  type BasketballAgeGroupConfig,
  type BasketballLine,
  type BasketballStrategy,
} from "@/lib/sports/basketball/types";
import { BasketballScoreBug } from "./BasketballScoreBug";
import { BreakScoreEditor } from "@/components/quarter-break/BreakScoreEditor";
import { BasketballBreak } from "./BasketballBreak";
import { BasketballFullTimeReview, BasketballGameSummaryCard } from "./BasketballFullTime";
import {
  BASKETBALL_LINE_LABEL,
  BASKETBALL_LINE_SHORT,
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
  /** Lent minutes in the season's other games, for the long-press sheet. */
  seasonLoanMinutes?: Record<string, number>;
}

/** A foul, or a foul taken back (recordBasketballFoul). */
function foulEvent(input: { player_id: string; kind?: string; undo?: boolean; quarter: number; elapsed_ms: number }): OptimisticEventInput {
  return {
    type: "foul",
    player_id: input.player_id,
    metadata: {
      kind: input.kind ?? "personal",
      ...(input.undo ? { undo: true } : {}),
      quarter: input.quarter,
      elapsed_ms: input.elapsed_ms,
    },
  };
}

/** A timed sit-out (recordBasketballSitOut). */
function sitOutEvent(input: { player_id: string; duration_ms: number; quarter: number; elapsed_ms: number }): OptimisticEventInput {
  return {
    type: "sit_out",
    player_id: input.player_id,
    metadata: { duration_ms: input.duration_ms, quarter: input.quarter, elapsed_ms: input.elapsed_ms },
  };
}

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
  events: serverEvents,
  strategy,
  prefs,
  season,
  isAdmin,
  exitHref,
  seasonLoanMinutes,
}: BasketballLiveGameProps) {
  const opponentName = game.opponent || "Opponent";
  const playerById = useMemo(() => new Map(squad.map((p) => [p.id, p])), [squad]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Every write is optimistic, so nothing here waits on a save.
  const pending = false;
  const [clockMenuOpen, setClockMenuOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const [scorerPoints, setScorerPoints] = useState<Points | null>(null);
  const [actionPlayerId, setActionPlayerId] = useState<string | null>(null);
  const [fillLine, setFillLine] = useState<BasketballLine | null>(null);
  const [leaving, setLeaving] = useState<{
    playerId: string;
    line: BasketballLine;
    reason: "injured" | "fouled_out" | "sitting_out" | "went_home" | "lent";
    /** Opened by the foul that reached the limit: Cancel takes it back. */
    fromFoul?: boolean;
  } | null>(null);
  const [subAckKey, setSubAckKey] = useState<string | null>(null);
  // Live v3's shell: the ⋯ game menu and the pairs sheet (one sheet at a time).
  const [menuOpen, setMenuOpen] = useState(false);
  const [pairsOpen, setPairsOpen] = useState(false);
  const router = useRouter();
  const names = useSquadNames();
  const walkthroughSteps = useMemo(() => buildSharedWalkthroughSteps(), []);
  const liveRootRef = useRef<HTMLDivElement>(null);
  const periodMs = periodSeconds * 1000;
  const periodLetter = ageGroup.periodCount === 4 ? "Q" : "H";
  const periodWord = ageGroup.periodCount === 4 ? "quarter" : "half";
  // The server's events, then the writes it hasn't returned yet.
  const { events, write } = useOptimisticEvents(serverEvents, { gameId: game.id, onError: setError });

  // ── The game so far (without the open stints), for the clock ──
  const base = useMemo(() => replayBasketballGame(events), [events]);
  const isPeriodActive = base.currentPeriod >= 1 && !base.periodEnded && !base.finalised;
  const isAtBreak =
    base.periodEnded && base.currentPeriod >= 1 && base.currentPeriod < ageGroup.periodCount && !base.finalised;
  const isAtFinal = base.periodEnded && base.currentPeriod >= ageGroup.periodCount && !base.finalised;
  const isFinished = base.finalised || isAtFinal;
  const isPreTipoff = base.currentPeriod === 0 && !base.finalised;
  // The summary after Finish opens at the top: the final score and Copy
  // for group chat, not the review's scroll (round 2, 24 Oct 2026).
  useScrollToTopOnFinish(base.finalised, liveRootRef);

  // ── Clock: the shared period clock, its pause a game event ──
  // Game ms since the period started, less real time paused, scaled by
  // the clock multiplier, held at the period's length: the stadium clock
  // stops in the last minutes, so the phone waits there for the hooter.
  // The pause is the period's latest clock_pause event
  // (lib/live/clockPause), so a reload or a second phone keeps it.
  const [nowMs, setNowMs] = useState<number | null>(null);
  const periodStartedAtMs = base.periodStartedAt ? Date.parse(base.periodStartedAt) : NaN;
  const startedAtMs = Number.isNaN(periodStartedAtMs) ? null : periodStartedAtMs;
  const pause = useEventPeriodPause(events, base.currentPeriod, startedAtMs, clockMultiplier);
  const running = pause.pausedAtMs === null;
  useEffect(() => {
    if (!isPeriodActive || !running) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isPeriodActive, running, base.periodStartedAt]);

  const clockAt = useCallback(
    (now: number) => {
      const raw = computePeriodClockMs({
        currentQuarter: base.currentPeriod,
        quarterEnded: base.periodEnded,
        finalised: base.finalised,
        quarterStartedAtMs: startedAtMs,
        pausedAtMs: pause.pausedAtMs,
        accumulatedPauseMs: pause.accumulatedPauseMs,
        fallbackElapsedMs: base.periodEnded ? base.periodElapsedMs : 0,
        clockMultiplier,
        nowMs: now,
      });
      return isPeriodActive ? Math.min(raw, periodMs) : raw;
    },
    [base, startedAtMs, pause, clockMultiplier, isPeriodActive, periodMs],
  );
  // Until the first tick, a running clock shows the server's render; a
  // paused one reads its pause, which doesn't move.
  const elapsedMs = useMemo(
    () => (nowMs == null && running ? (base.periodEnded ? base.periodElapsedMs : 0) : clockAt(nowMs ?? 0)),
    [nowMs, running, base, clockAt],
  );
  const elapsedSecond = Math.floor(elapsedMs / 1000);

  // AFL's live chrome: the undo strip's flash, the swap confirm and toast.
  // A score from the other phone says so (Stagehand round 8, #6).
  useOtherPhoneScores(events, BASKETBALL_SCORE_EVENT_TYPES, { teamName: teamName, opponentName: game.opponent || "Opponent" });
  const chrome = useLiveChrome({
    auth,
    gameId: game.id,
    teamName,
    opponentName,
    playersById: playerById,
    seasonLoanMinutes,
    events,
    scoreTypes: BASKETBALL_SCORE_EVENT_TYPES,
    period: isPeriodActive ? base.currentPeriod : null,
    openElapsedMs: isPeriodActive ? elapsedMs : null,
    toastLook: "ink",
  });

  // ── The game now: every kid's time so far, open stints credited ──
  const state: BasketballGameState = useMemo(
    () => (isPeriodActive ? replayBasketballGame(events, { nowMs: elapsedSecond * 1000 }) : base),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, isPeriodActive, elapsedSecond, base],
  );
  const absNowMs = state.completedPeriodMs + (isPeriodActive ? elapsedMs : 0);
  const injuredSet = useMemo(() => new Set(state.injuredIds), [state.injuredIds]);
  const wentHomeSet = useMemo(() => new Set(state.wentHomeIds), [state.wentHomeIds]);
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

  // The break is BasketballBreak, the shared break screen (below); this
  // screen shows the lineup in play.
  const lineup: BasketballLineup | null = state.lineup;
  const shape = useMemo(
    () => basketballShapeFor(strategy, game.on_field_size, shapeIdOf(lastSetLineup(events))),
    [strategy, game.on_field_size, events],
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
  // No sub is due once the clock is out: the phone waits at 0:00 for the
  // buzzer, and the Sub due card and OFF badges stayed up through half
  // time and full time (round 2, 24 Oct 2026; AFL hides them after the
  // siren too).
  const periodClockDone = elapsedMs >= periodMs;
  const subsOpen = isPeriodActive && !periodClockDone;
  const anchorMs = useMemo(
    () => (subsOpen ? resolveSubAnchorElapsed(events, base.currentPeriod) : null),
    [events, base.currentPeriod, subsOpen],
  );
  const subDue = basketballSubDue({
    subIntervalMs: subIntervalSeconds != null ? subIntervalSeconds * 1000 : null,
    periodMs,
    cutoffMs: ageGroup.subCutoffSeconds * 1000,
    anchorMs,
    elapsedMs,
  });
  const msUntilDue = subDue.msUntilDue;
  // One pair of the planned sub made: just the pairs still to make, not
  // the kid just taken off straight back on (lib/live/subAnchor).
  const batchLeft = useMemo(
    () => (subsOpen ? openSubBatch(events, base.currentPeriod) : 0),
    [events, base.currentPeriod, subsOpen],
  );
  const suggestedSubs = useMemo(() => {
    if (!subsOpen) return [];
    // Empty spots on court are filled first (the shape's spots).
    const opts = { strategy, prefs, season, foulOutAt: trackFouls ? ageGroup.foulOutAt : 0, spots: shape.lines };
    const now = suggestBasketballSubs({ state, nowMs: absNowMs, ...opts });
    if (now.length > 0 || msUntilDue === null || msUntilDue <= 0) return now;
    // Nothing evens time yet, so show the subs due at the next sub time
    // (Steve 2026-10-21: "I did one sub and now no more upcoming subs
    // show"). Kids who just came on need time before anyone on the bench
    // is owed theirs, and a kid who plays one line only waits for it.
    const aheadMs = Math.min(periodMs, elapsedMs + msUntilDue);
    const ahead = replayBasketballGame(events, { nowMs: aheadMs });
    return suggestBasketballSubs({ state: ahead, nowMs: ahead.completedPeriodMs + aheadMs, ...opts });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subsOpen, state, events, strategy, prefs, season, trackFouls, ageGroup.foulOutAt, periodMs, shape, msUntilDue !== null && msUntilDue <= 0, Math.floor((msUntilDue ?? 0) / 5000)]);
  const nextSubs = useMemo(
    () => (batchLeft > 0 ? suggestedSubs.slice(0, batchLeft) : suggestedSubs),
    [suggestedSubs, batchLeft],
  );
  const subDueKey = subDue.key === null ? null : `${base.currentPeriod}:${subDue.key}`;
  const subDueShowing = isPeriodActive && subDue.due && nextSubs.length > 0 && subAckKey !== subDueKey;
  useSubDueAudioUnlock();
  // The sub-due beep waits while the who-scored sheet is up (AFL's
  // picker-race guard), and goes once it closes. A kid picked doesn't
  // hold it: a coach who leaves a kid tapped would never hear it.
  const holdForScoring = scorerPoints !== null;
  const subDueShowingRef = useRef(false);
  useEffect(() => {
    if (holdForScoring) return;
    if (subDueShowing && !subDueShowingRef.current) {
      playSubDueBeep();
      void hapticTap("heavy");
    }
    subDueShowingRef.current = subDueShowing;
  }, [subDueShowing, holdForScoring]);
  // The clock reaching 0:00 (it waits there for the real buzzer) puts a
  // picked kid down, so the bar is the score bar again and the clock's
  // End is in reach (AFL's siren, f75e85a2). Not while the who-scored
  // sheet is up: a basket on the buzzer still gets its scorer.
  const clockOut = isPeriodActive && elapsedMs >= periodMs;
  useEffect(() => {
    if (clockOut && !holdForScoring) setSelectedId(null);
  }, [clockOut, holdForScoring]);

  // ── Writes ──────────────────────────────────────────────────
  // The clock as the write lands: a confirmed swap is stamped when the
  // coach taps Confirm, not when the sheet opened (AFL reads its clock
  // at confirm too).
  const elapsedRef = useRef(elapsedMs);
  elapsedRef.current = elapsedMs;
  const at = () => ({ quarter: base.currentPeriod, elapsed_ms: elapsedRef.current });

  // A period's end and start are optimistic writes too, like every
  // other tap: the break opens at the hooter and the next period starts
  // at the tap, with or without signal. They used to wait on the save,
  // so a hooter with no signal sat on "Applying…" while the kids' minutes
  // ran past the period (round 3, 24 Oct 2026).
  const endPeriodAt = useCallback(
    (elapsed: number) => {
      setError(null);
      write(
        "endBasketballPeriod",
        [auth, game.id, base.currentPeriod, elapsed],
        liveEvents.periodEnd({ quarter: base.currentPeriod, elapsed_ms: elapsed }),
      );
    },
    [auth, game.id, base.currentPeriod, write],
  );
  function startFirstPeriod() {
    setError(null);
    const mark = queuedStartClockMark(1);
    write("startBasketballPeriod", [auth, game.id, 1], liveEvents.periodStart(1));
    if (mark) write("recordClockPause", [auth, game.id, mark], liveEvents.clockPause(mark));
  }

  // Pause or resume: a clock_pause event, on screen at once.
  function toggleClock() {
    if (!isPeriodActive) return;
    const now = Date.now();
    const input = clockPauseInput(base.currentPeriod, running, clockAt(now), now);
    write("recordClockPause", [auth, game.id, input], liveEvents.clockPause(input));
    // The clock reads now from the tap, not the last tick (a page opened
    // paused has none yet).
    setNowMs(now);
  }

  /**
   * `manual`: made by hand, off the rotation's cadence, so the sub clock doesn't restart (AFL's rule).
   * `leftInBatch`: one pair of the planned sub, with this many still to make (the clock holds).
   */
  function sub(offId: string | null, onId: string, line?: BasketballLine, manual = false, leftInBatch = 0, undo = false) {
    setError(null);
    const input = {
      off_player_id: offId,
      on_player_id: onId,
      ...(line ? { line } : {}),
      ...(leftInBatch > 0 ? { batch_left: leftInBatch } : {}),
      ...(manual ? { manual } : {}),
      ...(undo ? { undo } : {}),
      ...at(),
    };
    write("recordBasketballSwap", [auth, game.id, input], liveEvents.swap(input));
  }
  function move(a: string, b: string | null, zoneB: BasketballLine) {
    const zoneA = state.lineup ? basketballLineOf(state.lineup, a) : null;
    if (!zoneA) return;
    setError(null);
    const input = { player_a_id: a, zone_a: zoneA, ...(b ? { player_b_id: b } : {}), zone_b: zoneB, ...at() };
    write("recordBasketballMove", [auth, game.id, input], liveEvents.move(input));
  }

  function applyAllSubs() {
    if (nextSubs.length === 0) return;
    for (const s of nextSubs) sub(s.off_player_id, s.on_player_id, s.line);
    // The toast's Undo puts them back, last first (undoSwaps).
    const undo = undoSwaps(
      nextSubs.map((s) => ({ off: s.off_player_id, on: s.on_player_id, line: s.line })),
      (s) => sub(s.off, s.on, s.line),
    );
    if (nextSubs.length === 1) chrome.swapped(nextSubs[0].off_player_id, nextSubs[0].on_player_id, undo);
    else chrome.showToast(`${nextSubs.length} subs made`, undo, `the ${nextSubs.length} swaps`);
    setSubAckKey(subDueKey);
  }

  // ── Taps ────────────────────────────────────────────────────
  function lineOf(pid: string): BasketballLine | null {
    return lineup ? basketballLineOf(lineup, pid) : null;
  }
  const canComeOn = (pid: string) => basketballCanPlay(state, pid, absNowMs);
  /** A line in the coach's words, for the swap confirm and toasts. */
  const spotName = (line: BasketballLine) => (line === "court" ? "court" : BASKETBALL_LINE_LABEL[line]);

  function handleTap(pid: string, line: BasketballLine | null) {
    setError(null);
    if (!lineup) return;
    if (!isPeriodActive) return;

    if (pid === "") {
      if (!line) return;
      if (selectedId) {
        const kid = selectedId;
        const from = lineOf(kid);
        if (from) {
          // A move on court, straight away (AFL's empty-zone move).
          move(kid, null, line);
          chrome.showToast(`${chrome.firstName(kid)} → ${spotName(line)}`);
        } else if (canComeOn(kid)) {
          // A bench kid into an empty spot goes on at once, as AFL's does.
          chrome.manualSwap({ offId: null, onId: kid, spotName: spotName(line), run: () => sub(null, kid, line, true) });
        }
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
    const first = selectedId;
    const aLine = lineOf(first);
    const bLine = lineOf(pid);
    setSelectedId(null);
    if (aLine && bLine) {
      // Two on court trade places, straight away (AFL's zone swap).
      move(first, pid, bLine);
      chrome.showToast(`${chrome.firstName(first)} ⇄ ${chrome.firstName(pid)} — swapped`);
    } else if (aLine || bLine) {
      // A court kid and a bench kid: the sub at once, Undo on the toast (AFL's).
      const off = aLine ? first : pid;
      const on = aLine ? pid : first;
      if (!canComeOn(on)) return;
      chrome.manualSwap({
        offId: off,
        onId: on,
        spotName: spotName((aLine ?? bLine)!),
        run: () => sub(off, on, undefined, true),
        undo: () => sub(on, off, undefined, true),
      });
    } else setSelectedId(pid); // two bench kids: the second is the selection
  }

  // ── Score ───────────────────────────────────────────────────
  // A basket goes up the moment it's tapped (optimistic), and the undo
  // strip flashes what was recorded, as AFL's does (Steve 2026-10-21:
  // "the score bug with the +1,2,3 isn't working" — waiting on the save
  // held every chip). On the scorebug only in play: the break and full
  // time have their own score editors.
  const canScore = isPeriodActive;
  function recordBasket(side: "ours" | "theirs", points: Points, playerId: string | null) {
    setError(null);
    const key = write(
      "recordBasketballScore",
      [auth, game.id, { side, points, player_id: playerId, ...at() }],
      liveEvents.score(basketballScoreEventType(side, points), side === "ours" ? playerId : null, at()),
    );
    chrome.scored({ side: side === "ours" ? "us" : "them", what: basketballPointsWords(points), scorerId: playerId, key });
  }
  function teamScore(points: Points, scorerId: string | null) {
    if (!trackScoring) return;
    setSelectedId(null);
    recordBasket("ours", points, scorerId);
  }
  const opponentScore = (points: Points) => recordBasket("theirs", points, null);
  const teamPoints = state.teamScore.points;
  const opponentPoints = state.opponentScore.points;
  const playerPoints = state.playerPoints;
  // The strip's Undo takes back the basket it names (useOneUndo: this
  // phone's newest, never whatever the other phone scored since, UX
  // round 2); the break's and full time's "Undo last score" the latest.
  const writeScoreUndo = (tap: UndoTap) => {
    if (tap.kind !== "undo") return;
    setError(null);
    write("undoBasketballScore", [auth, game.id, tap.target], tap.optimistic);
    chrome.undone();
  };
  const undoScore = () => writeScoreUndo(undoTap(events, BASKETBALL_SCORE_EVENT_TYPES, null));
  const undoNamedScore = (score: UndoEvent) => writeScoreUndo(undoOf(score));

  // ── Sideline: injuries, loans, late arrivals, holds ─────────
  const swappableBench = useMemo(
    () => (state.lineup?.bench ?? []).filter((id) => canComeOn(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.lineup, state.injuredIds, state.loanedIds, state.sittingOut, absNowMs],
  );
  // Nobody arrives at a game that's over (AFL's LiveGame filters the same).
  const lateArrivalCandidates = useMemo(() => {
    if (isFinished) return [];
    const placed = new Set(state.lineup ? [...basketballOnCourt(state.lineup), ...state.lineup.bench] : []);
    return squad.filter((p) => !placed.has(p.id));
  }, [squad, state.lineup, isFinished]);

  type Leaving = "injured" | "fouled_out" | "sitting_out" | "went_home" | "lent";
  function markInjured(pid: string, injured: boolean, reason?: string) {
    setError(null);
    const input = { player_id: pid, injured, ...at(), ...(reason ? { reason } : {}) };
    write("markInjury", [auth, game.id, input], liveEvents.injury(input));
  }
  /** A kid leaves the court (hurt, fouled out, sat out): pick who comes on. */
  function startLeaving(pid: string, reason: Leaving, fromFoul = false) {
    const line = state.lineup ? basketballLineOf(state.lineup, pid) : null;
    // A lend always asks, as AFL's does: with nobody on the bench the
    // sheet says so, never a silent gap (Stagehand round 9).
    if (isPeriodActive && line && (swappableBench.length > 0 || reason === "lent")) {
      setLeaving({ playerId: pid, line, reason, fromFoul });
      return;
    }
    leaveNow(pid, reason);
  }
  function endSitOut(pid: string) {
    setError(null);
    const input = { player_id: pid, duration_ms: 0, ...at() };
    write("recordBasketballSitOut", [auth, game.id, input], sitOutEvent(input));
  }
  function leaveNow(pid: string, reason: Leaving, replaced = false) {
    if (reason === "lent") {
      setLoan(pid, true);
    } else if (reason === "sitting_out") {
      setError(null);
      const input = { player_id: pid, duration_ms: SIT_OUT_MS, ...at() };
      write("recordBasketballSitOut", [auth, game.id, input], sitOutEvent(input));
      // The sin bin is undoable as a swap is: "Undo: Sam's sit-out".
      if (!replaced) chrome.undoableChange(`${chrome.firstName(pid)}'s sit-out`, () => endSitOut(pid));
    } else {
      // Going home is an injury with reason "out" (lib/live/wentHome).
      markInjured(pid, true, reason === "fouled_out" ? "fouled_out" : reason === "went_home" ? WENT_HOME_REASON : undefined);
    }
  }
  function leaveAndReplace(pid: string, replacementId: string, line: BasketballLine, reason: Leaving) {
    setLeaving(null);
    // In order, in the one game lane: the kid leaves, then who comes on.
    leaveNow(pid, reason, true);
    sub(pid, replacementId, line);
    chrome.swapped(pid, replacementId);
    // A mistaken sit-out goes back as it came: the sit-out ends and the
    // kid comes back on for whoever replaced them.
    if (reason === "sitting_out") {
      chrome.undoableChange(`${chrome.firstName(pid)}'s sit-out`, () => {
        endSitOut(pid);
        sub(replacementId, pid, line);
      });
    }
  }
  const setLoan = (pid: string, loaned: boolean) => {
    setError(null);
    const input = { player_id: pid, loaned, ...at() };
    write("markLoan", [auth, game.id, input], liveEvents.loan(input));
  };
  const setHold = (pid: string, lock: { kind: "field" } | null) => {
    setError(null);
    const input = { player_id: pid, lock, ...at() };
    write("recordPlayerLock", [auth, game.id, input], liveEvents.lock(input));
  };
  const addLateArrival = (pid: string) => {
    setError(null);
    const input = { player_id: pid, ...at() };
    write("addLateArrival", [auth, game.id, input], liveEvents.arrived(input));
  };

  // ── Fouls ───────────────────────────────────────────────────
  function writeFoul(pid: string, undo: boolean) {
    setError(null);
    const input = { player_id: pid, ...(undo ? { undo: true } : { kind: "personal" as const }), ...at() };
    return write("recordBasketballFoul", [auth, game.id, input], foulEvent(input));
  }
  function foul(pid: string) {
    setSelectedId(null);
    // Fouls stop at the limit. A sixth used to count, so taking one back
    // said "Back to 5 of 5, and back in the game".
    if ((state.fouls[pid] ?? 0) >= ageGroup.foulOutAt) return;
    const count = (state.fouls[pid] ?? 0) + 1;
    // The strip names it next: "Undo: foul on Sam" (Stagehand round 9).
    chrome.fouled(writeFoul(pid, false));
    // The limit: out for the game. The coach picks who comes on.
    if (count >= ageGroup.foulOutAt && !fouledOutSet.has(pid)) startLeaving(pid, "fouled_out", true);
  }
  const undoFoul = (pid: string) => writeFoul(pid, true);
  /** The strip's Undo of a foul: the one that fouled a kid out puts them back in the game too. */
  function takeBackFoul(pid: string) {
    const outOnFouls = fouledOutSet.has(pid) && (state.fouls[pid] ?? 0) >= ageGroup.foulOutAt;
    undoFoul(pid);
    if (outOnFouls) markInjured(pid, false);
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

  const actionPlayer = actionPlayerId ? playerById.get(actionPlayerId) ?? null : null;
  const actionLine = actionPlayerId && state.lineup ? basketballLineOf(state.lineup, actionPlayerId) : null;
  const actionHeld = actionPlayerId ? lockModes[actionPlayerId] ?? null : null;
  const lentPlayers = squad.filter((p) => loanedSet.has(p.id) && !injuredSet.has(p.id));
  const scoreChips: Points[] = threePointers ? [1, 2, 3] : [1, 2];
  const otherLine: Record<BasketballLine, BasketballLine | null> = { guard: "forward", forward: "guard", court: null };

  // Who scored a basket: the scorebug's +1/+2/+3 in play, the score
  // sheet's at the break, the review's at full time. "Who scored?", what
  // for ("2 points"), the kids on court first, then the bench (a kid
  // just subbed off may have scored). A stray tap on the backdrop keeps
  // the sheet (SlotFillSheet's default): the basket mustn't vanish.
  const scorerCandidates = (state.lineup ? [...basketballOnCourt(state.lineup), ...state.lineup.bench] : [])
    .filter((id) => !injuredSet.has(id) && !loanedSet.has(id))
    .map((id) => playerById.get(id))
    .filter((p): p is Player => Boolean(p))
    .map((p) => {
      const line = state.lineup ? basketballLineOf(state.lineup, p.id) : null;
      const pos = state.lineup?.slots?.[p.id];
      return {
        id: p.id,
        name: p.full_name,
        jerseyNumber: p.jersey_number,
        subLabel: !line ? "Bench" : pos ? POSITION_LABEL[pos] : BASKETBALL_LINE_SHORT[line] || "Court",
      };
    });
  const scorerEyebrow = (n: Points) =>
    n === 1 ? "Free throw · 1 point" : n === 3 ? "Three · 3 points" : basketballPointsWords(n);
  const breakScorerPicker =
    scorerPoints !== null ? (
      <SlotFillSheet
        slotLabel="basket"
        eyebrow={scorerEyebrow(scorerPoints)}
        title="Who scored?"
        lostScore="basket"
        subtitle="Pick who scored, or count the points without a name."
        candidates={scorerCandidates}
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
    ) : null;

  // The break: the shared break screen.
  if (isAtBreak) {
    return (
      <div ref={liveRootRef}>
        <BasketballBreak
          auth={auth}
          write={write}
          game={game}
          exitHref={exitHref}
          squad={squad}
          ageGroup={ageGroup}
          state={base}
          events={events}
          periodMs={periodMs}
          strategy={strategy}
          prefs={prefs}
          season={season}
          trackFouls={trackFouls}
          shapeId={shapeIdOf(lastSetLineup(events))}
          score={
            trackScoring
              ? {
                  us: teamPoints,
                  them: opponentPoints,
                  editor: (
                    <>
                      <BreakScoreEditor
                        teamName={teamName}
                        opponentName={opponentName}
                        teamPoints={teamPoints}
                        opponentPoints={opponentPoints}
                        scoreByPeriod={state.scoreByPeriod}
                        periodCount={ageGroup.periodCount}
                        currentPeriod={base.currentPeriod}
                        periodLetter={periodLetter}
                        periodWord={periodWord}
                        teamChips={scoreChips.map((n) => ({
                          key: String(n),
                          text: `+${n}`,
                          label: `Add ${n} ${n === 1 ? "point" : "points"}, ${teamName}`,
                          onClick: () => setScorerPoints(n),
                        }))}
                        opponentChips={scoreChips.map((n) => ({
                          key: String(n),
                          text: `+${n}`,
                          label: `Add ${n} ${n === 1 ? "point" : "points"}, ${opponentName}`,
                          onClick: () => opponentScore(n),
                        }))}
                        missedNote={`A basket you missed counts in ${periodLetter}${base.currentPeriod}.`}
                        onUndo={undoScore}
                        undoDisabled={pending}
                        fix={{ auth, gameId: game.id }}
                      />
                      {breakScorerPicker}
                    </>
                  ),
                }
              : undefined
          }
        />
        {error && <InlineAlert kind="danger">{error}</InlineAlert>}
      </div>
    );
  }

  // ─── Live v3's shell (Phase 10) ────────────────────────────
  // Before the tip-off and through the period the screen is LiveShell, as
  // AFL's: the top bar (‹ Exit · vs X · ⋯), the light score header, the
  // undo line, the info line (the next sub), the court (the kids on the
  // wood, a line each for forwards and guards), the bench and the bar.
  // The break is BasketballBreak (above); full time and the finished
  // game keep their page (below).
  const inPlay = isPeriodActive;
  const lineShort = (line: BasketballLine) => BASKETBALL_LINE_SHORT[line] || null;
  const dueNow = isPeriodActive && subDue.due && subAckKey !== subDueKey;
  // The next sub falls in the period's last minute or past the buzzer: no
  // more this period, so the pairs go (AFL's rule), unless one's due now.
  const subsDone =
    subsOpen && !dueNow && msUntilDue !== null && elapsedMs + Math.max(0, msUntilDue) >= periodMs - ageGroup.subCutoffSeconds * 1000;
  const shownSubs = subsOpen && !subsDone ? nextSubs : [];
  // Where each pair happens: the off-going kid's position ("PG"), or the
  // line ("G"), as the kids' words say it ("On next → G").
  const whereOf = (s: (typeof nextSubs)[number]) => {
    const pos = s.off_player_id ? state.lineup?.slots?.[s.off_player_id] : null;
    return pos ? POSITION_LABEL[pos] ?? pos : lineShort(s.line);
  };
  const pairOf = new Map<string, { i: number; role: "off" | "on"; where: string | null; line: BasketballLine }>();
  shownSubs.forEach((s, i) => {
    const where = whereOf(s);
    if (s.off_player_id) pairOf.set(s.off_player_id, { i, role: "off", where, line: s.line });
    pairOf.set(s.on_player_id, { i, role: "on", where, line: s.line });
  });

  function makeOnePair(i: number) {
    const s = shownSubs[i];
    if (!s) return;
    if (shownSubs.length === 1) {
      makeAllPairs();
      return;
    }
    // One of the batch: the rest stay planned for the same time and the
    // sub clock holds. It used to count as the whole rotation: the clock
    // restarted and the rest slid an interval later (Stagehand, 9 Nov 2026).
    sub(s.off_player_id, s.on_player_id, s.line, false, shownSubs.length - 1);
    // Undo puts the pair back in the plan: the swap back reopens the
    // whole batch, so the clock still holds (Stagehand round 10).
    const off = s.off_player_id;
    const batch = shownSubs.length;
    chrome.swapped(off, s.on_player_id, off ? () => sub(s.on_player_id, off, s.line, false, batch, true) : undefined);
    setSelectedId(null);
  }
  function makeAllPairs() {
    applyAllSubs();
    setPairsOpen(false);
    setSelectedId(null);
  }
  const sheetPairs: SheetPair[] = shownSubs.flatMap((s, index) => {
    const off = s.off_player_id ? playerById.get(s.off_player_id) : null;
    const on = playerById.get(s.on_player_id);
    if (!on || (s.off_player_id && !off)) return [];
    return [
      {
        index,
        offId: s.off_player_id ?? "",
        onId: s.on_player_id,
        offName: off ? names.first(off) : "Empty spot",
        onName: names.first(on),
        offFull: off ? off.full_name : "the empty spot",
        onFull: on.full_name,
        where: whereOf(s) ?? "ON",
        edited: false,
      },
    ];
  });
  const openPairs = () => {
    setSelectedId(null);
    setPairsOpen(true);
  };

  // ── One kid (KidTile) ──
  const lineLabel = (line: BasketballLine) => (line === "court" ? "Court" : BASKETBALL_LINE_LABEL[line]);
  function outOf(pid: string): { out: KidOut; kind: KidOutKind } | null {
    if (fouledOutSet.has(pid)) return { out: { kind: "fouledOut" }, kind: "fouledOut" };
    if (injuredSet.has(pid)) {
      const home = wentHomeSet.has(pid);
      return { out: { kind: "injured", wentHome: home }, kind: home ? "home" : "injured" };
    }
    if (loanedSet.has(pid)) return { out: { kind: "lent" }, kind: "lent" };
    const sit = sitOutMsLeft[pid];
    if (sit) return { out: { kind: "sitOut", msLeft: sit }, kind: "sit" };
    return null;
  }
  function kidTile(pid: string, line: BasketballLine | null) {
    const p = playerById.get(pid);
    if (!p) return null;
    const o = outOf(pid);
    const pair = o || !inPlay ? null : pairOf.get(pid) ?? null;
    const subRole: KidSubRole | null = pair ? (pair.role === "off" ? { role: "off" } : { role: "on", to: pair.where }) : null;
    let words: KidWords | null = kidWords({
      place: line ? "field" : "bench",
      sub: subRole,
      subDue: dueNow,
      rollingSubs: true,
      subsDoneThisPeriod: subsDone,
      out: o?.out ?? null,
      inPlay,
      lastPeriod: base.currentPeriod >= ageGroup.periodCount,
    });
    // "On next → G" says the line in full: "On next to Guards".
    if (words && pair?.role === "on" && pair.line !== "court" && pair.where === lineShort(pair.line)) {
      words = { ...words, spoken: `${words.text.split(" →")[0]} to ${BASKETBALL_LINE_LABEL[pair.line]}` };
    }
    const fouls = foulsByPlayer ? foulsByPlayer[pid] ?? 0 : 0;
    const points = trackScoring ? playerPoints[pid] ?? 0 : 0;
    const pos = line ? positionLabels?.[pid] ?? null : null;
    const totalMs = totalMsByPlayer[pid];
    const held = lockModes[pid] ?? null;
    // Fouls ("F3", bold two short of the limit, underlined one short) and
    // points ("8 PTS") as small figures after the name.
    const figures: KidFigure[] = [
      ...(fouls > 0
        ? [
            {
              key: "fouls",
              text: `F${fouls}`,
              label: `${fouls} ${fouls === 1 ? "foul" : "fouls"}`,
              testId: `fouls-${pid}`,
              strong: fouls >= ageGroup.foulOutAt - 2,
              underline: fouls >= ageGroup.foulOutAt - 1,
            },
          ]
        : []),
      ...(points > 0 ? [{ key: "pts", text: `${points} ${points === 1 ? "PT" : "PTS"}`, label: `${points} ${points === 1 ? "point" : "points"}` }] : []),
    ];
    return (
      <KidTile
        testId={`player-tile-${pid}`}
        name={names.tile(p)}
        spoken={{
          name: p.full_name,
          place: line ? pos || lineLabel(line) : null,
          number: p.jersey_number,
          time: totalMs !== undefined ? formatMinSec(totalMs) : null,
          states: [
            fouls > 0 ? `${fouls} of ${ageGroup.foulOutAt} fouls` : null,
            points > 0 ? `${points} ${points === 1 ? "point" : "points"}` : null,
            held ? "Kept on" : null,
          ],
        }}
        place={line ? "field" : "bench"}
        pos={pos}
        words={words}
        figures={figures}
        badge={pair ? { n: pair.i + 1, hot: dueNow } : null}
        selected={selectedId === pid}
        due={!!pair && dueNow}
        locked={!!held}
        lockLabel={held ? "Kept on court" : null}
        out={o?.kind ?? null}
        onClick={
          o
            ? // Out (fouled out, hurt, lent, sitting): a tap opens their
              // sheet (Take back the last foul, Back on, Bring back, End
              // the sit-out).
              () => setActionPlayerId(pid)
            : inPlay
              ? () => handleTap(pid, line)
              : undefined
        }
        onLongPress={inPlay || o ? () => setActionPlayerId(pid) : undefined}
      />
    );
  }

  // ── The court: forwards by the basket, guards at the top of the key ──
  const usesLines = !!lineup && lineup.lines.court.length === 0 && (lineCaps.court ?? 0) === 0;
  const courtLines: BasketballLine[] = usesLines
    ? (["forward", "guard"] as const).filter((l) => Math.max(lineCaps[l] ?? 0, lineup!.lines[l].length) > 0)
    : ["court"];
  const fieldLines: FieldLine[] = lineup
    ? courtLines.map((line) => {
        const ids = lineup.lines[line];
        const empties = Math.max(0, (lineCaps[line] ?? 0) - ids.length);
        const spot = line === "court" ? "spot" : `${BASKETBALL_LINE_LABEL[line].toLowerCase().replace(/s$/, "")} spot`;
        return {
          key: line,
          label: lineLabel(line),
          tiles: [
            ...ids.map((pid) => (
              <div key={pid} className="min-w-0">
                {kidTile(pid, line)}
              </div>
            )),
            ...Array.from({ length: empties }, (_, i) => (
              <KidSlot
                key={`empty-${i}`}
                label={selectedPlayer ? `Move ${selectedPlayer.full_name} to the empty ${spot}` : `Empty ${spot}`}
                text={selectedPlayer ? "Move here" : "Empty"}
                hot={!!selectedPlayer}
                onClick={() => handleTap("", line)}
              />
            )),
          ],
        };
      })
    : [];
  const fieldEl = lineup ? (
    <div role="region" aria-label="On court" className="flex flex-1 flex-col">
      <FieldLines lines={fieldLines} {...woodCourt()} />
    </div>
  ) : null;

  // The bench: who can come on, then who's out (sitting, hurt, fouled
  // out, lent), then kids lent before they were placed.
  const benchIds = lineup?.bench ?? [];
  const placedIds = new Set(lineup ? [...basketballOnCourt(lineup), ...benchIds] : []);
  const lentAway = lentPlayers.filter((p) => !placedIds.has(p.id)).map((p) => p.id);
  const benchOrder = [...benchIds.filter((id) => !outOf(id)), ...benchIds.filter((id) => !!outOf(id)), ...lentAway];
  const benchEl = (
    <KidBench
      count={benchIds.length}
      dense={benchOrder.length > 6}
      tiles={benchOrder.map((pid) => (
        <div key={pid} className="min-w-0">
          {kidTile(pid, null)}
        </div>
      ))}
      late={
        lateArrivalCandidates.length > 0 ? (
          <LateArrivalMenu look="text" candidates={lateArrivalCandidates} onAdd={addLateArrival} pending={pending} />
        ) : undefined
      }
    />
  );

  // ── The info line: the next sub ──
  // "Send them to the table": a parent who doesn't know basketball reads
  // it as plain words (Stagehand round 8, #14).
  // Due: said with its pairs, or (nobody suggested, but someone could come
  // on) as "Sub due · rotate a player off". Nobody to bring on: not due.
  const subDueSaid = dueNow && (shownSubs.length > 0 || swappableBench.length > 0);
  const subSoft = !dueNow && msUntilDue !== null && msUntilDue > 0 && msUntilDue <= 30_000 && shownSubs.length > 0;
  // Ending the period: ⋯'s "End 1st half" (or "End Q2") row, and "Time's
  // up: end 1st half" on the info line once the clock reads 0:00 and it's
  // still open. Both open the clock's end confirm.
  const periodTimeUp = isPeriodActive && atHooter;
  const endWords = endPeriodWords({
    sport: "basketball",
    periodLabel: periodWord,
    period: base.currentPeriod,
    periodCount: ageGroup.periodCount,
    timeUp: periodTimeUp,
  });
  const openEndPeriod = () => {
    setSelectedId(null);
    setEndConfirmOpen(true);
  };
  const infoEl =
    inPlay && (benchIds.length > 0 || periodTimeUp) ? (
      <InfoLine
        timeUp={periodTimeUp ? { prompt: endWords.prompt, onEnd: openEndPeriod } : undefined}
        state={subDueSaid ? "due" : subSoft ? "soft" : "idle"}
        msUntilDue={subsDone ? null : msUntilDue}
        subIntervalMs={subDue.spanMs ?? 0}
        swaps={sheetPairs.length}
        periodWord={periodWord}
        noBench={swappableBench.length === 0}
        onOpen={sheetPairs.length > 0 ? openPairs : undefined}
        softHint="send them to the table, tap them on at the whistle"
        dueHint="send them to the table now"
      />
    ) : null;

  // ── Banners: a failed save ──
  const bannersEl = error ? (
    <p className="rounded-[12px] bg-blood-soft px-3 py-2 text-[0.8125rem] font-bold text-blood" role="alert">
      {error}
    </p>
  ) : null;

  // ── The bar ──
  // A picked kid: the bar is theirs (KidBar). The sub due: MAKE ALL N
  // SWAPS and PAIRS. Otherwise the score bar, or (scoring off) where
  // things are. Before the tip-off: Start H1.
  const btn = (tone: Parameters<typeof barButton>[0]) => barButton(tone, "sm");
  const kidBar =
    selectedPlayer && inPlay
      ? (() => {
          const pid = selectedPlayer.id;
          const p = selectedPlayer;
          const line = lineOf(pid);
          const pos = line ? positionLabels?.[pid] ?? null : null;
          const totalMs = totalMsByPlayer[pid] ?? 0;
          const ms = state.ms[pid] ?? {};
          const pair = pairOf.get(pid) ?? null;
          const planned = pair ? shownSubs[pair.i] : null;
          const first = names.first(p);
          const fouls = state.fouls[pid] ?? 0;
          const atLimit = fouls >= ageGroup.foulOutAt;
          const actions = [
            ...(line && trackScoring
              ? scoreChips.map((n, i) => (
                  <button
                    key={`p${n}`}
                    type="button"
                    onClick={() => teamScore(n, pid)}
                    disabled={pending}
                    className={btn(i === 0 ? "primary" : "outlined")}
                  >
                    +{n}
                  </button>
                ))
              : []),
            <button
              key="injured"
              type="button"
              disabled={pending}
              onClick={() => {
                setSelectedId(null);
                // On court with someone to bring on: straight to who comes
                // on; on the bench, marked at once.
                startLeaving(pid, "injured");
              }}
              className={btn("hurt")}
            >
              <svg viewBox="0 0 20 20" className="h-[16px] w-[16px]" aria-hidden>
                <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
              </svg>
              Injured
            </button>,
            <KidBarMore
              key="more"
              onClick={() => {
                setSelectedId(null);
                setActionPlayerId(pid);
              }}
            />,
          ];
          // Fouls step both ways (Steve 2026-10-22: "Need to be able to
          // undo fouls in basketball"): − takes the last one back, + Foul
          // says how many of the limit, in blood one short of it.
          const foulRow =
            line && trackFouls ? (
              <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-[8px]">
                <button
                  type="button"
                  data-testid="basketball-unfoul"
                  onClick={() => {
                    setSelectedId(null);
                    undoFoul(pid);
                  }}
                  disabled={pending || fouls === 0}
                  aria-label={`Take back a foul from ${p.full_name}`}
                  className={btn("outlined")}
                >
                  −
                </button>
                <button
                  type="button"
                  data-testid="basketball-foul"
                  onClick={() => foul(pid)}
                  disabled={pending || atLimit}
                  aria-label={`Foul for ${p.full_name}, ${fouls} of ${ageGroup.foulOutAt}`}
                  className={btn(fouls >= ageGroup.foulOutAt - 1 ? "hurt" : "outlined")}
                >
                  + Foul
                  <span className={BAR_SMALL}>
                    {fouls} of {ageGroup.foulOutAt}
                  </span>
                </button>
              </div>
            ) : null;
          const split = (
            <TimeSplit
              parts={[
                { ms: ms.guard ?? 0, className: "bg-zone-c-fill" },
                { ms: ms.forward ?? 0, className: "bg-zone-f-fill" },
                { ms: ms.court ?? 0, className: "bg-brand-600" },
              ]}
            />
          );
          return (
            <KidBar
              name={p.full_name}
              heading={`${p.jersey_number != null ? `#${p.jersey_number} ` : ""}${p.full_name}${pos ? ` · ${pos}` : ""}`}
              split={split}
              line={`${line ? lineLabel(line) : "Bench"} · ${Math.round(totalMs / 60_000)}′ this game · ${pctOfGame(totalMs, absNowMs)}% of game`}
              hint={
                line ? (
                  trackScoring || trackFouls ? (
                    <>
                      Points or a foul for <b className="font-bold text-ink">{first}</b>. Or tap another kid to swap.
                    </>
                  ) : (
                    <>
                      Tap another kid to swap with <b className="font-bold text-ink">{first}</b>.
                    </>
                  )
                ) : (
                  <>
                    Tap a court kid to swap <b className="font-bold text-ink">{first}</b> on.
                  </>
                )
              }
              pair={
                pair && planned
                  ? {
                      n: pair.i + 1,
                      text: planned.off_player_id
                        ? `${chrome.firstName(planned.off_player_id)} → ${chrome.firstName(planned.on_player_id)}`
                        : `On → ${chrome.firstName(planned.on_player_id)}`,
                      where: pair.where ?? undefined,
                      hot: dueNow,
                      onMake: () => makeOnePair(pair.i),
                      disabled: pending,
                    }
                  : null
              }
              extra={foulRow}
              actions={actions}
              columns={actions.length}
              onClose={() => setSelectedId(null)}
            />
          );
        })()
      : null;

  // The sub's due: the bar's one job is to make it.
  const dueBar =
    dueNow && sheetPairs.length > 0 ? (
      <div className="grid grid-cols-[minmax(0,1fr)_84px] gap-[8px]">
        <button
          type="button"
          data-testid="bar-make-all"
          onClick={makeAllPairs}
          disabled={pending}
          aria-label={sheetPairs.length === 1 ? "Make this swap" : `Make all ${sheetPairs.length} swaps`}
          aria-describedby="bar-make-all-who"
          className={barButton("hot")}
        >
          {sheetPairs.length === 1 ? "Make this swap" : `Make all ${sheetPairs.length} swaps`}
          <span id="bar-make-all-who" className={`${BAR_SMALL} max-w-full truncate`}>
            {sheetPairs.map((sp) => sp.onName).join(", ")} on · send them to the table now
          </span>
        </button>
        <button type="button" onClick={openPairs} aria-label="Pairs: edit one" className={barButton("outlined")}>
          Pairs
          <span className={BAR_SMALL}>see each</span>
        </button>
      </div>
    ) : null;

  const scoringOffBar = (
    <p className="flex min-h-[58px] items-center px-[2px] text-[0.8125rem] text-ink-mute">
      <span>
        <b className="block font-display stretch-75 text-[1.125rem] font-extrabold text-ink">{teamName}</b>
        Tap any kid for swaps, fouls and player actions.
      </span>
    </p>
  );
  const scoreBugProps = {
    teamName,
    opponentName,
    teamPoints,
    opponentPoints,
    periodLetter,
    currentPeriod: base.currentPeriod,
    periodCount: ageGroup.periodCount,
    clockReadout,
    running,
    isPreGame: isPreTipoff,
    // Full time reads FT from the last hooter, not "running".
    isFinished,
    atHooter,
    breakName,
    trackScoring,
    threePointers,
  };
  const shellBar = isPreTipoff ? (
    <div className="flex flex-col gap-[6px]">
      <WalkthroughOffer storageKey="basketball-walkthrough-seen" steps={walkthroughSteps} />
      <StartBarButton label={`Start ${periodLetter}1`} onClick={() => setStartConfirmOpen(true)} disabled={pending} />
    </div>
  ) : (
    kidBar ??
    dueBar ??
    (trackScoring ? (
      <BasketballScoreBug
        {...scoreBugProps}
        part="bar"
        onTeamScore={canScore ? (n) => setScorerPoints(n) : undefined}
        onOpponentScore={canScore ? opponentScore : undefined}
      />
    ) : (
      scoringOffBar
    ))
  );
  const shellHeader = (
    <BasketballScoreBug
      {...scoreBugProps}
      part="header"
      subDue={subDueSaid}
      onClockTap={isPeriodActive ? () => (atHooter ? setEndConfirmOpen(true) : setClockMenuOpen(true)) : undefined}
      clockPulseKey={base.periodEnded ? `end-${base.currentPeriod}` : null}
      onScores={
        trackScoring && !isPreTipoff
          ? () => {
              setSelectedId(null);
              chrome.openScores();
            }
          : undefined
      }
    />
  );

  const roundWord = game.round_number != null ? `Round ${game.round_number}` : null;
  const sportLine = `${getSportConfig("basketball").shortName} ${ageGroup.id}`;
  const topSubline = isPreTipoff
    ? [roundWord, game.location].filter(Boolean).join(" · ") || sportLine
    : [roundWord, sportLine].filter(Boolean).join(" · ");
  const whoRuns = auth.kind === "token" ? "Game-day link" : isAdmin ? "Team admin" : "Game manager";

  // ⋯ → Edit lineup before the tip-off: back to the picker with the lineup
  // as set (reopenLineup puts it in the draft and takes the lineup out).
  function handleEditLineup() {
    setError(null);
    void reopenLineup(auth, game.id)
      .catch(() => ({ success: false as const, error: "Couldn't open the lineup — try again." }))
      .then((result) => {
        if (!result.success) {
          setError(result.error ?? "Couldn't open the lineup — try again.");
          return;
        }
        router.refresh();
      });
  }

  return (
    <div ref={liveRootRef} className="space-y-3">
      {isFinished ? (
        <>
          {/* Full time and the finished game keep their page: the top
              bar, the score, then the review or the summary. */}
          <LiveTopBar onHelp={chrome.openHelp} exitHref={exitHref} game={game} isLive />
          {error && <InlineAlert kind="danger">{error}</InlineAlert>}
          <BasketballScoreBug {...scoreBugProps} part="header" clockPulseKey={`end-${base.currentPeriod}`} />
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
        </>
      ) : (
        <LiveShell
          top={
            <LiveTopBar
              exitHref={exitHref}
              game={game}
              isLive={!isPreTipoff}
              onMenu={() => {
                // One sheet at a time: the kid is put down.
                setSelectedId(null);
                setMenuOpen(true);
              }}
              subline={topSubline}
            />
          }
          banners={bannersEl}
          header={shellHeader}
          undo={chrome.undoStrip({
            show: isPeriodActive,
            onUndo: undoNamedScore,
            onUndoFoul: (f) => f.player_id && takeBackFoul(f.player_id),
            disabled: pending,
            plain: true,
          })}
          info={infoEl}
          field={fieldEl}
          bench={benchEl}
          bar={shellBar}
          toast={isPeriodActive ? chrome.toast : null}
        />
      )}

      {/* ⋯: late arrival, the sub interval, scores, the tour, feedback, the
          game-day link, Restart and (before the tip-off) Edit lineup. */}
      <LiveGameMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        auth={auth}
        gameId={game.id}
        game={game}
        isAdmin={isAdmin}
        subline={[roundWord, whoRuns].filter(Boolean).join(" · ")}
        finished={base.finalised}
        lateCandidates={lateArrivalCandidates}
        onLateArrival={addLateArrival}
        latePending={pending}
        settings={
          !isFinished && subIntervalSeconds != null
            ? { summary: settingsSummary(subIntervalSeconds, game.on_field_size, "court"), subIntervalSeconds }
            : undefined
        }
        onScores={!isPreTipoff ? chrome.openScores : undefined}
        trackScoring={trackScoring}
        endPeriod={isPeriodActive ? { label: endWords.label, description: endWords.description, onSelect: openEndPeriod } : undefined}
        onWalkthrough={chrome.openHelp}
        onEditLineup={isPreTipoff ? handleEditLineup : undefined}
      />

      {/* The planned sub, pair by pair (the info line, or the due bar's Pairs). */}
      {pairsOpen && sheetPairs.length > 0 && isPeriodActive && (
        <PairsSheet
          pairs={sheetPairs}
          due={dueNow}
          msUntilDue={subsDone ? null : msUntilDue}
          periodWord={periodWord.charAt(0).toUpperCase() + periodWord.slice(1)}
          onMakeOne={makeOnePair}
          onMakeAll={makeAllPairs}
          pending={pending}
          onClose={() => setPairsOpen(false)}
        />
      )}

      {startConfirmOpen && isPreTipoff && (
        <StartQuarterModal
          quarter={1}
          periodLabel={periodWord}
          cue="ball goes up"
          shortSide={{ playing: state.lineup ? basketballOnCourt(state.lineup).length : 0, size: game.on_field_size, min: ageGroup.minOnFieldSize }}
          loading={pending}
          onStart={() => {
            setStartConfirmOpen(false);
            startFirstPeriod();
            void hapticTap("medium");
          }}
          onCancel={() => setStartConfirmOpen(false)}
        />
      )}

      {clockMenuOpen && (
        <ClockMenu
          sport="basketball"
          periodAbbr={`${periodLetter}${base.currentPeriod}`}
          running={running}
          onPause={toggleClock}
          onResume={toggleClock}
          onEndEarly={isPeriodActive ? () => setEndConfirmOpen(true) : undefined}
          onClose={() => setClockMenuOpen(false)}
        />
      )}

      {endConfirmOpen && (
        <ManualEndQuarterConfirm
          quarter={base.currentPeriod}
          elapsedMs={elapsedMs}
          periodMs={periodMs}
          onConfirm={(full) => {
            setEndConfirmOpen(false);
            // The time played, or (the game played on while the app's
            // clock sat paused) the whole period: the coach's choice. It
            // used to be the whole period, silently (round 3, 24 Oct 2026).
            endPeriodAt(full ? periodMs : Math.min(clockAt(Date.now()), periodMs));
          }}
          onCancel={() => setEndConfirmOpen(false)}
          sport="basketball"
          clock={atHooter ? "hooter" : running ? "running" : "paused"}
          periodLabel={periodWord}
        />
      )}

      {breakScorerPicker}

      {actionPlayer && (
        <LockModal
          player={actionPlayer}
          currentLock={actionHeld}
          // The kid's line (on court) for the Switch hint, and their lent
          // minutes, as AFL's sheet has.
          currentLine={actionLine ? spotName(actionLine) : null}
          isInjured={injuredSet.has(actionPlayer.id)}
          wentHome={wentHomeSet.has(actionPlayer.id)}
          isLoaned={loanedSet.has(actionPlayer.id)}
          seasonLoanMins={chrome.loanMinutes(actionPlayer.id).seasonLoanMins}
          squadLoanMins={chrome.loanMinutes(actionPlayer.id).squadLoanMins}
          outForGameNote={
            fouledOutSet.has(actionPlayer.id)
              ? `Fouled out — ${ageGroup.foulOutAt} fouls. Out for the rest of the game, and skipped by the sub rotation.`
              : undefined
          }
          outForGameActions={
            // A mistaken fifth foul isn't final (UX audit 23 Oct 2026, P1):
            // take it back and they're back in the game. A kid marked out
            // by hand (fewer fouls) just comes back.
            fouledOutSet.has(actionPlayer.id)
              ? [
                  (state.fouls[actionPlayer.id] ?? 0) >= ageGroup.foulOutAt
                    ? {
                        label: "Take back the last foul",
                        hint: `Back to ${(state.fouls[actionPlayer.id] ?? 0) - 1} of ${ageGroup.foulOutAt}, and back in the game`,
                        testId: "basketball-undo-foul-out",
                        onClick: () => {
                          const pid = actionPlayer.id;
                          setActionPlayerId(null);
                          // The optimistic writers, in order in the game lane: the
                          // foul comes off, then the kid is back in the game.
                          writeFoul(pid, true);
                          markInjured(pid, false);
                        },
                      }
                    : {
                        label: "Not fouled out",
                        hint: "Back in the game",
                        testId: "basketball-undo-foul-out",
                        onClick: () => {
                          const pid = actionPlayer.id;
                          setActionPlayerId(null);
                          markInjured(pid, false);
                        },
                      },
                ]
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
            if (injuredSet.has(pid)) markInjured(pid, false);
            else startLeaving(pid, "injured");
          }}
          onWentHome={() => {
            const pid = actionPlayer.id;
            setActionPlayerId(null);
            startLeaving(pid, "went_home");
          }}
          onToggleLoan={() => {
            const pid = actionPlayer.id;
            setActionPlayerId(null);
            if (loanedSet.has(pid)) setLoan(pid, false);
            else startLeaving(pid, "lent");
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
                  move(pid, null, otherLine[actionLine]!);
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
                            const input = { player_id: pid, duration_ms: 0, ...at() };
                            write("recordBasketballSitOut", [auth, game.id, input], sitOutEvent(input));
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
                            else leaveNow(pid, "sitting_out");
                          },
                        },
                      ]),
                  ...(trackFouls && !fouledOutSet.has(actionPlayer.id) && (state.fouls[actionPlayer.id] ?? 0) < ageGroup.foulOutAt
                    ? [
                        {
                          label: "Add a foul",
                          hint: `${state.fouls[actionPlayer.id] ?? 0} of ${ageGroup.foulOutAt} so far`,
                          testId: "basketball-add-foul",
                          onClick: () => {
                            const pid = actionPlayer.id;
                            setActionPlayerId(null);
                            foul(pid);
                          },
                        },
                      ]
                    : []),
                  ...(trackFouls && (state.fouls[actionPlayer.id] ?? 0) >= 2
                    ? [
                        {
                          label: "Clear fouls",
                          hint: `Takes back all ${state.fouls[actionPlayer.id]}`,
                          testId: "basketball-clear-fouls",
                          onClick: () => {
                            const pid = actionPlayer.id;
                            const n = state.fouls[pid] ?? 0;
                            setActionPlayerId(null);
                            for (let i = 0; i < n; i++) writeFoul(pid, true);
                          },
                        },
                      ]
                    : []),
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
                    // One tap was final; it asks first (UX audit 23 Oct 2026).
                    confirm: `${chrome.firstName(actionPlayer.id)} is out for the rest of the game.`,
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
            .filter((id) => canComeOn(id))
            .map((id) => playerById.get(id))
            .filter((p): p is Player => Boolean(p))
            .map((p) => ({ id: p.id, name: p.full_name, jerseyNumber: p.jersey_number }))}
          emptyMessage="Nobody on the bench can come on."
          onPick={(pid) => {
            const line = fillLine;
            setFillLine(null);
            // A deliberate pick: straight on, with AFL's toast.
            sub(null, pid, line, true);
            chrome.swapped(null, pid);
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
              onPickReplacement={(rid) => leaveAndReplace(leaving.playerId, rid, leaving.line, leaving.reason)}
              onSkipReplacement={() => {
                const { playerId, reason } = leaving;
                setLeaving(null);
                leaveNow(playerId, reason);
              }}
              // Cancel on the sheet a fifth foul opened kept the foul and left
              // the kid on court with 5F, not out (usability pass, 26 Oct
              // 2026). A cancelled foul-out is a mistaken foul: it comes off.
              cancelLabel={leaving.fromFoul ? "Cancel, and take back the foul" : undefined}
              onCancel={() => {
                const { playerId, fromFoul } = leaving;
                setLeaving(null);
                if (fromFoul) undoFoul(playerId);
              }}
            />
          );
        })()}

      {chrome.overlays}

      <LongPressHint enabled={isPeriodActive && !selectedId} />
    </div>
  );
}

