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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOtherPhoneScores } from "@/components/live/useOtherPhoneScores";
import { SFButton } from "@/components/sf";
import { shortName } from "@/lib/names";
import { LiveTopBar } from "@/components/live/LiveTopBar";
import { LiveAdminUtilityRow } from "@/components/live/LiveAdminUtilityRow";
import { LiveStickyScoreBar } from "@/components/live/LiveStickyScoreBar";
import { ManualEndQuarterConfirm } from "@/components/live/ManualEndQuarterConfirm";
import { ClockMenu } from "@/components/live/ClockMenu";
import { StartQuarterModal } from "@/components/live/StartQuarterModal";
import { SubDueBanner } from "@/components/live/SubDueBanner";
import { subDueBannerShows } from "@/components/live/SubDue";
import { DOCK_SWAP_HINT, ScoreRecordingDock } from "@/components/live/ScoreRecordingDock";
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
import { periodLabels, type SoccerSport } from "@/lib/sports";
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
  /** Lent minutes in the season's other games, for the long-press sheet. */
  seasonLoanMinutes?: Record<string, number>;
}

/** The soccer family's score events (an undo takes back the latest). */
const SOCCER_SCORE_TYPES: ReadonlySet<string> = new Set(["goal", "opponent_goal"]);

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
    teamName,
    opponentName,
    playersById: playerById,
    seasonLoanMinutes,
    events,
    openElapsedMs: isPeriodActive ? elapsedMs : null,
  });

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
    if (elapsedMs >= periodMs) {
      hooterFiredRef.current = true;
      void endHalfAtClient(periodMs);
    }
  }, [elapsedMs, isPeriodActive, running, base.periodStartedAt, periodMs, endHalfAtClient, queueReady]);

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
          // A bench kid into an empty spot asks first, as AFL's does.
          chrome.confirmSwap({ offId: null, onId: kid, spotName: words[unit].label, onConfirm: () => sub(null, kid, unit, { manual: true }) });
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
      // A field kid and a bench kid: AFL's confirm, then the toast.
      const off = aUnit ? first : pid;
      const on = aUnit ? pid : first;
      const spot = (aUnit ?? bUnit)!;
      chrome.confirmSwap({ offId: off, onId: on, spotName: words[spot].label, onConfirm: () => sub(off, on, undefined, { manual: true }) });
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
  const swapOffs = new Map<string, number>();
  const swapOns = new Map<string, { pair: number; unit: SoccerUnit }>();
  if (!selectedId && isPeriodActive) {
    nextSubs.forEach((s, i) => {
      if (s.off_player_id) swapOffs.set(s.off_player_id, i + 1);
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

  return (
    <div ref={liveRootRef} className={`space-y-3 ${stickyPb}`.trim()}>
      <LiveTopBar
        onHelp={chrome.openHelp}
        exitHref={exitHref}
        game={game}
        isLive={base.currentPeriod > 0}
        // The sub card is the alert while it has pairs (SubDue.tsx); the
        // banner speaks only for a due sub with nothing to suggest.
        banner={
          isPeriodActive && subDueBannerShows(subDue.due, nextSubs.length, (state.lineup?.bench ?? []).some((id) => !injuredSet.has(id) && !loanedSet.has(id))) && subAckKey !== subDueKey ? (
            <SubDueBanner onAcknowledge={() => setSubAckKey(subDueKey)} />
          ) : null
        }
      />

      {error && <InlineAlert kind="danger">{error}</InlineAlert>}

      {/* An empty goal (the keeper hurt with nobody on): the top alert
          until someone's in it (round 3 edge cases, 24 Oct 2026: hockey
          played on with no keeper and nothing said so). */}
      {isPeriodActive && shape.keeper && state.lineup && !state.lineup.keeper && (
        <InlineAlert kind="danger" className="font-medium">
          <span data-testid="no-keeper" className="flex items-center justify-between gap-3">
            <span>No keeper: put someone in goal.</span>
            <SFButton size="sm" variant="ghost" onClick={() => setFillUnit("gk")} disabled={pending}>
              Pick
            </SFButton>
          </span>
        </InlineAlert>
      )}

      {isPeriodActive && chrome.toast}

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
          onApplyAll={applyAllSubs}
          onApplyOne={(i) => {
            const s = nextSubs[i];
            if (!s) return;
            // One of a due batch: the rest stay due until they're made.
            sub(s.off_player_id, s.on_player_id, s.line, { batchLeft: subDue.due ? nextSubs.length - 1 : undefined });
            chrome.swapped(s.off_player_id, s.on_player_id);
          }}
          pending={pending}
          playerById={playerById}
          pairTestIdPrefix="soccer-swap-pair"
        />
      )}

      {!isFinished && lentPlayers.length > 0 && (
        <div className="rounded-lg border border-warn/40 bg-warn-soft/60 px-3 py-2">
          <p className="text-xs font-semibold text-warn">Lent to the other team</p>
          <p className="mt-0.5 text-micro text-warn/80">Tap &ldquo;Bring back&rdquo; to return a player to your bench.</p>
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
                <span className="ml-0.5 text-micro font-semibold text-warn/80">Bring back</span>
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
            wentHomeIds={wentHomeSet}
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
        trackScoring={trackScoring}
        candidates={lateArrivalCandidates}
        onLateArrival={addLateArrival}
        lateArrivalPending={pending}
        isAdmin={isAdmin}
        finished={base.finalised}
        auth={auth}
        gameId={game.id}
        // The sub interval mid-game, as AFL's (rolling subs only).
        settings={
          !isFinished && ageGroup.subMode.kind === "rolling" && subIntervalSeconds != null ? (
            <LiveGameSettingsButton auth={auth} gameId={game.id} subIntervalSeconds={subIntervalSeconds} />
          ) : null
        }
      />

      {playerDockVisible && selectedPlayer && (
        <ScoreRecordingDock
          swapHint={DOCK_SWAP_HINT}
          heading={<span className="text-brand-700">{selectedPlayer.full_name}</span>}
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
              ? { teamId: auth.kind === "team" && isAdmin ? auth.teamId : null }
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
              // Full time reads FT from the last hooter, not "running".
              isFinished={isFinished}
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
          // In play only: at full time the review's own Undo fixes a miscount.
          undoStrip={chrome.undoStrip({
            target: undoTargetText(events, SOCCER_SCORE_TYPES, chrome.namedScoreKey, { teamName, opponentName: opponentName }),
            show: isPeriodActive && (state.teamScore.goals > 0 || state.opponentScore.goals > 0),
            onUndo: undoGoal,
            disabled: pending,
          })}
        />
      )}

      {startConfirmOpen && (
        <StartQuarterModal
          quarter={base.currentPeriod + 1}
          periodLabel={periodWord}
          cue="whistle goes"
          shortSide={{ playing: state.lineup ? soccerOnField(state.lineup).length : 0, size: game.on_field_size, min: ageGroup.minOnFieldSize }}
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
