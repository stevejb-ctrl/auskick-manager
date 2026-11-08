"use client";

// ─── TouchLiveGame ───────────────────────────────────────────
// The touch and Oztag live game, on live v3's shell (LiveShell, Phase
// 10), the one AFL, netball, rugby and basketball use, so a coach who runs
// both sports finds the same screen: the top bar with ⋯ (LiveGameMenu),
// the light score header (tap it for Scores and fixes), the info line for
// the next sub (tap it for the pairs), the kids on the grass (FieldLines,
// a line a lane, a KidTile each), the bench (KidBench, + Late), and the
// bar: + TRY and theirs (+T, "+2 girl"), a picked kid's KidBar, or "Make
// all N swaps" when the sub is due. Before the start the bar's Start H1
// starts the game; half time and full time keep their screens. What's the
// touch family's own (.planning/FOUR-SPORTS-PLAN.md):
//
//   - Lanes are optional: the team's How we play strategy plays no
//     positions (one field) or middles, links and wings.
//   - Rolling subs through the interchange, unlimited. No interchange
//     after a turnover until the next touch, so the sub-due banner says
//     to make the change next time you have the ball.
//   - A mixed team's rule: suggestions keep the boys' cap (a boy comes on
//     for a boy, a girl for a girl). A hand sub that would break it asks
//     first (AFL's SwapConfirmDialog: "Swap anyway / Pick someone
//     else": the one hand sub that still asks), and with a kid picked,
//     the kids whose swap would break it dim. A side that breaks it anyway
//     pins "4 boys on · rule 3" in hi-vis, with a Fix, under the top bar
//     until it's fixed, and the suggestions fix
//     the mix first. Short of girls the field shrinks ("You can field
//     4: 3 boys and 1 girl"), recorded as roster_shrink.
//   - Tries are 1; on an Oztag mixed team a girl's try is 2, and the
//     opponent's chips are +T and +2 (girl).
//
// Every write goes through the shared write queue (registerLiveActions)
// in the one game lane, so the event log keeps the coach's order. In-game
// writes are optimistic (useOptimisticEvents): a try, an undo or a sub
// shows the moment it's tapped, as AFL's store does. The shared live
// chrome (useLiveChrome) is AFL's undo strip flash, swap confirm (with
// the mixed rule's warning on it) and toast, and lent minutes. Who
// counts as a girl or a boy is never drawn on a tile.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useOtherPhoneScores } from "@/components/live/useOtherPhoneScores";
import { WENT_HOME_REASON } from "@/lib/live/wentHome";
import { LiveTopBar } from "@/components/live/LiveTopBar";
import { LiveShell } from "@/components/live/LiveShell";
import { LiveGameMenu, settingsSummary } from "@/components/live/LiveGameMenu";
import { KidTile, KidSlot, type KidOutKind } from "@/components/live/KidTile";
import { KidBench } from "@/components/live/KidBench";
import { FieldLines, type FieldLine } from "@/components/live/FieldLines";
import { InfoLine } from "@/components/live/InfoLine";
import { PairsSheet, type SheetPair } from "@/components/live/PairsSheet";
import { KidBar, TimeSplit } from "@/components/live/KidBar";
import { StartBarButton } from "@/components/live/StartBarButton";
import { WalkthroughOffer } from "@/components/live/WalkthroughOffer";
import { buildSharedWalkthroughSteps } from "@/components/live/WalkthroughModal";
import { LateArrivalMenu } from "@/components/live/LateArrivalMenu";
import { useSquadNames } from "@/components/live/SquadNames";
import { barButton, BAR_SMALL } from "@/components/live/barButtons";
import { kidWords, type KidOut, type KidSubRole, type KidWords } from "@/lib/live/kidWords";
import { pctOfGame } from "@/lib/live/minGameTime";
import { formatMinSec } from "@/lib/sports/netball/fairness";
import { reopenTouchLineup } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/touch-actions";
import { BreakScoreEditor } from "@/components/quarter-break/BreakScoreEditor";
import { ManualEndQuarterConfirm } from "@/components/live/ManualEndQuarterConfirm";
import { ClockMenu } from "@/components/live/ClockMenu";
import { StartQuarterModal } from "@/components/live/StartQuarterModal";
import { LongPressHint } from "@/components/live/LongPressHint";
import { LockModal } from "@/components/live/LockModal";
import { InjuryReplacementModal, type InjuryReplacementCandidate } from "@/components/live/InjuryReplacementModal";
import { useLiveChrome } from "@/components/live/useLiveChrome";
import { undoSwaps } from "@/lib/live/liveChrome";
import { SlotFillSheet } from "@/components/ui/SlotFillSheet";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useOptimisticEvents } from "@/lib/live/useOptimisticEvents";
import { liveEvents } from "@/lib/live/optimisticEvents";
import { undoTargetText, UNDO_GONE_MESSAGE, UNDO_MISSING_MESSAGE, undoTap } from "@/lib/live/undoTarget";
import { announceLiveNotice } from "@/lib/live/liveSync";
import { getSportConfig } from "@/lib/sports/registry";
import { isGirlsTry, TOUCH_SCORE_EVENT_TYPES, touchTryEventType, touchTryWhat } from "@/lib/sports/touch/scoreEvents";
import { playSubDueBeep, useSubDueAudioUnlock } from "@/lib/live/subDueBeep";
import { useScrollToTopOnFinish } from "@/lib/live/useScrollToTopOnFinish";
import { hapticTap } from "@/lib/haptics";
import { computePeriodClockMs } from "@/lib/live/periodClock";
import { clockPauseInput } from "@/lib/live/clockPause";
import { queuedStartClockMark, useEventPeriodPause } from "@/lib/live/useClockPause";
import { resolveSubAnchorElapsed } from "@/lib/live/subAnchor";
import { presentPlayerIds } from "@/lib/live/presentPlayers";
import { countTags, keepsComposition, rollingSubDue } from "@/lib/live/rollingSubs";
import type { Game, GameEvent, LiveAuth, MixedGroup, Player } from "@/lib/types";
import type { TouchSport } from "@/lib/sports";
import { normalizeTouchLineup, touchLineOf, touchOnField, type TouchLineup } from "@/lib/sports/touch/lineup";
import { replayTouchGame, touchCanPlay, touchGameMs, type TouchGameState } from "@/lib/sports/touch/replay";
import { benchInTouchLineup, swapInTouchLineup } from "@/lib/sports/touch/live";
import {
  suggestTouchSubs,
  touchFieldPlan,
  touchMixFix,
  touchShapeFor,
  touchShapeIdOf,
  type TouchMixed,
  type TouchPrefs,
  type TouchSeasonBalance,
} from "@/lib/sports/touch/suggest";
import { mixedConstraints, mixedFieldBreach, mixedFieldMessage, mixedTags } from "@/lib/sports/touch/mixed";
import { TOUCH_LANES, TOUCH_LINES, type MixedRule, type TouchAgeGroupConfig, type TouchLine, type TouchStrategy } from "@/lib/sports/touch/types";
import { TouchScoreBug } from "./TouchScoreBug";
import { TouchFullTimeReview, TouchGameSummaryCard } from "./TouchFullTime";
import { TouchBreak } from "./TouchBreak";
import { TOUCH_LINE_LABEL, TOUCH_LINE_ONE, TOUCH_SUB_DUE_HINT, touchOpponentChips, touchTryChip } from "./touchWords";

