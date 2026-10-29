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
// in the one game lane, so the event log keeps the coach's order. The
// in-game writes are optimistic (useOptimisticEvents): a basket, an undo,
// a foul or a sub shows the moment it's tapped and the server's copy
// takes its place, as AFL's store does. The shared live chrome
// (useLiveChrome) is AFL's: the undo strip says what was recorded, a
// tap-tap sub asks first and toasts, the long-press sheet knows the
// kid's line and lent minutes (UX audit 23 Oct 2026, "Drift from AFL").

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { NextSubCard } from "@/components/live/NextSubCard";
import { LiveGameSettingsButton } from "@/components/live/LiveGameSettingsButton";
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
import { UNDO_GONE_MESSAGE, UNDO_MISSING_MESSAGE, undoTap } from "@/lib/live/undoTarget";
import { announceLiveNotice } from "@/lib/live/liveSync";
import { playSubDueBeep, useSubDueAudioUnlock } from "@/lib/live/subDueBeep";
import { useScrollToTopOnFinish } from "@/lib/live/useScrollToTopOnFinish";
import { hapticTap } from "@/lib/haptics";
import { computePeriodClockMs } from "@/lib/live/periodClock";
import { clockPauseInput } from "@/lib/live/clockPause";
import { queuedStartClockMark, useEventPeriodPause } from "@/lib/live/useClockPause";
import { resolveSubAnchorElapsed } from "@/lib/live/subAnchor";
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
import { BasketballCourt } from "./BasketballCourt";
import { BasketballBench } from "./BasketballBench";
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
    reason: "injured" | "fouled_out" | "sitting_out";
    /** Opened by the foul that reached the limit: Cancel takes it back. */
    fromFoul?: boolean;
  } | null>(null);
  const [subAckKey, setSubAckKey] = useState<string | null>(null);
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
  const chrome = useLiveChrome({
    teamName,
    opponentName,
    playersById: playerById,
    seasonLoanMinutes,
    events,
    openElapsedMs: isPeriodActive ? elapsedMs : null,
  });

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
  const nextSubs = useMemo(() => {
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

  /** `manual`: made by hand, off the rotation's cadence, so the sub clock doesn't restart (AFL's rule). */
  function sub(offId: string | null, onId: string, line?: BasketballLine, manual = false) {
    setError(null);
    const input = { off_player_id: offId, on_player_id: onId, ...(line ? { line } : {}), ...(manual ? { manual } : {}), ...at() };
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
    else chrome.showToast(`${nextSubs.length} subs made`, undo);
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
          // A bench kid into an empty spot asks first, as AFL's does.
          chrome.confirmSwap({ offId: null, onId: kid, spotName: spotName(line), onConfirm: () => sub(null, kid, line, true) });
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
      // A court kid and a bench kid: AFL's confirm, then the toast.
      const off = aLine ? first : pid;
      const on = aLine ? pid : first;
      if (!canComeOn(on)) return;
      chrome.confirmSwap({ offId: off, onId: on, spotName: spotName((aLine ?? bLine)!), onConfirm: () => sub(off, on, undefined, true) });
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
  // Takes back the basket the strip names (this phone's last), or with
  // none named the latest on screen — never whatever the other phone
  // scored since (UX round 2).
  const undoScore = () => {
    const tap = undoTap(events, BASKETBALL_SCORE_EVENT_TYPES, chrome.namedScoreKey);
    // Its score was taken back on the other phone, or never saved (a tap
    // offline that didn't get through): nothing to write, and never
    // another score in its place.
    if (tap.kind === "gone" || tap.kind === "missing") {
      chrome.undone();
      announceLiveNotice(tap.kind === "gone" ? UNDO_GONE_MESSAGE : UNDO_MISSING_MESSAGE);
      return;
    }
    if (tap.kind !== "undo") return;
    setError(null);
    write("undoBasketballScore", [auth, game.id, tap.target], tap.optimistic);
    chrome.undone();
  };

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

  function markInjured(pid: string, injured: boolean, reason?: string) {
    setError(null);
    const input = { player_id: pid, injured, ...at(), ...(reason ? { reason } : {}) };
    write("markInjury", [auth, game.id, input], liveEvents.injury(input));
  }
  /** A kid leaves the court (hurt, fouled out, sat out): pick who comes on. */
  function startLeaving(pid: string, reason: "injured" | "fouled_out" | "sitting_out", fromFoul = false) {
    const line = state.lineup ? basketballLineOf(state.lineup, pid) : null;
    if (isPeriodActive && line && swappableBench.length > 0) {
      setLeaving({ playerId: pid, line, reason, fromFoul });
      return;
    }
    leaveNow(pid, reason);
  }
  function leaveNow(pid: string, reason: "injured" | "fouled_out" | "sitting_out") {
    if (reason === "sitting_out") {
      setError(null);
      const input = { player_id: pid, duration_ms: SIT_OUT_MS, ...at() };
      write("recordBasketballSitOut", [auth, game.id, input], sitOutEvent(input));
    } else {
      markInjured(pid, true, reason === "fouled_out" ? "fouled_out" : undefined);
    }
  }
  function leaveAndReplace(pid: string, replacementId: string, line: BasketballLine, reason: "injured" | "fouled_out" | "sitting_out") {
    setLeaving(null);
    // In order, in the one game lane: the kid leaves, then who comes on.
    leaveNow(pid, reason);
    sub(pid, replacementId, line);
    chrome.swapped(pid, replacementId);
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
    write("recordBasketballFoul", [auth, game.id, input], foulEvent(input));
  }
  function foul(pid: string) {
    setSelectedId(null);
    // Fouls stop at the limit. A sixth used to count, so taking one back
    // said "Back to 5 of 5, and back in the game".
    if ((state.fouls[pid] ?? 0) >= ageGroup.foulOutAt) return;
    const count = (state.fouls[pid] ?? 0) + 1;
    writeFoul(pid, false);
    // The limit: out for the game. The coach picks who comes on.
    if (count >= ageGroup.foulOutAt && !fouledOutSet.has(pid)) startLeaving(pid, "fouled_out", true);
  }
  const undoFoul = (pid: string) => writeFoul(pid, true);

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
      if (s.off_player_id) swapOffs.set(s.off_player_id, i + 1);
      const pos = s.off_player_id ? state.lineup?.slots?.[s.off_player_id] : null;
      swapOns.set(s.on_player_id, { pair: i + 1, line: s.line, positionLabel: pos ? POSITION_LABEL[pos] : null });
    });
  }
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
  // The break has the shared Start bar instead of the scorebug.
  const hasStickyBottom = !isPreTipoff && !isAtBreak;

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

  return (
    // No bottom padding: LiveStickyScoreBar reserves its own height with
    // a measured in-flow spacer, and the player dock floats over the
    // page as AFL's does (Steve 2026-10-21: "Some blank space when
    // scrolling").
    <div ref={liveRootRef} className="space-y-3">
      <LiveTopBar
        exitHref={exitHref}
        game={game}
        isLive={base.currentPeriod > 0}
        // The sub card is the alert while it has pairs (SubDue.tsx); the
        // banner speaks only for a due sub with nothing to suggest.
        banner={
          isPeriodActive && subDueBannerShows(subDue.due, nextSubs.length, (state.lineup?.bench ?? []).some((id) => canComeOn(id))) && subAckKey !== subDueKey ? (
            <SubDueBanner onAcknowledge={() => setSubAckKey(subDueKey)} />
          ) : null
        }
      />

      {error && <InlineAlert kind="danger">{error}</InlineAlert>}

      {isPeriodActive && chrome.toast}

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
            const pos = s.off_player_id ? state.lineup?.slots?.[s.off_player_id] : null;
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
          onApplyAll={applyAllSubs}
          onApplyOne={(i) => {
            const s = nextSubs[i];
            if (!s) return;
            sub(s.off_player_id, s.on_player_id, s.line);
            chrome.swapped(s.off_player_id, s.on_player_id);
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
            pointsByPlayer={trackScoring ? playerPoints : undefined}
            positionLabels={positionLabels}
          />
          <BasketballBench
            bench={lineup.bench}
            playersById={playerById}
            onTap={(pid) => handleTap(pid, null)}
            onLongPress={isPeriodActive ? setActionPlayerId : undefined}
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
            pointsByPlayer={trackScoring ? playerPoints : undefined}
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
        trackScoring={trackScoring}
        candidates={lateArrivalCandidates}
        onLateArrival={addLateArrival}
        lateArrivalPending={pending}
        isAdmin={isAdmin}
        finished={base.finalised}
        auth={auth}
        gameId={game.id}
        // The sub interval mid-game, as AFL's.
        settings={
          !isFinished && subIntervalSeconds != null ? (
            <LiveGameSettingsButton auth={auth} gameId={game.id} subIntervalSeconds={subIntervalSeconds} />
          ) : null
        }
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
                        className="flex-1 rounded-sm bg-brand-600 py-3 font-mono text-base font-bold uppercase tracking-micro text-white shadow-card transition-colors duration-fast ease-out-quart hover:bg-brand-500 disabled:opacity-60"
                      >
                        +{n}
                      </button>
                    ))}
                  </div>
                )}
                {/* Fouls step both ways (Steve 2026-10-22: "Need to be able to
                    undo fouls in basketball"): − takes the last one back. */}
                {trackFouls && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      data-testid="basketball-unfoul"
                      onClick={() => {
                        const pid = selectedPlayer.id;
                        setSelectedId(null);
                        undoFoul(pid);
                      }}
                      disabled={pending || (state.fouls[selectedPlayer.id] ?? 0) === 0}
                      aria-label={`Take back a foul from ${selectedPlayer.full_name}`}
                      className="min-h-[44px] min-w-[44px] rounded-sm border border-due/50 bg-surface font-mono text-base font-bold text-due transition-colors duration-fast ease-out-quart hover:bg-due/10 disabled:opacity-40"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      data-testid="basketball-foul"
                      onClick={() => foul(selectedPlayer.id)}
                      disabled={pending || (state.fouls[selectedPlayer.id] ?? 0) >= ageGroup.foulOutAt}
                      className="min-h-[44px] flex-1 rounded-sm border border-due/50 bg-due-tint py-2.5 font-mono text-sm font-bold uppercase tracking-micro text-due transition-colors duration-fast ease-out-quart hover:bg-due/10 disabled:opacity-60"
                    >
                      + Foul ({state.fouls[selectedPlayer.id] ?? 0} of {ageGroup.foulOutAt})
                    </button>
                  </div>
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
              ? { teamId: auth.kind === "team" && isAdmin ? auth.teamId : null }
              : undefined
          }
          scorebug={
            <BasketballScoreBug
              teamName={teamName}
              opponentName={opponentName}
              teamPoints={teamPoints}
              opponentPoints={opponentPoints}
              periodLetter={periodLetter}
              currentPeriod={base.currentPeriod}
              periodCount={ageGroup.periodCount}
              clockReadout={clockReadout}
              running={running}
              isPreGame={isPreTipoff}
              // Full time reads FT from the last hooter, not "running".
              isFinished={isFinished}
              atHooter={atHooter}
              breakName={breakName}
              trackScoring={trackScoring}
              threePointers={threePointers}
              onTeamScore={canScore ? (n) => setScorerPoints(n) : undefined}
              onOpponentScore={canScore ? opponentScore : undefined}
              onClockTap={isPeriodActive ? () => (atHooter ? setEndConfirmOpen(true) : setClockMenuOpen(true)) : undefined}
              clockPulseKey={base.periodEnded ? `end-${base.currentPeriod}` : null}
            />
          }
          // In play only: at full time the review's own Undo fixes a miscount.
          undoStrip={chrome.undoStrip({
            show: isPeriodActive && (teamPoints > 0 || opponentPoints > 0),
            onUndo: undoScore,
            disabled: pending,
          })}
        />
      )}

      {startConfirmOpen && (
        <StartQuarterModal
          quarter={1}
          periodLabel={periodWord}
          cue="ball goes up"
          shortSide={{ playing: state.lineup ? basketballOnCourt(state.lineup).length : 0, size: game.on_field_size, min: ageGroup.minOnFieldSize }}
          loading={pending}
          onStart={() => {
            setStartConfirmOpen(false);
            startFirstPeriod();
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
