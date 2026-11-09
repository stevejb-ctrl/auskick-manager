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
// in the one game lane, so the event log keeps the coach's order. The
// in-game writes are optimistic (useOptimisticEvents): a goal, an undo or
// a sub shows the moment it's tapped and the server's copy takes its
// place, as AFL's store does. The shared live chrome (useLiveChrome) is
// AFL's: the undo strip says what was recorded, a tap-tap sub asks first
// and toasts, the long-press sheet knows the kid's line and lent minutes
// (UX audit 23 Oct 2026, "Drift from AFL").
//
// Live v3 (Phase 9): before the whistle and through each period the
// screen is LiveShell, as AFL's, netball's and rugby's: the top bar
// (‹ Exit · vs X · ⋯), the light score header (tap it for Scores and
// fixes), the undo line, the info line (the next sub), the field's
// lines on the sport's surface with a KidTile per kid (the keeper's
// "GK" flag on theirs), the bench, and the bar: + GOAL, or "Make all N
// swaps" when the sub's due, or the picked kid's KidBar, or Start H1
// before the whistle. No keeper, and hockey's kit-up heads-up, are
// banners under the top bar. Half-time is SoccerBreak; full time and
// the finished game keep their page.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useOtherPhoneScores } from "@/components/live/useOtherPhoneScores";
import { shortName } from "@/lib/names";
import { LiveTopBar } from "@/components/live/LiveTopBar";
import { LiveShell } from "@/components/live/LiveShell";
import { LiveGameMenu, settingsSummary } from "@/components/live/LiveGameMenu";
import { FieldLines, type FieldLine } from "@/components/live/FieldLines";
import { KidSlot, KidTile, type KidOutKind } from "@/components/live/KidTile";
import { KidBench } from "@/components/live/KidBench";
import { InfoLine } from "@/components/live/InfoLine";
import { PairsSheet, type SheetPair } from "@/components/live/PairsSheet";
import { KidBar, TimeSplit } from "@/components/live/KidBar";
import { LateArrivalMenu } from "@/components/live/LateArrivalMenu";
import { StartBarButton } from "@/components/live/StartBarButton";
import { WalkthroughOffer } from "@/components/live/WalkthroughOffer";
import { buildSharedWalkthroughSteps } from "@/components/live/WalkthroughModal";
import { useSquadNames } from "@/components/live/SquadNames";
import { barButton, BAR_SMALL } from "@/components/live/barButtons";
import { kidWords, type KidOut, type KidSubRole } from "@/lib/live/kidWords";
import { pctOfGame } from "@/lib/live/minGameTime";
import { formatMinSec } from "@/lib/sports/netball/fairness";
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
import { liveEvents } from "@/lib/live/optimisticEvents";
import { undoTargetText, UNDO_GONE_MESSAGE, UNDO_MISSING_MESSAGE, undoTap } from "@/lib/live/undoTarget";
import { announceLiveNotice } from "@/lib/live/liveSync";
import { playSubDueBeep, useSubDueAudioUnlock } from "@/lib/live/subDueBeep";
import { useScrollToTopOnFinish } from "@/lib/live/useScrollToTopOnFinish";
import { hapticTap } from "@/lib/haptics";
import { computePeriodClockMs } from "@/lib/live/periodClock";
import { clockPauseInput } from "@/lib/live/clockPause";
import { queuedStartClockMark, useEventPeriodPause } from "@/lib/live/useClockPause";
import { openSubBatch, resolveSubAnchorElapsed } from "@/lib/live/subAnchor";
import { presentPlayerIds } from "@/lib/live/presentPlayers";
import { periodBreakName } from "@/lib/live/periodBreakName";
import type { Game, GameEvent, LiveAuth, Player } from "@/lib/types";
import { getSportConfig, periodLabels, type SoccerSport } from "@/lib/sports";
import { soccerFormations } from "@/lib/sports/soccer";
import { soccerFamilyRules } from "@/lib/sports/soccer/family";
import { soccerLikelyScorers } from "@/lib/sports/soccer/scorers";
import {
  normalizeSoccerLineup,
  soccerOnField,
  soccerOutfield,
  soccerUnitOf,
  type SoccerLineup,
} from "@/lib/sports/soccer/lineup";
import { WENT_HOME_REASON } from "@/lib/live/wentHome";
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
import { SoccerSurfaceMarks } from "./SoccerField";
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
  /** Lent minutes in the season's other games, for the long-press sheet. */
  seasonLoanMinutes?: Record<string, number>;
}