interface TouchLiveGameProps {
  auth: LiveAuth;
  /** Touch or Oztag: the break's words come from its config. */
  sport: TouchSport;
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
  /** Lent minutes in the season's other games, for the long-press sheet. */
  seasonLoanMinutes?: Record<string, number>;
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function TouchLiveGame({
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
  girlsTryDouble,
  mixedRule = null,
  mixedGroups,
  events: serverEvents,
  strategy,
  prefs,
  season,
  isAdmin,
  exitHref,
  seasonLoanMinutes,
}: TouchLiveGameProps) {
  const opponentName = game.opponent || "Opponent";
  const playerById = useMemo(() => new Map(squad.map((p) => [p.id, p])), [squad]);
  const mixed: TouchMixed | undefined = useMemo(
    () => (mixedRule ? { rule: mixedRule, groupOf: (id: string) => mixedGroups?.[id] ?? null } : undefined),
    [mixedRule, mixedGroups],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The server's events, then the writes it hasn't returned yet.
  const { events, write } = useOptimisticEvents(serverEvents, { gameId: game.id, onError: setError });
  // Every write is optimistic, so nothing here waits on a save.
  const pending = false;
  const [clockMenuOpen, setClockMenuOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const [pickingScorer, setPickingScorer] = useState(false);
  const [actionPlayerId, setActionPlayerId] = useState<string | null>(null);
  const [fillLine, setFillLine] = useState<TouchLine | null>(null);
  const [leaving, setLeaving] = useState<{ playerId: string; line: TouchLine; wentHome?: boolean } | null>(null);
  const [subAckKey, setSubAckKey] = useState<string | null>(null);
  // Live v3's shell: the ⋯ game menu and the pairs sheet (one sheet at a time).
  const [menuOpen, setMenuOpen] = useState(false);
  const [pairsOpen, setPairsOpen] = useState(false);
  const router = useRouter();
  const names = useSquadNames();
  const walkthroughSteps = useMemo(() => buildSharedWalkthroughSteps(), []);
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
  // The summary after Finish opens at the top: the final score and Copy
  // for group chat, not the review's scroll (round 2, 24 Oct 2026).
  useScrollToTopOnFinish(base.finalised, liveRootRef);

  // ── Clock: the shared period clock, its pause a game event ──
  // Game ms since the period started, less real time paused, scaled by
  // the clock multiplier, held at the period's length: the phone waits
  // there for the referee's whistle. The pause is the period's latest
  // clock_pause event (lib/live/clockPause), so a reload or a second
  // phone keeps it.
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
  useOtherPhoneScores(events, TOUCH_SCORE_EVENT_TYPES, { teamName: teamName, opponentName: game.opponent || "Opponent" });
  const chrome = useLiveChrome({
    auth,
    gameId: game.id,
    teamName,
    opponentName,
    playersById: playerById,
    seasonLoanMinutes,
    events,
    openElapsedMs: isPeriodActive ? elapsedMs : null,
    toastLook: "ink",
  });
  // The clock as the write lands: a confirmed swap is stamped when the
  // coach taps Confirm, not when the sheet opened (AFL reads its clock
  // at confirm too).
  const elapsedRef = useRef(elapsedMs);
  elapsedRef.current = elapsedMs;
  const at = () => ({ quarter: base.currentPeriod, elapsed_ms: elapsedRef.current });

  // ── The game now: every kid's time so far, open stints credited ──
  const state: TouchGameState = useMemo(
    () => (isPeriodActive ? replayTouchGame(events, { nowMs: elapsedSecond * 1000 }) : base),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, isPeriodActive, elapsedSecond, base],
  );
  const absNowMs = state.completedPeriodMs + (isPeriodActive ? elapsedMs : 0);
  const injuredSet = useMemo(() => new Set(state.injuredIds), [state.injuredIds]);
  const wentHomeSet = useMemo(() => new Set(state.wentHomeIds), [state.wentHomeIds]);
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
    const input = { on_field_size: legal, quarter: base.currentPeriod, elapsed_ms: isPeriodActive ? elapsedMs : base.periodElapsedMs };
    write("recordTouchFieldSize", [auth, game.id, input], liveEvents.fieldSize(input));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldPlan?.size, fieldSize, base.finalised, isPreStart, base.currentPeriod]);

  // Half-time is TouchBreak, the shared break screen (below); this
  // screen shows the lineup in play.
  const lineup: TouchLineup | null = state.lineup;
  const shape = useMemo(
    () => touchShapeFor(ageGroup, strategy, fieldSize, touchShapeIdOf(lastSetLineup(events))),
    [ageGroup, strategy, fieldSize, events],
  );
  // Places in each lane: the shape's, and an empty place only while the
  // field is short of its size (a field the rule shrank shows none).
  const lineCaps = useMemo(() => {
    const caps = { ...shape.lines };
    if (!lineup) return caps;
    const full = touchOnField(lineup).length >= fieldSize;
    for (const l of TOUCH_LINES) caps[l] = full ? lineup.lines[l].length : Math.max(caps[l], lineup.lines[l].length);
    return caps;
  }, [shape, lineup, fieldSize]);

  // ── Subs ────────────────────────────────────────────────────
  // No sub is due once the clock is out: the phone waits at 0:00 for the
  // whistle, and the Sub due card and OFF badges stayed up through half
  // time and full time (round 2, 24 Oct 2026; AFL hides them after the
  // siren too).
  const periodClockDone = elapsedMs >= periodMs;
  const subsOpen = isPeriodActive && !periodClockDone;
  const anchorMs = useMemo(
    () => (subsOpen ? resolveSubAnchorElapsed(events, base.currentPeriod) : null),
    [events, base.currentPeriod, subsOpen],
  );
  const subDue = rollingSubDue({
    subIntervalMs: subIntervalSeconds != null ? subIntervalSeconds * 1000 : null,
    periodMs,
    anchorMs,
    elapsedMs,
  });
  const msUntilDue = subDue.msUntilDue;
  const nextSubs = useMemo(() => {
    if (!subsOpen) return [];
    // A kid who goes off rests a sub interval before coming back on; an
    // empty place (a kid hurt with nobody on) is filled first.
    const opts = { strategy, prefs, season, mixed, restMs: (subIntervalSeconds ?? 0) * 1000, spots: lineCaps };
    const now = suggestTouchSubs({ state, nowMs: absNowMs, ...opts });
    if (now.length > 0 || msUntilDue === null || msUntilDue <= 0) return now;
    // Nothing evens time yet, so show the subs due at the next sub time,
    // as basketball does: kids who just came on need time before anyone
    // on the bench is owed theirs.
    const aheadMs = Math.min(periodMs, elapsedMs + msUntilDue);
    const ahead = replayTouchGame(events, { nowMs: aheadMs });
    return suggestTouchSubs({ state: ahead, nowMs: ahead.completedPeriodMs + aheadMs, ...opts });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subsOpen, state, events, strategy, prefs, season, mixed, periodMs, subIntervalSeconds, lineCaps, msUntilDue !== null && msUntilDue <= 0, Math.floor((msUntilDue ?? 0) / 5000)]);
  const subDueKey = subDue.key === null ? null : `${base.currentPeriod}:${subDue.key}`;
  const subDueShowing = isPeriodActive && subDue.due && nextSubs.length > 0 && subAckKey !== subDueKey;
  useSubDueAudioUnlock();
  // The sub-due beep waits while the who-scored sheet is up (AFL's
  // picker-race guard), and goes once it closes. A kid picked doesn't
  // hold it: a coach who leaves a kid tapped would never hear it.
  const holdForScoring = pickingScorer;
  const subDueShowingRef = useRef(false);
  useEffect(() => {
    if (holdForScoring) return;
    if (subDueShowing && !subDueShowingRef.current) {
      playSubDueBeep();
      void hapticTap("heavy");
    }
    subDueShowingRef.current = subDueShowing;
  }, [subDueShowing, holdForScoring]);
  // The clock reaching 0:00 (it waits there for the referee's whistle)
  // puts a picked kid down, so the bar is the score bar again and the
  // clock's End is in reach (AFL's siren, f75e85a2). Not while the
  // who-scored sheet is up: a try on the whistle still gets its scorer.
  const clockOut = isPeriodActive && elapsedMs >= periodMs;
  useEffect(() => {
    if (clockOut && !holdForScoring) setSelectedId(null);
  }, [clockOut, holdForScoring]);

  // ── Writes ──────────────────────────────────────────────────
  // A period's end and start are optimistic writes too, like every
  // other tap: the break opens at the whistle and the next period starts
  // at the tap, with or without signal. They used to wait on the save,
  // so End H1 with no signal sat on "Applying…" (round 3, 24 Oct 2026).
  const endPeriodAt = useCallback(
    (elapsed: number) => {
      setError(null);
      write(
        "endTouchPeriod",
        [auth, game.id, base.currentPeriod, elapsed],
        liveEvents.periodEnd({ quarter: base.currentPeriod, elapsed_ms: elapsed }),
      );
    },
    [auth, game.id, base.currentPeriod, write],
  );
  function startFirstPeriod() {
    setError(null);
    const mark = queuedStartClockMark(1);
    write("startTouchPeriod", [auth, game.id, 1], liveEvents.periodStart(1));
    if (mark) write("recordClockPause", [auth, game.id, mark], liveEvents.clockPause(mark));
  }