/** The soccer family's score events (an undo takes back the latest). */
const SOCCER_SCORE_TYPES: ReadonlySet<string> = new Set(["goal", "opponent_goal"]);

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
  return shortName(p.full_name);
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
  events: serverEvents,
  season,
  keeperStrategy,
  keeperPrefs,
  isAdmin,
  exitHref,
  seasonLoanMinutes,
}: SoccerLiveGameProps) {
  const opponentName = game.opponent || "Opponent";
  const playerById = useMemo(() => new Map(squad.map((p) => [p.id, p])), [squad]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Every write is optimistic, so nothing here waits on a save.
  const pending = false;
  const [clockMenuOpen, setClockMenuOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const [scorerPickerOpen, setScorerPickerOpen] = useState(false);
  const [actionPlayerId, setActionPlayerId] = useState<string | null>(null);
  const [keeperPickerOpen, setKeeperPickerOpen] = useState(false);
  const [fillUnit, setFillUnit] = useState<SoccerUnit | null>(null);
  const [injury, setInjury] = useState<{ injuredId: string; unit: SoccerUnit; wentHome?: boolean } | null>(null);
  const [subAckKey, setSubAckKey] = useState<string | null>(null);
  // Live v3: the ⋯ menu and the pairs sheet (one sheet at a time).
  const [menuOpen, setMenuOpen] = useState(false);
  const [pairsOpen, setPairsOpen] = useState(false);
  const router = useRouter();
  const names = useSquadNames();
  const liveRootRef = useRef<HTMLDivElement>(null);
  const periodMs = periodSeconds * 1000;
  // The server's events, then the writes it hasn't returned yet.
  const { events, write, queueReady } = useOptimisticEvents(serverEvents, { gameId: game.id, onError: setError });
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
  // The summary after Finish opens at the top: the final score and Copy
  // for group chat, not the review's scroll (round 2, 24 Oct 2026).
  useScrollToTopOnFinish(base.finalised, liveRootRef);

  // ── Clock: league's and netball's period clock ──────────────
  // Game ms since the period started, less real time paused, scaled by
  // the clock multiplier. The pause is the period's latest clock_pause
  // event (lib/live/clockPause), so a reload or a second phone keeps it.
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
    (now: number) =>
      computePeriodClockMs({
        currentQuarter: base.currentPeriod,
        quarterEnded: base.periodEnded,
        finalised: base.finalised,
        quarterStartedAtMs: startedAtMs,
        pausedAtMs: pause.pausedAtMs,
        accumulatedPauseMs: pause.accumulatedPauseMs,
        fallbackElapsedMs: base.periodEnded ? base.periodElapsedMs : 0,
        clockMultiplier,
        nowMs: now,
      }),
    [base, startedAtMs, pause, clockMultiplier],
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
  useOtherPhoneScores(events, SOCCER_SCORE_TYPES, { teamName: teamName, opponentName: opponentName });
  const chrome = useLiveChrome({
    auth,
    gameId: game.id,
    teamName,
    opponentName,
    playersById: playerById,
    seasonLoanMinutes,
    events,
    openElapsedMs: isPeriodActive ? elapsedMs : null,
    // The shell's ink toast over the bar, with its drain bar.
    toastLook: "ink",
  });

  // Kick-off on this phone: a one-shot halo round the field ("the game
  // is on"), as AFL's.
  const [wakeUpKey, setWakeUpKey] = useState<number | null>(null);
  const wasPreKickoffRef = useRef(isPreKickoff);
  useEffect(() => {
    if (wasPreKickoffRef.current && !isPreKickoff && isPeriodActive) setWakeUpKey(Date.now());
    wasPreKickoffRef.current = isPreKickoff;
  }, [isPreKickoff, isPeriodActive]);

  // ── The game now: every kid's time so far, open stints credited ──
  const state: SoccerGameState = useMemo(
    () => (isPeriodActive ? replaySoccerGame(events, { nowMs: elapsedSecond * 1000 }) : base),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, isPeriodActive, elapsedSecond, base],
  );
  const absNowMs = state.completedPeriodMs + (isPeriodActive ? elapsedMs : 0);
  const injuredSet = useMemo(() => new Set(state.injuredIds), [state.injuredIds]);
  const wentHomeSet = useMemo(() => new Set(state.wentHomeIds), [state.wentHomeIds]);
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
    // Rolling subs: a kid who goes off rests a sub interval before coming
    // back on (windows are the only time to sub, so no rest there).
    const restMs = ageGroup.subMode.kind === "rolling" ? (subIntervalSeconds ?? 0) * 1000 : 0;
    // An empty goal or spot (a kid hurt with nobody on) is filled first.
    const spots = { keeper: shape.keeper, lines: shape.lines };
    const batch = isPeriodActive ? suggestSoccerWindowBatch({ state, nowMs: absNowMs, prefs: keeperPrefs, restMs, spots }) : [];
    return batchLeft > 0 ? batch.slice(0, batchLeft) : batch;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPeriodActive, state, keeperPrefs, batchLeft, subIntervalSeconds, ageGroup.subMode.kind, shape]);
  const subDueKey = subDue.key === null ? null : `${base.currentPeriod}:${subDue.key}`;
  const subDueShowing = isPeriodActive && subDue.due && nextSubs.length > 0 && subAckKey !== subDueKey;
  useSubDueAudioUnlock();
  // The beep, once a sub falls due. It waits while the coach is naming a
  // goal's scorer (the who-scored sheet), then sounds (AFL's picker-race
  // guard).
  const beepedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!subDueShowing) {
      if (!subDue.due) beepedKeyRef.current = null;
      return;
    }
    if (scorerPickerOpen || beepedKeyRef.current === subDueKey) return;
    beepedKeyRef.current = subDueKey;
    playSubDueBeep();
    void hapticTap("heavy");
  }, [subDueShowing, scorerPickerOpen, subDueKey, subDue.due]);

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
  const endHalfAtClient = useCallback(
    (elapsed: number) => {
      setError(null);
      write(
        "endSoccerHalf",
        [auth, game.id, base.currentPeriod, elapsed],
        liveEvents.periodEnd({ quarter: base.currentPeriod, elapsed_ms: elapsed }),
      );
    },
    [auth, game.id, base.currentPeriod, write],
  );
  function startFirstPeriod() {
    setError(null);
    const mark = queuedStartClockMark(1);
    write("startSoccerHalf", [auth, game.id, 1], liveEvents.periodStart(1));
    if (mark) write("recordClockPause", [auth, game.id, mark], liveEvents.clockPause(mark));
  }

  // The hooter: the period ends itself at full time on the clock (not
  // while paused; the coach is stopping on purpose).
  const hooterFiredRef = useRef(false);
  useEffect(() => {
    if (!isPeriodActive) {
      hooterFiredRef.current = false;
      return;
    }
    if (hooterFiredRef.current || !running || !base.periodStartedAt) return;
    // Not before a queued period end from before a reload is drawn: it
    // would end the period a second time.
    if (!queueReady) return;
    // The who-scored sheet holds it, so a goal scored on the whistle
    // isn't lost under the break (AFL's picker-race guard). A kid left
    // picked doesn't: the whistle puts them down.
    if (scorerPickerOpen) return;
    if (elapsedMs >= periodMs) {
      hooterFiredRef.current = true;
      setSelectedId(null);
      void endHalfAtClient(periodMs);
    }
  }, [elapsedMs, isPeriodActive, running, base.periodStartedAt, periodMs, endHalfAtClient, queueReady, scorerPickerOpen]);

  // Pause or resume: a clock_pause event, on screen at once.
  function toggleClock() {
    if (!isPeriodActive || hooterFiredRef.current) return;
    const now = Date.now();
    const input = clockPauseInput(base.currentPeriod, running, clockAt(now), now);
    write("recordClockPause", [auth, game.id, input], liveEvents.clockPause(input));
    // The clock reads now from the tap, not the last tick (a page opened
    // paused has none yet).
    setNowMs(now);
  }

  /**
   * `batchLeft`: a due batch's swaps still to make after this one (the
   * sub clock waits for them). `manual`: made by hand, off the
   * rotation's cadence, so the sub clock doesn't restart (AFL's rule).
   */
  function sub(offId: string | null, onId: string, line?: SoccerUnit, opts: { batchLeft?: number; manual?: boolean } = {}) {
    setError(null);
    const input = {
      off_player_id: offId,
      on_player_id: onId,
      ...(line ? { line } : {}),
      ...(opts.batchLeft ? { batch_left: opts.batchLeft } : {}),
      ...(opts.manual ? { manual: true } : {}),
      ...at(),
    };
    write("recordSoccerSwap", [auth, game.id, input], liveEvents.swap(input));
  }
  function move(a: string, b: string | null, zoneB: SoccerUnit) {
    const zoneA = state.lineup ? soccerUnitOf(state.lineup, a) : null;
    if (!zoneA) return;
    setError(null);
    const input = { player_a_id: a, zone_a: zoneA, ...(b ? { player_b_id: b } : {}), zone_b: zoneB, ...at() };
    write("recordSoccerMove", [auth, game.id, input], liveEvents.move(input));
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
        const kid = selectedId;
        if (from) {
          // A move on the field, straight away (AFL's empty-zone move).
          move(kid, null, unit);
          chrome.showToast(`${chrome.firstName(kid)} → ${words[unit].label}`);
        } else {
          // A bench kid into an empty spot goes on at once, as AFL's does.
          chrome.manualSwap({ offId: null, onId: kid, spotName: words[unit].label, run: () => sub(null, kid, unit, { manual: true }) });
        }
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
    const first = selectedId;
    if (aUnit && bUnit) {
      // Two on the field trade places, straight away (AFL's zone swap).
      move(first, pid, bUnit);
      chrome.showToast(`${chrome.firstName(first)} ⇄ ${chrome.firstName(pid)} — swapped`);
    } else if (aUnit || bUnit) {
      // A field kid and a bench kid: the sub at once, Undo on the toast (AFL's).
      const off = aUnit ? first : pid;
      const on = aUnit ? pid : first;
      const spot = (aUnit ?? bUnit)!;
      chrome.manualSwap({
        offId: off,
        onId: on,
        spotName: words[spot].label,
        run: () => sub(off, on, undefined, { manual: true }),
        undo: () => sub(on, off, undefined, { manual: true }),
      });
    } else setSelectedId(pid); // two bench kids: the second is the selection
  }

  // ── Score ───────────────────────────────────────────────────
  // Goals go up the moment they're tapped (optimistic), and the undo
  // strip flashes what was recorded, as AFL's does. Only in play: at
  // full time the review's own buttons fix a miscount.
  const canScore = isPeriodActive;
  function teamGoal(scorerId: string | null) {
    if (!trackScoring) return;
    setSelectedId(null);
    setError(null);
    const key = write(
      "recordSoccerGoal",
      [auth, game.id, scorerId, base.currentPeriod, elapsedRef.current],
      liveEvents.score("goal", scorerId, at()),
    );
    void hapticTap("light");
    chrome.scored({ side: "us", what: "goal", scorerId, key });
  }
  // An own goal: theirs into their own net, counts for us (recordSoccerOwnGoal).
  function ownGoal() {
    if (!trackScoring) return;
    setSelectedId(null);
    setError(null);
    const key = write("recordSoccerOwnGoal", [auth, game.id, base.currentPeriod, elapsedRef.current], {
      type: "goal",
      player_id: null,
      metadata: { own_goal: true, ...at() },
    });
    void hapticTap("light");
    chrome.scored({ side: "us", what: "goal (own goal)", key });
  }
  const opponentGoal = () => {
    setError(null);
    const key = write(
      "recordSoccerOpponentGoal",
      [auth, game.id, base.currentPeriod, elapsedRef.current],
      liveEvents.score("opponent_goal", null, at()),
    );
    chrome.scored({ side: "them", what: "goal", key });
  };
  // Takes back the goal the strip names (this phone's last), or with
  // none named the latest on screen — never whatever the other phone
  // scored since (UX round 2).
  const undoGoal = () => {
    const tap = undoTap(events, SOCCER_SCORE_TYPES, chrome.namedScoreKey);
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
    write("undoSoccerScore", [auth, game.id, tap.target], tap.optimistic);
    chrome.undone();
  };

  // ── Sideline: injuries, loans, late arrivals, holds ─────────
  const swappableBench = useMemo(
    () => (state.lineup?.bench ?? []).filter((id) => !injuredSet.has(id) && !loanedSet.has(id)),
    [state.lineup, injuredSet, loanedSet],
  );
  // Nobody arrives at a game that's over (AFL's LiveGame filters the same).
  const lateArrivalCandidates = useMemo(() => {
    if (isFinished) return [];
    const placed = new Set(state.lineup ? [...soccerOnField(state.lineup), ...state.lineup.bench] : []);
    return squad.filter((p) => !placed.has(p.id));
  }, [squad, state.lineup, isFinished]);

  // A kid going home is an injury with reason "out" (lib/live/wentHome).
  function markInjured(pid: string, injured: boolean, wentHome = false) {
    setError(null);
    const input = { player_id: pid, injured, ...at(), ...(wentHome ? { reason: WENT_HOME_REASON } : {}) };
    write("markInjury", [auth, game.id, input], liveEvents.injury(input));
  }
  function startInjury(pid: string, wentHome = false) {
    const unit = state.lineup ? soccerUnitOf(state.lineup, pid) : null;
    if (isPeriodActive && unit && swappableBench.length > 0) setInjury({ injuredId: pid, unit, wentHome });
    else markInjured(pid, true, wentHome);
  }
  function injuryReplace(injuredId: string, replacementId: string, unit: SoccerUnit, wentHome = false) {
    setInjury(null);
    // In order, in the one game lane: the injury, then who comes on.
    markInjured(injuredId, true, wentHome);
    sub(injuredId, replacementId, unit);
    chrome.swapped(injuredId, replacementId);
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
      if (lock.kind === "field" || (lock.kind === "position" && lock.position === "gk")) out[pid] = "field";
      else if (lock.kind === "zone") out[pid] = "zone";
    }
    return out;
  }, [state.locks]);
  const selectedPlayer = selectedId ? playerById.get(selectedId) ?? null : null;
  const selectedUnit = selectedId ? unitOf(selectedId) : null;
  const remainingMs = Math.max(0, periodMs - elapsedMs);
  const clockReadout = `${Math.floor(remainingMs / 60_000)}:${Math.floor((remainingMs % 60_000) / 1000)
    .toString()
    .padStart(2, "0")}`;
  const atHooter = isPeriodActive && elapsedMs >= periodMs;
  const breakName = periodBreakName(base.currentPeriod, ageGroup.periodCount);

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
          write={write}
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

  // ─── Live v3's shell (Phase 9) ─────────────────────────────
  const inPlay = isPeriodActive;
  // The line's short word ("DEF", futsal's "BACK"), or its name where
  // the age plays without lines.
  const lineShort = (unit: SoccerUnit) => words[unit].short || words[unit].label;
  // The sub's due and there's a swap to make: the kids' words, the bar.
  const dueNow = subDueShowing;
  // The info line's due state: due with a bench to sub from, swaps or not.
  const infoDue =
    isPeriodActive && subDue.due && subAckKey !== subDueKey && swappableBench.length > 0;
  // No more subs this period: the next would fall at or after the
  // whistle (rolling), or the period's last window has gone. The pairs
  // go then, as AFL's do; a sub that's due still shows.
  const subsDone =
    !subDue.due &&
    (subDue.msUntilDue === null
      ? ageGroup.subMode.kind === "windows"
      : elapsedMs + subDue.msUntilDue >= periodMs);
  const planned = inPlay && (dueNow || !subsDone) ? nextSubs : [];
  const pairOf = new Map<string, { i: number; role: "off" | "on"; where: string }>();
  planned.forEach((s, i) => {
    if (s.off_player_id) pairOf.set(s.off_player_id, { i, role: "off", where: lineShort(s.line) });
    pairOf.set(s.on_player_id, { i, role: "on", where: lineShort(s.line) });
  });
  // Eleven a side: wider tiles. The line is said once, in the margin
  // label, not on each tile: "DEF" in a row of four cut the names
  // ("DEF Chl…", Phase 12). The keeper keeps its GK flag.
  const onFieldNow = lineup ? soccerOnField(lineup).length : 0;
  const bigSide = Math.max(game.on_field_size, onFieldNow) >= 11;

  // ── One kid (KidTile) ──
  function kidTile(pid: string, unit: SoccerUnit | null) {
    const p = playerById.get(pid);
    if (!p) return null;
    const hurt = injuredSet.has(pid);
    const lent = loanedSet.has(pid);
    const home = hurt && wentHomeSet.has(pid);
    const out: KidOut | null = hurt ? { kind: "injured", wentHome: home } : lent ? { kind: "lent" } : null;
    const outKind: KidOutKind | null = hurt ? (home ? "home" : "injured") : lent ? "lent" : null;
    const pair = out ? null : pairOf.get(pid) ?? null;
    const subRole: KidSubRole | null = pair ? (pair.role === "off" ? { role: "off" } : { role: "on", to: pair.where }) : null;
    const kw = kidWords({
      place: unit ? "field" : "bench",
      sub: subRole,
      subDue: dueNow,
      rollingSubs: true,
      subsDoneThisPeriod: subsDone,
      out,
      inPlay,
      lastPeriod: base.currentPeriod >= ageGroup.periodCount,
    });
    const goals = state.playerGoals[pid] ?? 0;
    const lock = out ? null : lockModes[pid] ?? null;
    const totalMs = totalMsByPlayer[pid];
    const keeper = unit === "gk";
    const lockLabel = lock === "field" ? "Field locked" : lock === "zone" ? "Line locked" : null;
    return (
      <KidTile
        testId={`player-tile-${pid}`}
        name={names.tile(p)}
        spoken={{
          name: p.full_name,
          place: unit && words[unit].short ? words[unit].label : null,
          number: p.jersey_number,
          time: totalMs !== undefined ? formatMinSec(totalMs) : null,
          states: [goals > 0 ? `${goals} ${goals === 1 ? "goal" : "goals"}` : null, lockLabel],
        }}
        place={unit ? "field" : "bench"}
        score={goals > 0 ? { text: `${goals}G`, label: `${goals} ${goals === 1 ? "goal" : "goals"}` } : null}
        words={kw}
        badge={pair ? { n: pair.i + 1, hot: dueNow } : null}
        selected={selectedId === pid}
        due={!!pair && dueNow}
        locked={!!lock}
        lockLabel={lockLabel}
        // The keeper: a small "GK" flag on the tile's corner (rugby's vest flag).
        flag={keeper ? words.gk.short : null}
        out={outKind}
        onClick={
          isPreKickoff || isFinished
            ? undefined
            : out
              ? // Hurt or lent: a tap opens their sheet (Back on, Bring back).
                () => setActionPlayerId(pid)
              : () => handleTap(pid, unit)
        }
        onLongPress={isPeriodActive ? () => setActionPlayerId(pid) : undefined}
      />
    );
  }

  // ── The field: the lines, attack up the page, the keeper at the foot ──
  const slots = (unit: SoccerUnit, ids: string[], cap: number) =>
    Array.from({ length: Math.max(cap, ids.length) }, (_, slot) => {
      const pid = ids[slot];
      // Keyed by spot, not kid: a sub hands the spot over and the new
      // name rises in.
      return (
        <div key={`slot-${slot}`} className="min-w-0">
          {pid ? (
            kidTile(pid, unit)
          ) : (
            <KidSlot
              label={`Empty ${words[unit].label.toLowerCase()} spot`}
              text={selectedId ? "Move here" : "Empty"}
              hot={!!selectedId}
              onClick={() => {
                if (isPeriodActive) handleTap("", unit);
              }}
            />
          )}
        </div>
      );
    });
  const fieldLines: FieldLine[] = !lineup
    ? []
    : shape.keeper
      ? [
          ...(["att", "mid", "def"] as const)
            .filter((l) => Math.max(lineCaps[l] ?? 0, lineup.lines[l].length) > 0)
            .map((l) => ({ key: l, label: words[l].label, tiles: slots(l, lineup.lines[l], lineCaps[l] ?? 0) })),
          { key: "gk", label: words.gk.label, tiles: slots("gk", lineup.keeper ? [lineup.keeper] : [], 1) },
        ]
      : [{ key: "field", label: words.field.label, tiles: slots("field", lineup.lines.field, lineCaps.field ?? 0) }];
  const onCourt = rules.surface === "court";
  const fieldEl = lineup ? (
    <div role="region" aria-label={onCourt ? "On court" : "On field"} className="flex flex-[1_0_auto] flex-col">
      <FieldLines
        lines={fieldLines}
        surface={onCourt ? "court" : "field"}
        marks={<SoccerSurfaceMarks surface={rules.surface} />}
        // Eleven a side: a wider plate for "ATT Lucas N" (the design's 100+).
        tileWidth={bigSide ? 108 : 88}
        wakeUpKey={wakeUpKey}
      />
    </div>
  ) : null;

  // ── The bench: who can come on, then who's out, then kids lent before
  // they were placed (tap one to bring them back) ──
  const benchIds = lineup?.bench ?? [];
  const lentAway = lentPlayers
    .filter((p) => !benchIds.includes(p.id) && !(lineup && soccerUnitOf(lineup, p.id)))
    .map((p) => p.id);
  const benchOrder = [
    ...benchIds.filter((id) => !injuredSet.has(id) && !loanedSet.has(id)),
    ...benchIds.filter((id) => injuredSet.has(id) || loanedSet.has(id)),
    ...lentAway,
  ];
  const benchEl = lineup ? (
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
  ) : null;

  // ── The planned sub, pair by pair ──
  function makeAllPairs() {
    applyAllSubs();
    setPairsOpen(false);
    setSelectedId(null);
  }
  function makeOnePair(i: number) {
    const s = planned[i];
    if (!s) return;
    if (planned.length === 1) {
      makeAllPairs();
      return;
    }
    // One of a due batch: the rest stay due until they're made.
    sub(s.off_player_id, s.on_player_id, s.line, { batchLeft: dueNow ? planned.length - 1 : undefined });
    chrome.swapped(s.off_player_id, s.on_player_id);
    setSelectedId(null);
  }
  const sheetPairs: SheetPair[] = planned.flatMap((s, index) => {
    const off = s.off_player_id ? playerById.get(s.off_player_id) : null;
    const on = playerById.get(s.on_player_id);
    if (!on || (s.off_player_id && !off)) return [];
    return [
      {
        index,
        offId: s.off_player_id ?? "",
        onId: on.id,
        offName: off ? names.first(off) : "Empty spot",
        onName: names.first(on),
        offFull: off ? off.full_name : "the empty spot",
        onFull: on.full_name,
        where: lineShort(s.line),
        edited: false,
      },
    ];
  });
  const openPairs = () => {
    setSelectedId(null);
    setPairsOpen(true);
  };

  // ── The info line: the next sub ──
  const msUntil = subsDone ? null : subDue.msUntilDue;
  const subSoft = !infoDue && msUntil !== null && msUntil > 0 && msUntil <= 30_000 && swappableBench.length > 0;
  const infoEl =
    inPlay && benchIds.length > 0 ? (
      <InfoLine
        state={infoDue ? "due" : subSoft ? "soft" : "idle"}
        msUntilDue={msUntil}
        subIntervalMs={subDue.spanMs ?? 0}
        swaps={sheetPairs.length}
        periodWord={periodWord}
        noBench={swappableBench.length === 0}
        onOpen={sheetPairs.length > 0 ? openPairs : undefined}
      />
    ) : null;

  // ── Banners: notices that need the coach ──
  const bannersEl = (
    <>
      {error && (
        <p className="rounded-[12px] bg-blood-soft px-3 py-2 text-[0.8125rem] font-bold text-blood" role="alert">
          {error}
        </p>
      )}
      {/* An empty goal (the keeper hurt with nobody on): act now, until
          someone's in it (round 3 edge cases, 24 Oct 2026: hockey played
          on with no keeper and nothing said so). */}
      {isPeriodActive && shape.keeper && state.lineup && !state.lineup.keeper && (
        <div
          role="alert"
          data-testid="no-keeper"
          className="flex items-center gap-[8px] rounded-[12px] bg-hivis px-3 py-[6px] text-[0.8125rem] leading-snug text-hivis-ink"
        >
          <span className="min-w-0 flex-1">
            <b className="font-bold">No keeper:</b> put someone in goal.
          </span>
          <button
            type="button"
            onClick={() => {
              setSelectedId(null);
              setFillUnit("gk");
            }}
            disabled={pending}
            className="min-h-[44px] flex-none rounded-[10px] bg-hivis-ink px-[14px] font-display text-[0.8125rem] font-extrabold text-hivis"
          >
            Pick
          </button>
        </div>
      )}
      {/* Hockey: the next keeper hears in time to kit up. */}
      {kitUpKeeper && (
        <p
          role="status"
          data-testid="keeper-kit-up"
          className="rounded-[12px] bg-sun-soft px-3 py-2 text-[0.8125rem] leading-snug text-ink"
        >
          <b className="font-bold">{firstName(kitUpKeeper)}</b>
          {kitUpKeeperId === state.lineup?.keeper
            ? ` stays in goal next ${periodWord}.`
            : `'s in goal next ${periodWord}: start kitting up.`}
        </p>
      )}
    </>
  );

  // ── The bar ──
  // A picked kid: the bar is theirs (KidBar). The sub due: MAKE ALL N
  // SWAPS and PAIRS. Otherwise the score bar, or (scoring off) where
  // things are.
  const btn = (tone: Parameters<typeof barButton>[0]) => barButton(tone, "sm");
  const kidBar =
    selectedPlayer && isPeriodActive
      ? (() => {
          const p = selectedPlayer;
          const pid = p.id;
          const unit = selectedUnit;
          const first = names.first(p);
          const totalMs = totalMsByPlayer[pid] ?? 0;
          const um = state.ms[pid];
          const lock = lockModes[pid] ?? null;
          const pair = pairOf.get(pid) ?? null;
          const ps = pair ? planned[pair.i] : null;
          const keeperStays = unit === "gk" && !rules.keeperSwapMidPeriod;
          const actions = [
            ...(trackScoring && unit
              ? [
                  <button key="goal" type="button" onClick={() => teamGoal(pid)} disabled={pending} className={btn("primary")}>
                    + Goal
                  </button>,
                ]
              : []),
            lock ? (
              <button
                key="unlock"
                type="button"
                onClick={() => {
                  setSelectedId(null);
                  setHold(pid, null);
                }}
                className={`${btn("oval")} col-span-2`}
              >
                Let them rotate again
                <span className={BAR_SMALL}>held on {words.field.phrase}</span>
              </button>
            ) : (
              <button
                key="injured"
                type="button"
                disabled={pending}
                onClick={() => {
                  setSelectedId(null);
                  // On the field with someone to bring on: straight to who
                  // comes on (startInjury); on the bench, marked at once.
                  startInjury(pid);
                }}
                className={btn("hurt")}
              >
                <svg viewBox="0 0 20 20" className="h-[16px] w-[16px]" aria-hidden>
                  <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
                </svg>
                Injured
              </button>
            ),
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
          return (
            <KidBar
              name={p.full_name}
              heading={`${p.jersey_number != null ? `#${p.jersey_number} ` : ""}${p.full_name}${unit ? ` · ${lineShort(unit)}` : ""}`}
              split={
                um && shape.keeper ? (
                  <TimeSplit
                    parts={[
                      { ms: um.att ?? 0, className: "bg-zone-f-fill" },
                      { ms: um.mid ?? 0, className: "bg-zone-c-fill" },
                      { ms: um.def ?? 0, className: "bg-zone-b-fill" },
                      { ms: um.gk ?? 0, className: "bg-ink" },
                    ]}
                  />
                ) : null
              }
              line={`${unit ? words[unit].label : "Bench"} · ${Math.round(totalMs / 60_000)}′ this game · ${pctOfGame(totalMs, absNowMs)}% of game`}
              hint={
                keeperStays ? (
                  <>The keeper changes at the break. Hurt? Tap Injured.</>
                ) : unit ? (
                  <>
                    Tap another kid to swap with <b className="font-bold text-ink">{first}</b>.
                  </>
                ) : (
                  <>
                    Tap a field kid to swap <b className="font-bold text-ink">{first}</b> on.
                  </>
                )
              }
              pair={
                pair && ps
                  ? {
                      n: pair.i + 1,
                      text: `${ps.off_player_id ? chrome.firstName(ps.off_player_id) : "Empty spot"} → ${chrome.firstName(ps.on_player_id)}`,
                      where: pair.where,
                      hot: dueNow,
                      onMake: () => makeOnePair(pair.i),
                      disabled: pending,
                    }
                  : null
              }
              actions={actions}
              columns={actions.length + (lock ? 1 : 0)}
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
            {sheetPairs.map((sp) => sp.onName).join(", ")} on
          </span>
        </button>
        <button type="button" onClick={openPairs} aria-label="Pairs: see each" className={barButton("outlined")}>
          Pairs
          <span className={BAR_SMALL}>see each</span>
        </button>
      </div>
    ) : null;

  // Before the whistle: the first-visit tour offer, then Start H1 (or
  // hockey's Q1), the place every sport starts from.
  const firstTag = `${periodLetter}1`;
  const preKickoffBar = (
    <div className="flex flex-col gap-[6px]">
      <WalkthroughOffer storageKey="soccer-walkthrough-seen" steps={buildSharedWalkthroughSteps()} />
      <StartBarButton label={`Start ${firstTag}`} onClick={() => setStartConfirmOpen(true)} disabled={pending} />
    </div>
  );
  // Scoring off: nothing to score, so the bar just says where things are.
  const scoringOffBar = (
    <p className="flex min-h-[58px] items-center px-[2px] text-[0.8125rem] text-ink-mute">
      <span>
        <b className="block font-display stretch-75 text-[1.125rem] font-extrabold text-ink">{teamName}</b>
        Tap any kid for swaps and player actions.
      </span>
    </p>
  );
  const bugProps = {
    teamName,
    opponentName,
    teamGoals: state.teamScore.goals,
    opponentGoals: state.opponentScore.goals,
    periodLetter,
    currentPeriod: base.currentPeriod,
    periodCount: ageGroup.periodCount,
    clockReadout,
    running,
    isPreGame: isPreKickoff,
    // Full time reads FT from the last whistle, not "running".
    isFinished,
    atHooter,
    breakName,
    trackScoring,
    pending,
    clockPulseKey: base.periodEnded ? `end-${base.currentPeriod}` : null,
  };
  const shellBar = isPreKickoff
    ? preKickoffBar
    : kidBar ??
      dueBar ??
      (trackScoring ? (
        <SoccerScoreBug
          {...bugProps}
          part="bar"
          onTeamGoal={
            canScore
              ? () => {
                  setSelectedId(null);
                  setScorerPickerOpen(true);
                }
              : undefined
          }
          onOpponentGoal={canScore ? opponentGoal : undefined}
        />
      ) : (
        scoringOffBar
      ));
  const shellHeader = (
    <SoccerScoreBug
      {...bugProps}
      part="header"
      subDue={infoDue}
      onClockTap={isPeriodActive ? () => setClockMenuOpen(true) : undefined}
      onScores={
        trackScoring && !isPreKickoff
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
  const topSubline = isPreKickoff
    ? [roundWord, game.location].filter(Boolean).join(" · ") || sportLine
    : [roundWord, sportLine].filter(Boolean).join(" · ");
  const whoRuns = auth.kind === "token" ? "Game-day link" : isAdmin ? "Team admin" : "Game manager";

  // ⋯ → Edit lineup before the whistle: back to the picker with the
  // lineup as set (reopenLineup takes the lineup back into the draft).
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
    <div ref={liveRootRef} className="ui-nonselect space-y-3">
      {isFinished ? (
        <>
          {/* Full time and the finished game keep their page: the top
              bar, the score, the review or the summary. */}
          <LiveTopBar exitHref={exitHref} game={game} isLive onHelp={chrome.openHelp} />
          {error && <InlineAlert kind="danger">{error}</InlineAlert>}
          <div className="rounded-md bg-surface">
            <SoccerScoreBug {...bugProps} />
          </div>
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
        </>
      ) : (
        <LiveShell
          top={
            <LiveTopBar
              exitHref={exitHref}
              game={game}
              isLive={!isPreKickoff}
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
            target: undoTargetText(events, SOCCER_SCORE_TYPES, chrome.namedScoreKey, { teamName, opponentName }),
            show: isPeriodActive && (state.teamScore.goals > 0 || state.opponentScore.goals > 0),
            onUndo: undoGoal,
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

      {/* ⋯: late arrival, settings, scores, the tour, feedback, the
          game-day link, Restart and (before the whistle) Edit lineup. */}
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
        // The sub interval mid-game, as AFL's (rolling subs only).
        settings={
          !isFinished && ageGroup.subMode.kind === "rolling" && subIntervalSeconds != null
            ? {
                summary: settingsSummary(subIntervalSeconds, game.on_field_size, getSportConfig(sport).words.surface),
                subIntervalSeconds,
              }
            : undefined
        }
        onScores={!isPreKickoff ? chrome.openScores : undefined}
        trackScoring={trackScoring}
        onWalkthrough={chrome.openHelp}
        onEditLineup={isPreKickoff ? handleEditLineup : undefined}
      />

      {/* Start H1's confirm: "Start H1 now" when the whistle goes. Back
          leaves the lineup on screen; ⋯ → Edit lineup reopens the picker. */}
      {startConfirmOpen && isPreKickoff && (
        <StartQuarterModal
          quarter={base.currentPeriod + 1}
          periodLabel={periodWord}
          cue="whistle goes"
          shortSide={{ playing: state.lineup ? soccerOnField(state.lineup).length : 0, size: game.on_field_size, min: ageGroup.minOnFieldSize }}
          loading={pending}
          onStart={() => {
            setStartConfirmOpen(false);
            startFirstPeriod();
            void hapticTap("medium");
          }}
          onCancel={() => setStartConfirmOpen(false)}
        />
      )}

      {/* The planned sub, pair by pair (the info line, or the due bar's
          Pairs). The keeper is never in it. */}
      {pairsOpen && sheetPairs.length > 0 && isPeriodActive && (
        <PairsSheet
          pairs={sheetPairs}
          due={dueNow}
          msUntilDue={msUntil}
          periodWord={PeriodWord}
          onMakeOne={makeOnePair}
          onMakeAll={makeAllPairs}
          pending={pending}
          onClose={() => setPairsOpen(false)}
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
          elapsedMs={Math.min(elapsedMs, periodMs)}
          periodMs={periodMs}
          onConfirm={(full) => {
            setEndConfirmOpen(false);
            // The time played, or (the game played on while the app's
            // clock sat paused) the whole period: the coach's choice. It
            // used to be the whole period, silently (round 3, 24 Oct 2026).
            endHalfAtClient(full ? periodMs : Math.min(clockAt(Date.now()), periodMs));
          }}
          onCancel={() => setEndConfirmOpen(false)}
          sport={sport}
          clock={atHooter ? "hooter" : running ? "running" : "paused"}
          periodLabel={periodWord}
        />
      )}

      {scorerPickerOpen && (
        <SlotFillSheet
          slotLabel="goal"
          eyebrow="Goal"
          title="Who scored?"
          lostScore="goal"
          subtitle="Pick who scored, or count it without a name."
          // The likeliest scorers first: attack, then back to the keeper,
          // then the bench (a kid just subbed off may have scored), as
          // AFL's sheet lists its forwards first. Hurt and lent kids
          // didn't score. A stray tap on the backdrop keeps the sheet
          // (SlotFillSheet's default): the goal mustn't vanish.
          candidates={(state.lineup ? soccerLikelyScorers(state.lineup) : [])
            .filter(({ id }) => !injuredSet.has(id) && !loanedSet.has(id))
            .map(({ id, unit }) => ({ p: playerById.get(id), unit }))
            .filter((c): c is { p: Player; unit: SoccerUnit | null } => Boolean(c.p))
            .map(({ p, unit }) => ({
              id: p.id,
              name: p.full_name,
              jerseyNumber: p.jersey_number,
              subLabel: unit ? words[unit].short || words[unit].label : "Bench",
            }))}
          emptyMessage={`Nobody is on ${words.field.phrase}.`}
          extraOption={{
            label: "Not sure who",
            subLabel: "Counts the goal without a scorer",
            onSelect: () => {
              setScorerPickerOpen(false);
              teamGoal(null);
            },
          }}
          extraOptions={[
            {
              label: "Own goal (theirs)",
              subLabel: "One of theirs put it in their own net. Counts for us, credited to nobody",
              onSelect: () => {
                setScorerPickerOpen(false);
                ownGoal();
              },
            },
          ]}
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
          // The kid's line (on the field) for the Switch hint, and their
          // lent minutes, as AFL's sheet has.
          currentLine={actionUnit ? words[actionUnit].label : null}
          isInjured={injuredSet.has(actionPlayer.id)}
          wentHome={wentHomeSet.has(actionPlayer.id)}
          isLoaned={loanedSet.has(actionPlayer.id)}
          seasonLoanMins={chrome.loanMinutes(actionPlayer.id).seasonLoanMins}
          squadLoanMins={chrome.loanMinutes(actionPlayer.id).squadLoanMins}
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
            if (injuredSet.has(pid)) markInjured(pid, false);
            else startInjury(pid);
          }}
          onWentHome={() => {
            const pid = actionPlayer.id;
            setActionPlayerId(null);
            startInjury(pid, true);
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
          // "Swap keeper" mid-period, where the sport allows it. Hockey
          // changes keepers at the break (an injury still replaces one):
          // the button shows there, disabled, with why (live v3 design).
          vestReplaceLabel={actionIsKeeper && isPeriodActive ? "keeper" : undefined}
          vestReplaceHint="Pick who goes in goal now"
          vestReplaceDisabledReason={
            rules.keeperSwapMidPeriod ? undefined : `Not mid-${periodWord}: the keeper's kitted up. They change at the break.`
          }
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
            if (soccerUnitOf(lu, pid)) move(lu.keeper, pid, soccerUnitOf(lu, pid)!);
            else sub(lu.keeper, pid, "gk", { manual: true });
            chrome.swapped(lu.keeper, pid);
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
            // A deliberate pick: straight on, with AFL's toast.
            sub(null, pid, unit, { manual: true });
            chrome.swapped(null, pid);
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
              reason={injury.wentHome ? "went_home" : "injured"}
              onPickReplacement={(rid) => injuryReplace(injury.injuredId, rid, injury.unit, injury.wentHome)}
              onSkipReplacement={() => {
                setInjury(null);
                markInjured(injury.injuredId, true, injury.wentHome);
              }}
              onCancel={() => setInjury(null)}
            />
          );
        })()}

      {chrome.overlays}

      <LongPressHint enabled={isPeriodActive && !selectedId} />
    </div>
  );
}