  /**
   * How a swap the coach makes by hand would break the mixed rule ("That
   * puts 4 boys on: the mixed rule allows 3"), or null when it keeps it
   * (or takes a side already over the rule no further out).
   */
  function capWarning(offId: string | null, onId: string): string | null {
    if (!mixed || !state.lineup) return null;
    const on = touchOnField(state.lineup);
    const counts = countTags(on, tags, constraints);
    if (keepsComposition(counts, offId, onId, tags, constraints)) return null;
    const breach = mixedFieldBreach([...on.filter((id) => id !== offId), onId], mixed.rule, mixed.groupOf);
    if (!breach) return null;
    return breach.text.startsWith("No ") ? `That leaves no ${breach.text.slice(3)}` : `That puts ${breach.text}`;
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
  function sub(offId: string | null, onId: string, line?: TouchLine, manual = false) {
    setError(null);
    const input = { off_player_id: offId, on_player_id: onId, ...(line ? { line } : {}), ...(manual ? { manual } : {}), ...at() };
    write("recordTouchSwap", [auth, game.id, input], liveEvents.swap(input));
  }
  /** A lane in the coach's words ("Wings"), or the field when it plays no lanes. */
  const spotName = (line: TouchLine | null | undefined) => (line && line !== "field" ? TOUCH_LINE_LABEL[line] : "the field");
  /**
   * A sub the coach makes by hand happens at once and toasts, with Undo
   * (AFL's). One that would break the mixed rule asks first: "Swap
   * anyway", or "Pick someone else" with the first kid still picked.
   */
  function handSub(offId: string | null, onId: string, line: TouchLine | undefined, reselect: string) {
    const warning = capWarning(offId, onId);
    chrome.manualSwap({
      offId,
      onId,
      spotName: spotName(line ?? (offId ? lineOf(offId) : null)),
      ruleWarning: warning,
      onCancel: warning ? () => setSelectedId(reselect) : undefined,
      run: () => sub(offId, onId, line, true),
      undo: offId ? () => sub(onId, offId, undefined, true) : undefined,
    });
  }
  function move(a: string, b: string | null, zoneB: TouchLine) {
    const zoneA = state.lineup ? touchLineOf(state.lineup, a) : null;
    if (!zoneA) return;
    setError(null);
    const input = { player_a_id: a, zone_a: zoneA, ...(b ? { player_b_id: b } : {}), zone_b: zoneB, ...at() };
    write("recordTouchMove", [auth, game.id, input], liveEvents.move(input));
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
  function lineOf(pid: string): TouchLine | null {
    return lineup ? touchLineOf(lineup, pid) : null;
  }
  const canComeOn = (pid: string) => touchCanPlay(state, pid);

  function handleTap(pid: string, line: TouchLine | null) {
    setError(null);
    if (!lineup) return;
    if (!isPeriodActive) return;

    if (pid === "") {
      if (!line) return;
      if (selectedId) {
        const kid = selectedId;
        if (lineOf(kid)) {
          // A move on the field, straight away (AFL's empty-zone move).
          move(kid, null, line);
          chrome.showToast(`${chrome.firstName(kid)} → ${spotName(line)}`);
        } else if (canComeOn(kid)) handSub(null, kid, line, kid);
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
      // Two on the field trade lanes, straight away (AFL's zone swap).
      move(first, pid, bLine);
      chrome.showToast(`${chrome.firstName(first)} ⇄ ${chrome.firstName(pid)} — swapped`);
    } else if (aLine && !bLine && canComeOn(pid)) handSub(first, pid, undefined, first);
    else if (!aLine && bLine && canComeOn(first)) handSub(pid, first, undefined, first);
    else setSelectedId(pid); // two bench kids: the second is the selection
  }

  // ── Score ───────────────────────────────────────────────────
  // A try goes up the moment it's tapped (optimistic), and the undo strip
  // flashes what was recorded, as AFL's does. Whether ours is a girl's
  // try (2) is the scorer's group; the server decides it the same way
  // (scoreEvents.ts). On the scorebug only in play: the break and full
  // time have their own score editors.
  const canScore = isPeriodActive;
  function recordTry(side: "ours" | "theirs", playerId: string | null, girl: boolean) {
    setError(null);
    const girlsTry = isGirlsTry({ girlsTryDouble, side, playerId, girl, groupOf: (id) => mixed?.groupOf(id) });
    const key = write(
      "recordTouchScore",
      [auth, game.id, { side, player_id: playerId, ...(girl ? { girl: true } : {}), ...at() }],
      liveEvents.score(touchTryEventType(side, girlsTry), side === "ours" ? playerId : null, at()),
    );
    chrome.scored({
      side: side === "ours" ? "us" : "them",
      what: touchTryWhat(girlsTry),
      scorerId: side === "ours" ? playerId : null,
      key,
    });
  }
  function teamScore(scorerId: string | null, girl = false) {
    if (!trackScoring) return;
    setSelectedId(null);
    recordTry("ours", scorerId, girl);
  }
  const opponentScore = (girl: boolean) => recordTry("theirs", null, girl);
  const teamPoints = state.teamScore.points;
  const opponentPoints = state.opponentScore.points;
  const playerTries = state.playerTries;
  // Takes back the try the strip names (this phone's last), or with none
  // named the latest on screen — never whatever the other phone scored
  // since (UX round 2).
  const undoScore = () => {
    const tap = undoTap(events, TOUCH_SCORE_EVENT_TYPES, chrome.namedScoreKey);
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
    write("undoTouchScore", [auth, game.id, tap.target], tap.optimistic);
    chrome.undone();
  };

  // ── Sideline: injuries, loans, late arrivals, holds ─────────
  const swappableBench = useMemo(
    () => (state.lineup?.bench ?? []).filter((id) => canComeOn(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.lineup, state.injuredIds, state.loanedIds],
  );
  // Nobody arrives at a game that's over (AFL's LiveGame filters the same).
  const lateArrivalCandidates = useMemo(() => {
    if (isFinished) return [];
    const placed = new Set(state.lineup ? [...touchOnField(state.lineup), ...state.lineup.bench] : []);
    return squad.filter((p) => !placed.has(p.id));
  }, [squad, state.lineup, isFinished]);
  /** Bench kids who can fill an empty place (or replace `leavingId`) and keep the mixed rule. */
  const keepsRule = useCallback(
    (onId: string, leavingId: string | null) => {
      if (!mixed || !state.lineup) return true;
      const counts = countTags(touchOnField(state.lineup), tags, constraints);
      return keepsComposition(counts, leavingId, onId, tags, constraints);
    },
    [mixed, state.lineup, tags, constraints],
  );

  // A side that breaks the mixed rule (a hand sub the coach swapped
  // anyway): pinned under the top bar until it's fixed, with the subs
  // that fix it (the suggestions lead with the same ones), or, over the
  // boys' cap with no girl to swap in, the boy to take off so the side
  // plays short at the size the rule allows (round 2 usability, 24 Oct
  // 2026: the strip said "nobody on the bench can fix it").
  const breach = useMemo(
    () => (mixed && state.lineup && isPeriodActive ? mixedFieldBreach(touchOnField(state.lineup), mixed.rule, mixed.groupOf) : null),
    [mixed, state.lineup, isPeriodActive],
  );
  const mixFix = useMemo(
    () => (breach ? touchMixFix({ state, nowMs: absNowMs, strategy, prefs, season, mixed }) : { subs: [], off: [] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [breach, state.lineup, state.injuredIds, state.loanedIds, state.locks, strategy, prefs, season, mixed],
  );
  const fixSubs = mixFix.subs;
  const fixOff = mixFix.off;
  const playsShort = state.lineup ? touchOnField(state.lineup).length - fixOff.length : 0;
  function applyFix() {
    if (fixSubs.length === 0 && fixOff.length === 0) return;
    for (const s of fixSubs) sub(s.off_player_id, s.on_player_id, s.line, true);
    if (fixOff.length > 0 && state.lineup) {
      // The subs first, then the boys off with nobody on.
      const swapped = fixSubs.reduce(
        (lu, s) => (s.off_player_id ? swapInTouchLineup(lu, s.off_player_id, s.on_player_id) : lu),
        state.lineup,
      );
      takeOff(fixOff, swapped);
      return;
    }
    if (fixSubs.length === 1) chrome.swapped(fixSubs[0].off_player_id, fixSubs[0].on_player_id);
    else chrome.showToast(`${fixSubs.length} subs made`);
  }
  const fullName = (id: string) => playerById.get(id)?.full_name ?? "a player";
  const fixLabel = [
    ...fixSubs.map((s) => `${fullName(s.on_player_id)} on for ${s.off_player_id ? fullName(s.off_player_id) : "a player"}`),
    ...(fixOff.length > 0 ? [`take ${fixOff.map(fullName).join(" and ")} off — play ${playsShort}`] : []),
  ].join(", ");
  /**
   * Kids off the field with nobody on ("Take off, no replacement"): the
   * side plays short, recorded as the lineup with them on the bench.
   */
  function takeOff(pids: readonly string[], from: TouchLineup | null = state.lineup) {
    if (!from || pids.length === 0) return;
    setError(null);
    const lineup = pids.reduce((lu, pid) => benchInTouchLineup(lu, pid), from);
    const when = at();
    write("recordTouchLineupSet", [auth, game.id, lineup, when], liveEvents.lineupSet({ lineup, ...when }));
    chrome.showToast(`${pids.map((id) => chrome.firstName(id)).join(" and ")} off — playing ${touchOnField(lineup).length}`);
  }

  // A kid going home is an injury with reason "out" (lib/live/wentHome).
  function markInjured(pid: string, injured: boolean, wentHome = false) {
    setError(null);
    const input = { player_id: pid, injured, ...at(), ...(wentHome ? { reason: WENT_HOME_REASON } : {}) };
    write("markInjury", [auth, game.id, input], liveEvents.injury(input));
  }
  /** A kid leaves the field hurt: pick who comes on. */
  function startLeaving(pid: string, wentHome = false) {
    const line = state.lineup ? touchLineOf(state.lineup, pid) : null;
    // Nobody who keeps the mixed rule can replace them: the field shrinks.
    if (isPeriodActive && line && swappableBench.some((id) => keepsRule(id, pid))) {
      setLeaving({ playerId: pid, line, wentHome });
      return;
    }
    markInjured(pid, true, wentHome);
  }
  function leaveAndReplace(pid: string, replacementId: string, line: TouchLine, wentHome = false) {
    setLeaving(null);
    // In order, in the one game lane: the injury, then who comes on.
    markInjured(pid, true, wentHome);
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

  // ── Tile decorations ────────────────────────────────────────
  const lockModes = useMemo(() => {
    const out: Record<string, "field" | "zone"> = {};
    for (const [pid, lock] of Object.entries(state.locks)) {
      if (lock.kind === "field") out[pid] = "field";
      else if (lock.kind === "zone") out[pid] = "zone";
    }
    return out;
  }, [state.locks]);
  const selectedPlayer = selectedId ? (playerById.get(selectedId) ?? null) : null;
  const selectedOnField = selectedId !== null && lineOf(selectedId) !== null;
  // With a kid picked, the kids a swap with them would break the mixed
  // rule for (the bench for a field kid, the field for a bench kid) dim
  // and say why. They can still be tapped: the swap asks first.
  const ruleNotes = useMemo(() => {
    const out: Record<string, string> = {};
    if (!mixed || !lineup || !selectedId || !isPeriodActive) return out;
    if (selectedOnField) {
      for (const b of lineup.bench) {
        const w = canComeOn(b) ? capWarning(selectedId, b) : null;
        if (w) out[b] = w;
      }
    } else if (canComeOn(selectedId)) {
      for (const f of touchOnField(lineup)) {
        const w = capWarning(f, selectedId);
        if (w) out[f] = w;
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixed, lineup, selectedId, selectedOnField, isPeriodActive, state.injuredIds, state.loanedIds]);
  const remainingMs = Math.max(0, periodMs - elapsedMs);
  const clockReadout = `${Math.floor(remainingMs / 60_000)}:${Math.floor((remainingMs % 60_000) / 1000)
    .toString()
    .padStart(2, "0")}`;
  const atHooter = isPeriodActive && elapsedMs >= periodMs;
  const breakName = base.currentPeriod >= ageGroup.periodCount ? "Full time" : "Half time";

  const actionPlayer = actionPlayerId ? (playerById.get(actionPlayerId) ?? null) : null;
  const actionLine = actionPlayerId && state.lineup ? touchLineOf(state.lineup, actionPlayerId) : null;
  const actionHeld = actionPlayerId ? (lockModes[actionPlayerId] ?? null) : null;
  const lentPlayers = squad.filter((p) => loanedSet.has(p.id) && !injuredSet.has(p.id));

  // The field the rule allows, when it's fewer than the game's size: a
  // quiet line under the top bar (the design's info-line note), so the
  // countdown keeps its place.
  const shortBanner =
    fieldPlan && !isFinished && (fieldPlan.short || fieldPlan.belowMinimum) ? (
      <p role="status" className="rounded-[12px] bg-sun-soft px-3 py-2 text-[0.8125rem] leading-snug text-ink">
        <span data-testid="touch-field-size-banner">
          {fieldPlan.belowMinimum && fieldPlan.girls < (mixed?.rule.minGirls ?? 0)
            ? `The mixed rule needs at least ${plural(mixed!.rule.minGirls, "girl", "girls")} on the field. ${mixedFieldMessage(fieldPlan)}.`
            : `${mixedFieldMessage(fieldPlan)}.`}
        </span>
      </p>
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

  // Who scored a try: the scorebug's +T in play, the break's and full
  // time's editors. "Who scored?" under what was scored, as soccer's and
  // basketball's sheets ask; a stray tap on the backdrop keeps the sheet
  // (SlotFillSheet's default): the try mustn't vanish.
  const scorerSheet = pickingScorer ? (
    <SlotFillSheet
      slotLabel="try"
      eyebrow={girlsTryDouble ? "Try · a girl's counts 2" : "Try"}
      title="Who scored?"
      lostScore="try"
      subtitle="Pick who scored, or count the try without a name."
      candidates={(state.lineup ? touchOnField(state.lineup) : [])
        .map((id) => playerById.get(id))
        .filter((p): p is Player => Boolean(p))
        .map((p) => ({ id: p.id, name: p.full_name, jerseyNumber: p.jersey_number }))
        // Jersey order, as league's: a parent looks for a number or a name.
        .sort((a, b) => (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999))}
      emptyMessage="Nobody is on the field."
      extraOptions={scorerOptions}
      onPick={(pid) => {
        setPickingScorer(false);
        teamScore(pid);
      }}
      onCancel={() => setPickingScorer(false)}
    />
  ) : null;

  // Half-time: the shared break screen.
  if (isAtBreak) {
    return (
      <div ref={liveRootRef}>
        <TouchBreak
          auth={auth}
          write={write}
          sport={sport}
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
          mixed={mixed}
          shapeId={touchShapeIdOf(lastSetLineup(events))}
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
                        teamChips={[{ key: "try", text: "+T", label: `Add a try, ${teamName}`, onClick: () => setPickingScorer(true) }]}
                        opponentChips={touchOpponentChips(girlsTryDouble, opponentName).map((c) => ({
                          key: c.key,
                          text: c.text,
                          sub: c.sub,
                          label: c.label,
                          onClick: () => opponentScore(c.girl),
                        }))}
                        missedNote={`A try you missed counts in ${periodLetter}${base.currentPeriod}.`}
                        onUndo={undoScore}
                        undoDisabled={pending}
                      />
                      {scorerSheet}
                    </>
                  ),
                }
              : undefined
          }
        />
      </div>
    );
  }

  // ─── Live v3's shell (Phase 10) ────────────────────────────
  // Before the start and through the period the screen is LiveShell, as
  // AFL's: the top bar (‹ Exit · vs X · ⋯), the light score header, the
  // undo line, the info line (the next sub), the field (a line a lane, or
  // one for a side that plays no lanes), the bench and the bar. Half time
  // is TouchBreak (above); full time and the finished game keep their
  // page (below). Who counts as a girl or a boy is never drawn on a tile.
  const inPlay = isPeriodActive;
  const dueNow = isPeriodActive && subDue.due && subAckKey !== subDueKey;
  // The next sub falls past the whistle: no more this period, so the
  // pairs go (AFL's rule), unless one's due now.
  const subsDone = subsOpen && !dueNow && msUntilDue !== null && elapsedMs + Math.max(0, msUntilDue) >= periodMs;
  const shownSubs = subsOpen && !subsDone ? nextSubs : [];
  const pairOf = new Map<string, { i: number; role: "off" | "on"; line: TouchLine }>();
  shownSubs.forEach((s, i) => {
    if (s.off_player_id) pairOf.set(s.off_player_id, { i, role: "off", line: s.line });
    pairOf.set(s.on_player_id, { i, role: "on", line: s.line });
  });

  function makeOnePair(i: number) {
    const s = shownSubs[i];
    if (!s) return;
    if (shownSubs.length === 1) {
      makeAllPairs();
      return;
    }
    sub(s.off_player_id, s.on_player_id, s.line);
    chrome.swapped(s.off_player_id, s.on_player_id);
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
        where: LANE_WORD[s.line] ?? "ON",
        edited: false,
      },
    ];
  });
  const openPairs = () => {
    setSelectedId(null);
    setPairsOpen(true);
  };

  // ── One kid (KidTile) ──
  function outOf(pid: string): { out: KidOut; kind: KidOutKind } | null {
    if (injuredSet.has(pid)) {
      const home = wentHomeSet.has(pid);
      return { out: { kind: "injured", wentHome: home }, kind: home ? "home" : "injured" };
    }
    if (loanedSet.has(pid)) return { out: { kind: "lent" }, kind: "lent" };
    return null;
  }
  function kidTile(pid: string, line: TouchLine | null) {
    const p = playerById.get(pid);
    if (!p) return null;
    const o = outOf(pid);
    const pair = o || !inPlay ? null : pairOf.get(pid) ?? null;
    const lane = pair ? LANE_WORD[pair.line] : null;
    const subRole: KidSubRole | null = pair ? (pair.role === "off" ? { role: "off" } : { role: "on", to: lane }) : null;
    let words: KidWords | null = kidWords({
      place: line ? "field" : "bench",
      sub: subRole,
      subDue: dueNow,
      rollingSubs: true,
      subsDoneThisPeriod: subsDone,
      out: o?.out ?? null,
      inPlay,
    });
    // "On next → MID" says the lane in full: "On next to Middles".
    if (words && pair?.role === "on" && lane) {
      words = { ...words, spoken: `${words.text.split(" →")[0]} to ${TOUCH_LINE_LABEL[pair.line]}` };
    }
    const totalMs = totalMsByPlayer[pid];
    const held = lockModes[pid] ?? null;
    const tries = trackScoring ? touchTryChip(playerTries[pid]) : null;
    // With a kid picked, a swap with this one would break the mixed rule:
    // dimmed, and a screen reader hears why. Still tappable: it asks first.
    const note = ruleNotes[pid] ?? null;
    return (
      <KidTile
        testId={`player-tile-${pid}`}
        name={names.tile(p)}
        spoken={{
          name: p.full_name,
          place: line ? (line === "field" ? "Field" : TOUCH_LINE_LABEL[line]) : null,
          number: p.jersey_number,
          time: totalMs !== undefined ? formatMinSec(totalMs) : null,
          states: [tries ? tries.label : null, held ? "Kept on" : null, note],
        }}
        place={line ? "field" : "bench"}
        words={words}
        score={tries}
        badge={pair ? { n: pair.i + 1, hot: dueNow } : null}
        selected={selectedId === pid}
        due={!!pair && dueNow}
        dimmed={!!note}
        locked={!!held}
        lockLabel={held ? "Kept on the field" : null}
        out={o?.kind ?? null}
        onClick={
          o
            ? // Hurt or lent: a tap opens their sheet (Back on, Bring back).
              () => setActionPlayerId(pid)
            : inPlay
              ? () => handleTap(pid, line)
              : undefined
        }
        onLongPress={inPlay || o ? () => setActionPlayerId(pid) : undefined}
      />
    );
  }

  // ── The field: a line a lane, middles to wings ──
  const usesLanes = !!lineup && lineup.lines.field.length === 0 && (lineCaps.field ?? 0) === 0;
  const fieldRows: TouchLine[] = usesLanes
    ? TOUCH_LANES.filter((l) => Math.max(lineCaps[l] ?? 0, lineup!.lines[l].length) > 0)
    : ["field"];
  const fieldLines: FieldLine[] = lineup
    ? fieldRows.map((line) => {
        const ids = lineup.lines[line];
        const empties = Math.max(0, (lineCaps[line] ?? 0) - ids.length);
        const spot = line === "field" ? "spot" : `${TOUCH_LINE_ONE[line]} spot`;
        return {
          key: line,
          label: line === "field" ? "Field" : TOUCH_LINE_LABEL[line],
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
    <div role="region" aria-label="On field" className="flex flex-1 flex-col">
      <FieldLines lines={fieldLines} surface="field" />
    </div>
  ) : null;

  // The bench: who can come on, then who's out (hurt, lent), then kids
  // lent before they were placed.
  const benchIds = lineup?.bench ?? [];
  const placedIds = new Set(lineup ? [...touchOnField(lineup), ...benchIds] : []);
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
  // No interchange after a turnover until the next touch, so the change
  // waits for the ball (TOUCH_SUB_DUE_HINT).
  // Due: said with its pairs, or (nobody suggested, but someone could come
  // on) as "Sub due · rotate a player off". Nobody to bring on: not due.
  const subDueSaid = dueNow && (shownSubs.length > 0 || swappableBench.length > 0);
  const subSoft = !dueNow && msUntilDue !== null && msUntilDue > 0 && msUntilDue <= 30_000 && shownSubs.length > 0;
  const infoEl =
    inPlay && benchIds.length > 0 ? (
      <InfoLine
        state={subDueSaid ? "due" : subSoft ? "soft" : "idle"}
        msUntilDue={subsDone ? null : msUntilDue}
        subIntervalMs={subDue.spanMs ?? 0}
        swaps={sheetPairs.length}
        periodWord={periodWord}
        noBench={swappableBench.length === 0}
        onOpen={sheetPairs.length > 0 ? openPairs : undefined}
        softHint={TOUCH_SUB_DUE_HINT}
        dueHint={TOUCH_SUB_DUE_HINT}
      />
    ) : null;

  // ── Banners: the mixed rule broken, the field shrunk, a failed save ──
  const bannersEl = (
    <>
      {error && (
        <p className="rounded-[12px] bg-blood-soft px-3 py-2 text-[0.8125rem] font-bold text-blood" role="alert">
          {error}
        </p>
      )}
      {/* Pinned under the top bar while the side breaks the mixed rule:
          hi-vis, it's the act-now, and stays until it's fixed. */}
      {breach && (
        <div
          role="status"
          data-testid="touch-mixed-breach"
          className="flex items-center gap-[10px] rounded-[12px] bg-hivis py-[6px] pl-[12px] pr-[6px] text-hivis-ink"
        >
          <p className="min-w-0 flex-1 text-[0.8125rem] leading-snug">
            <span className="mr-[6px] font-display text-[0.625rem] font-black uppercase tracking-[0.12em]">Mixed rule</span>
            <strong className="font-bold">{breach.short}</strong>
            {fixSubs.length === 0 && fixOff.length > 0 && (
              <span>
                {" "}
                — take {fixOff.length === 1 ? "a boy" : `${fixOff.length} boys`} off: play {playsShort}
              </span>
            )}
            {fixSubs.length === 0 && fixOff.length === 0 && <span> — nobody on the bench can fix it</span>}
            {/* What Fix will do, before it's tapped: it makes the subs
                straight away (round 9: a parent read it as a check). */}
            {fixSubs.length > 0 && (
              <span data-testid="touch-mixed-fix" className="block text-[0.75rem]">
                Fix: {fixLabel}
              </span>
            )}
          </p>
          {(fixSubs.length > 0 || fixOff.length > 0) && (
            <button
              type="button"
              onClick={applyFix}
              disabled={pending}
              aria-label={`Fix: ${fixLabel}`}
              className="min-h-[44px] flex-none rounded-[10px] bg-hivis-ink px-[14px] font-display text-[0.875rem] font-extrabold text-hivis disabled:opacity-60"
            >
              Fix
            </button>
          )}
        </div>
      )}
      {shortBanner}
    </>
  );

  // ── The bar ──
  // A picked kid: the bar is theirs (KidBar). The sub due: MAKE ALL N
  // SWAPS and PAIRS. Otherwise the score bar, or (scoring off) where
  // things are. Before the start: Start H1.
  const btn = (tone: Parameters<typeof barButton>[0]) => barButton(tone, "sm");
  const kidBar =
    selectedPlayer && inPlay
      ? (() => {
          const pid = selectedPlayer.id;
          const p = selectedPlayer;
          const line = lineOf(pid);
          const totalMs = totalMsByPlayer[pid] ?? 0;
          const ms = state.ms[pid] ?? {};
          const pair = pairOf.get(pid) ?? null;
          const planned = pair ? shownSubs[pair.i] : null;
          const first = names.first(p);
          const actions = [
            ...(line && trackScoring
              ? [
                  <button
                    key="try"
                    type="button"
                    data-testid="touch-dock-try"
                    onClick={() => teamScore(pid)}
                    disabled={pending}
                    className={btn("primary")}
                  >
                    + Try
                  </button>,
                ]
              : []),
            <button
              key="injured"
              type="button"
              disabled={pending}
              onClick={() => {
                setSelectedId(null);
                // On the field with someone to bring on who keeps the rule:
                // straight to who comes on; on the bench, marked at once.
                startLeaving(pid);
              }}
              className={btn("hurt")}
            >
              <svg viewBox="0 0 20 20" className="h-[16px] w-[16px]" aria-hidden>
                <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
              </svg>
              Injured
            </button>,
            <button
              key="more"
              type="button"
              onClick={() => {
                setSelectedId(null);
                setActionPlayerId(pid);
              }}
              className={btn("outlined")}
            >
              <svg viewBox="0 0 20 20" className="h-[16px] w-[16px]" aria-hidden>
                <circle cx="4" cy="10" r="2" fill="currentColor" />
                <circle cx="10" cy="10" r="2" fill="currentColor" />
                <circle cx="16" cy="10" r="2" fill="currentColor" />
              </svg>
              More
            </button>,
          ];
          const dimmedAny = Object.keys(ruleNotes).length > 0;
          return (
            <KidBar
              name={p.full_name}
              heading={`${p.jersey_number != null ? `#${p.jersey_number} ` : ""}${p.full_name}`}
              split={
                <TimeSplit
                  parts={[
                    { ms: ms.middle ?? 0, className: "bg-zone-c-fill" },
                    { ms: ms.link ?? 0, className: "bg-zone-b-fill" },
                    { ms: ms.wing ?? 0, className: "bg-zone-f-fill" },
                    { ms: ms.field ?? 0, className: "bg-brand-600" },
                  ]}
                />
              }
              line={`${line ? (line === "field" ? "Field" : TOUCH_LINE_LABEL[line]) : "Bench"} · ${Math.round(totalMs / 60_000)}′ this game · ${pctOfGame(totalMs, absNowMs)}% of game`}
              hint={
                <>
                  {line ? (
                    <>
                      Tap another kid to swap with <b className="font-bold text-ink">{first}</b>.
                    </>
                  ) : (
                    <>
                      Tap a field kid to swap <b className="font-bold text-ink">{first}</b> on.
                    </>
                  )}
                  {dimmedAny && " Dimmed kids would break the mixed rule: that swap asks first."}
                </>
              }
              pair={
                pair && planned
                  ? {
                      n: pair.i + 1,
                      text: planned.off_player_id
                        ? `${chrome.firstName(planned.off_player_id)} → ${chrome.firstName(planned.on_player_id)}`
                        : `On → ${chrome.firstName(planned.on_player_id)}`,
                      where: LANE_WORD[planned.line] ?? undefined,
                      hot: dueNow,
                      onMake: () => makeOnePair(pair.i),
                      disabled: pending,
                    }
                  : null
              }
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
            {sheetPairs.map((sp) => sp.onName).join(", ")} on · next time you have the ball
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
        Tap any kid for swaps and player actions.
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
    isPreGame: isPreStart,
    // Full time reads FT from the last whistle, not "running".
    isFinished,
    atHooter,
    breakName,
    trackScoring,
    girlsTryDouble,
  };
  const shellBar = isPreStart ? (
    <div className="flex flex-col gap-[6px]">
      <WalkthroughOffer storageKey="touch-walkthrough-seen" steps={walkthroughSteps} />
      <StartBarButton label={`Start ${periodLetter}1`} onClick={() => setStartConfirmOpen(true)} disabled={pending} />
    </div>
  ) : (
    kidBar ??
    dueBar ??
    (trackScoring ? (
      <TouchScoreBug
        {...scoreBugProps}
        part="bar"
        onTeamScore={canScore ? () => setPickingScorer(true) : undefined}
        onOpponentScore={canScore ? opponentScore : undefined}
      />
    ) : (
      scoringOffBar
    ))
  );
  const shellHeader = (
    <TouchScoreBug
      {...scoreBugProps}
      part="header"
      subDue={subDueSaid}
      onClockTap={isPeriodActive ? () => (atHooter ? setEndConfirmOpen(true) : setClockMenuOpen(true)) : undefined}
      clockPulseKey={base.periodEnded ? `end-${base.currentPeriod}` : null}
      onScores={
        trackScoring && !isPreStart
          ? () => {
              setSelectedId(null);
              chrome.openScores();
            }
          : undefined
      }
    />
  );

  const roundWord = game.round_number != null ? `Round ${game.round_number}` : null;
  const sportLine = `${getSportConfig(sport).shortName} ${ageGroup.id}`;
  const topSubline = isPreStart
    ? [roundWord, game.location].filter(Boolean).join(" · ") || sportLine
    : [roundWord, sportLine].filter(Boolean).join(" · ");
  const whoRuns = auth.kind === "token" ? "Game-day link" : isAdmin ? "Team admin" : "Game manager";

  // ⋯ → Edit lineup before the start: back to the picker with the side as
  // set (reopenTouchLineup puts it in the draft and takes it out).
  function handleEditLineup() {
    setError(null);
    void reopenTouchLineup(auth, game.id)
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
          <TouchScoreBug {...scoreBugProps} part="header" clockPulseKey={`end-${base.currentPeriod}`} />
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
        </>
      ) : (
        <LiveShell
          top={
            <LiveTopBar
              exitHref={exitHref}
              game={game}
              isLive={!isPreStart}
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
            target: undoTargetText(events, TOUCH_SCORE_EVENT_TYPES, chrome.namedScoreKey, { teamName, opponentName }),
            show: isPeriodActive && (teamPoints > 0 || opponentPoints > 0),
            onUndo: undoScore,
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
          game-day link, Restart and (before the start) Edit lineup. */}
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
            ? { summary: settingsSummary(subIntervalSeconds, fieldSize), subIntervalSeconds }
            : undefined
        }
        onScores={!isPreStart ? chrome.openScores : undefined}
        trackScoring={trackScoring}
        onWalkthrough={chrome.openHelp}
        onEditLineup={isPreStart ? handleEditLineup : undefined}
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

      {startConfirmOpen && isPreStart && (
        <StartQuarterModal
          quarter={1}
          periodLabel={periodLabel}
          cue={getSportConfig(sport).words.startCue}
          shortSide={{ playing: state.lineup ? touchOnField(state.lineup).length : 0, size: game.on_field_size, min: ageGroup.minOnFieldSize }}
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
          sport={sport}
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
          sport={sport}
          clock={atHooter ? "hooter" : running ? "running" : "paused"}
          periodLabel={periodLabel}
        />
      )}

      {scorerSheet}

      {actionPlayer && (
        <LockModal
          player={actionPlayer}
          currentLock={actionHeld}
          // The kid's lane (on the field) for the Switch hint, and their
          // lent minutes, as AFL's sheet has.
          currentLine={actionLine ? TOUCH_LINE_LABEL[actionLine] : null}
          isInjured={injuredSet.has(actionPlayer.id)}
          wentHome={wentHomeSet.has(actionPlayer.id)}
          isLoaned={loanedSet.has(actionPlayer.id)}
          seasonLoanMins={chrome.loanMinutes(actionPlayer.id).seasonLoanMins}
          squadLoanMins={chrome.loanMinutes(actionPlayer.id).squadLoanMins}
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
            else startLeaving(pid);
          }}
          onWentHome={() => {
            const pid = actionPlayer.id;
            setActionPlayerId(null);
            startLeaving(pid, true);
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
            isPeriodActive && actionLine
              ? [
                  ...(actionLine !== "field"
                    ? TOUCH_LANES.filter((l) => l !== actionLine).map((l) => ({
                        label: `Move to ${TOUCH_LINE_LABEL[l].toLowerCase()}`,
                        hint: `Plays ${TOUCH_LINE_ONE[l]} from now`,
                        testId: `touch-move-${l}`,
                        onClick: () => {
                          const pid = actionPlayer.id;
                          setActionPlayerId(null);
                          move(pid, null, l);
                          chrome.showToast(`${chrome.firstName(pid)} → ${TOUCH_LINE_LABEL[l]}`);
                        },
                      }))
                    : []),
                  // Off with nobody on: the side plays one short (a mixed
                  // side over the boys' cap with no girl to bring on).
                  {
                    label: "Take off, no replacement",
                    hint: "The side plays one short until you sub someone on",
                    testId: "touch-take-off",
                    onClick: () => {
                      const pid = actionPlayer.id;
                      setActionPlayerId(null);
                      takeOff([pid]);
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
          slotLabel={fillLine === "field" ? "spot" : `${TOUCH_LINE_ONE[fillLine]} spot`}
          candidates={lineup.bench
            .filter((id) => canComeOn(id) && keepsRule(id, null))
            .map((id) => playerById.get(id))
            .filter((p): p is Player => Boolean(p))
            .map((p) => ({ id: p.id, name: p.full_name, jerseyNumber: p.jersey_number }))}
          emptyMessage={mixed ? "Nobody on the bench can come on under the mixed rule." : "Nobody on the bench can come on."}
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
            .filter((id) => keepsRule(id, leaving.playerId))
            .map((id) => playerById.get(id))
            .filter((p): p is Player => Boolean(p))
            .map((p) => ({ player: p, totalMs: totalMsByPlayer[p.id] ?? 0 }))
            .sort((a, b) => a.totalMs - b.totalMs);
          return (
            <InjuryReplacementModal
              injuredPlayer={who}
              reason={leaving.wentHome ? "went_home" : "injured"}
              spotLabel={leaving.line === "field" ? "their spot" : TOUCH_LINE_ONE[leaving.line]}
              candidates={candidates}
              onPickReplacement={(rid) => leaveAndReplace(leaving.playerId, rid, leaving.line, leaving.wentHome)}
              onSkipReplacement={() => {
                const { playerId, wentHome } = leaving;
                setLeaving(null);
                markInjured(playerId, true, wentHome);
              }}
              onCancel={() => setLeaving(null)}
            />
          );
        })()}

      {chrome.overlays}

      <LongPressHint enabled={isPeriodActive && !selectedId} />
    </div>
  );
}

/** Each lane as the kids' words and the pairs say it ("On next → MID"). */
const LANE_WORD: Record<TouchLine, string | null> = { middle: "MID", link: "LINK", wing: "WING", field: null };

