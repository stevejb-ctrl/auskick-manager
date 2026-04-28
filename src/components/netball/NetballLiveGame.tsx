"use client";

// ─── Netball Live Game ───────────────────────────────────────
// Compact, opinionated live shell for netball. Substitutions only
// happen at period breaks, so the UI has two modes:
//
//   LIVE       → shows current lineup on the court, score buttons,
//                and a "End quarter" button. No mid-play swap UI.
//   Q-BREAK    → shows the lineup picker for the upcoming quarter,
//                with a "Start quarter" confirm button.
//
// Score: +1 goal (our team) / +1 opponent goal. That's it.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Game, GameEvent, LiveAuth, Player } from "@/lib/types";
import { Court } from "@/components/netball/Court";
import { PositionToken } from "@/components/netball/PositionToken";
import { NetballBenchStrip } from "@/components/netball/NetballBenchStrip";
import { NetballLineupPicker } from "@/components/netball/LineupPicker";
import { NetballPlayerActions } from "@/components/netball/NetballPlayerActions";
import { NetballQuarterBreak } from "@/components/netball/NetballQuarterBreak";
import { PickReplacementSheet } from "@/components/netball/PickReplacementSheet";
import { netballSport, primaryThirdFor } from "@/lib/sports/netball";
import type { AgeGroupConfig } from "@/lib/sports/types";
import {
  type GenericLineup,
  type InProgressSegment,
  type PlayerThirdMs,
  emptyGenericLineup,
  gamePositionCounts,
  playerThirdMs,
  seasonPositionCounts,
} from "@/lib/sports/netball/fairness";
import {
  startNetballGame,
  periodBreakSwap,
  startNetballQuarter,
  endNetballQuarter,
  recordNetballGoal,
  recordNetballOpponentGoal,
  undoNetballScore,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/netball-actions";
import { markInjury, markLoan } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";

interface NetballLiveGameProps {
  game: Game;
  auth: LiveAuth;
  /** Team's own name — drives the home-side label in the score bug. */
  teamName: string;
  squad: Player[];
  availableIds: string[];
  ageGroup: AgeGroupConfig;
  initialLineup: GenericLineup | null;
  currentQuarter: number;
  quarterElapsedMs: number;
  teamScore: { goals: number };
  opponentScore: { goals: number };
  /** Per-player goals scored this game (from replayNetballGame.playerGoals). */
  playerGoals: Record<string, number>;
  quarterEnded: boolean;
  finalised: boolean;
  thisGameEvents: GameEvent[];
  seasonEvents: GameEvent[];
}

export function NetballLiveGame(props: NetballLiveGameProps) {
  const {
    game,
    auth,
    teamName,
    squad,
    availableIds,
    ageGroup,
    initialLineup,
    currentQuarter,
    quarterElapsedMs: _quarterElapsedMs,
    teamScore,
    opponentScore,
    playerGoals,
    quarterEnded,
    finalised,
    thisGameEvents,
    seasonEvents,
  } = props;

  const [isPending, startTransition] = useTransition();
  // Bundle the live clock with the quarter it belongs to so the two
  // can NEVER drift apart. Render-time sync below resets the bundle
  // synchronously when the quarter prop changes, so `clockMs` is
  // ALWAYS valid for the current quarter on every render — the
  // useEffect-based reset we used previously left a brief window
  // where `clockMs` held the previous quarter's final value, which
  // tripped the auto-end-at-hooter check and bypassed the new
  // quarter entirely.
  const [clockState, setClockState] = useState(() => ({
    quarter: currentQuarter,
    ms: _quarterElapsedMs,
  }));
  if (clockState.quarter !== currentQuarter) {
    setClockState({ quarter: currentQuarter, ms: _quarterElapsedMs });
  }
  const clockMs =
    clockState.quarter === currentQuarter ? clockState.ms : _quarterElapsedMs;
  const setClockMs = useCallback(
    (updater: (prev: number) => number) => {
      setClockState((prev) =>
        prev.quarter === currentQuarter
          ? { quarter: prev.quarter, ms: updater(prev.ms) }
          : prev,
      );
    },
    [currentQuarter],
  );

  // Quarter length in ms — varies by age group (Set 6min, Go/11u 8min,
  // 12u 10min, 13u 12min, Open 15min). Drives the countdown header and
  // the auto-end-at-hooter trigger below.
  const quarterLengthMs = ageGroup.periodSeconds * 1000;
  const remainingMs = Math.max(0, quarterLengthMs - clockMs);

  // Hooter: when the countdown reaches zero, auto-fire endNetballQuarter
  // exactly once. Mirrors AFL's hooter-trigger pattern at LiveGame.tsx:730
  // (which uses a ref to ensure single-fire). The coach doesn't need to
  // tap an "End Q{n}" button — the clock running out IS the end of the
  // quarter. The next render lands in the quarter-break branch which
  // shows the next-quarter lineup picker.
  const hooterFiredForQuarterRef = useRef<number | null>(null);
  useEffect(() => {
    if (currentQuarter < 1 || quarterEnded || finalised) return;
    if (remainingMs > 0) return;
    if (hooterFiredForQuarterRef.current === currentQuarter) return;
    hooterFiredForQuarterRef.current = currentQuarter;
    startTransition(async () => {
      await endNetballQuarter(auth, game.id, currentQuarter, quarterLengthMs);
    });
  }, [
    remainingMs,
    currentQuarter,
    quarterEnded,
    finalised,
    auth,
    game.id,
    quarterLengthMs,
  ]);

  // ─── Client-only state (lost on reload) ────────────────────
  // injuredIds / loanedIds drive token greying and exclude players
  // from next-quarter lineup suggestions. Persisted as `injury` /
  // `player_loan` events for audit trail; see comment below for the
  // refresh-mid-quarter caveat.
  const [injuredIds, setInjuredIds] = useState<Set<string>>(new Set());
  const [loanedIds, setLoanedIds] = useState<Set<string>>(new Set());
  // Lock-for-next-break: pins a player to a position when the next
  // lineup picker opens. Cleared after that picker confirms. Soft
  // signal (player can still be moved by coach), not enforced.
  const [nextBreakLocks, setNextBreakLocks] = useState<Record<string, string>>({});
  // Mid-quarter substitution overlay. Coach injuries a court player and
  // picks a bench replacement; the change is reflected here client-side
  // until the next quarter break makes it durable via period_break_swap.
  // Refreshing the page mid-quarter loses the overlay (the replayed
  // lineup_set / period_break_swap events are the authoritative state).
  // Coach can re-do the sub if that happens.
  const [localOverlay, setLocalOverlay] = useState<GenericLineup | null>(null);
  // Mid-quarter sub log for the CURRENT quarter only. Each entry
  // records the exact clockMs at which a player vacated a position
  // and another took it. Drives accurate per-player time accounting:
  // the sub-out player's bar stops at `atMs`, the sub-in player's bar
  // starts at `atMs`. Cleared when the quarter changes (next
  // period_break_swap absorbs the post-sub state into events).
  type MidQuarterSub = {
    positionId: string;
    outPlayerId: string;
    inPlayerId: string;
    atMs: number;
  };
  const [midQuarterSubs, setMidQuarterSubs] = useState<MidQuarterSub[]>([]);
  useEffect(() => {
    setMidQuarterSubs([]);
  }, [currentQuarter]);
  // Modal target: long-press opens player actions for this player.
  const [actionsTarget, setActionsTarget] = useState<{
    playerId: string;
    positionId: string | null;
  } | null>(null);
  // Pick-replacement target: set after marking a court player as
  // injured OR lent to opposition. Either reason vacates the slot and
  // prompts the coach to pick a bench player to fill it for the rest
  // of the quarter; the post-sub state lives in localOverlay until the
  // next period_break_swap makes it durable.
  const [replacingTarget, setReplacingTarget] = useState<{
    positionId: string;
    vacatingPlayerId: string;
  } | null>(null);
  // Pending goal: tap on a GS/GA token doesn't fire the goal directly;
  // it sets this and surfaces a confirm sheet (mirrors AFL's score
  // sheet). Prevents accidental scoring from a stray tap during play.
  const [pendingGoal, setPendingGoal] = useState<{
    playerId: string;
    positionId: string;
  } | null>(null);
  // Undo last goal — mirrors AFL's pattern at LiveGame.tsx:206. After a
  // goal is recorded a "[Team] goal — Player · Undo" chip appears for
  // 8 seconds (toast); after the toast fades the chip stays as a
  // muted "Undo last score" affordance until another goal is
  // recorded (which replaces it). Tap fires score_undo; the replay
  // engine pops the LIFO undo stack so the latest score is reverted.
  const [lastScore, setLastScore] = useState<
    | { kind: "team" | "opp"; playerName: string | null }
    | null
  >(null);
  const [undoToastVisible, setUndoToastVisible] = useState(false);
  const undoToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startUndoToast = useCallback(
    (kind: "team" | "opp", playerName: string | null) => {
      if (undoToastTimerRef.current !== null) {
        clearTimeout(undoToastTimerRef.current);
      }
      setLastScore({ kind, playerName });
      setUndoToastVisible(true);
      undoToastTimerRef.current = setTimeout(() => {
        setUndoToastVisible(false);
      }, 8000);
    },
    [],
  );
  const handleUndoLastScore = useCallback(() => {
    if (!lastScore) return;
    setLastScore(null);
    setUndoToastVisible(false);
    if (undoToastTimerRef.current !== null) {
      clearTimeout(undoToastTimerRef.current);
      undoToastTimerRef.current = null;
    }
    startTransition(async () => {
      await undoNetballScore(auth, game.id);
    });
  }, [lastScore, auth, game.id]);
  // Reset the undo state if the user transitions out of LIVE play
  // (Q-break, finalised) so a stale chip doesn't carry across phases.
  useEffect(() => {
    if (quarterEnded || finalised) {
      setLastScore(null);
      setUndoToastVisible(false);
    }
  }, [quarterEnded, finalised]);

  // Client-side tick during live play.
  useClock(!quarterEnded && !finalised && currentQuarter > 0, setClockMs);

  const squadById = useMemo(() => new Map(squad.map((p) => [p.id, p])), [squad]);

  // ─── State machine ─────────────────────────────────────────
  // hasStarted: we've recorded an initial lineup_set already.
  const hasStarted = !!initialLineup;

  // onCourt: the lineup actually playing now (for live display).
  // localOverlay wins if present (mid-quarter substitution); otherwise
  // we fall back to the replayed lineup. When quarterEnded + !finalised,
  // we show the LineupPicker instead of this lineup.
  const onCourt = localOverlay ?? initialLineup ?? emptyGenericLineup(ageGroup.positions);

  // Set of positionIds whose tokens get a "tap to score" affordance.
  // In netball only GS and GA can legally shoot — other tokens are
  // tappable only as a no-op (long-press still works for actions menu).
  const SCORING_POSITIONS = useMemo(() => new Set(["gs", "ga"]), []);

  // Per-player time-by-third stats. Recomputes when clockMs ticks
  // (every 500ms) so the bar fills smoothly.
  //
  // For the in-progress quarter we pass `inProgress.segments` — a
  // chronological list of (lineup, durationMs) slices built from the
  // start-of-quarter lineup plus midQuarterSubs. This gives EACH
  // PLAYER their own timer:
  //   - Q starts at clockMs=0, lineup A is on
  //   - Sub at clockMs=180000 → lineup A credited 180000ms
  //   - Lineup B credited (clockMs - 180000)ms, growing live
  // The sub-out player's bar stops at the sub moment; the sub-in
  // player's bar starts at zero contribution from this quarter and
  // accrues from there. No more inheritance.
  const playerStats = useMemo(() => {
    // Use segments any time the trailing quarter is "still open" from
    // a client-state POV — that's LIVE play AND the Q-break window
    // BEFORE period_break_swap is confirmed. Once confirmed, the
    // post-sub lineup is durable in events and we can fall back to
    // the event-only path. This catches the Q-break case where the
    // injured player would otherwise get credited the full quarter
    // and their substitute would show 0:00.
    const isQuarterOpen = !finalised && currentQuarter > 0;
    if (!isQuarterOpen) {
      return playerThirdMs(
        thisGameEvents,
        null,
        ageGroup.periodSeconds,
        primaryThirdFor as (positionId: string) => "attack-third" | "centre-third" | "defence-third" | null,
      );
    }
    // Build segments from the start-of-quarter lineup + each sub in
    // chronological order. The start-of-quarter lineup is whatever the
    // replay engine handed us (the most recent lineup_set or
    // period_break_swap before the trailing quarter_start).
    //
    // While LIVE, total in-progress duration = clockMs.
    // At Q-break (quarterEnded), the quarter ran its full course so
    // we credit the full quarterLengthMs even if clockMs ticked
    // slightly under that.
    const startLineup =
      initialLineup ?? emptyGenericLineup(ageGroup.positions);
    const totalElapsed = quarterEnded ? quarterLengthMs : clockMs;
    const segments: InProgressSegment[] = [];
    let current = startLineup;
    let prevMs = 0;
    for (const sub of midQuarterSubs) {
      const dur = Math.max(0, Math.min(sub.atMs, totalElapsed) - prevMs);
      if (dur > 0) segments.push({ lineup: current, durationMs: dur });
      // Apply the sub: outPlayer leaves position, inPlayer takes it.
      const next: GenericLineup = {
        positions: { ...current.positions },
        bench: current.bench.filter((id) => id !== sub.inPlayerId),
      };
      next.positions[sub.positionId] = (next.positions[sub.positionId] ?? [])
        .filter((id) => id !== sub.outPlayerId)
        .concat([sub.inPlayerId]);
      if (!next.bench.includes(sub.outPlayerId)) {
        next.bench = [...next.bench, sub.outPlayerId];
      }
      current = next;
      prevMs = Math.min(sub.atMs, totalElapsed);
    }
    const finalDur = Math.max(0, totalElapsed - prevMs);
    if (finalDur > 0) segments.push({ lineup: current, durationMs: finalDur });
    return playerThirdMs(
      thisGameEvents,
      null,
      ageGroup.periodSeconds,
      primaryThirdFor as (positionId: string) => "attack-third" | "centre-third" | "defence-third" | null,
      { segments },
    );
  }, [
    thisGameEvents,
    clockMs,
    quarterEnded,
    finalised,
    currentQuarter,
    ageGroup.periodSeconds,
    quarterLengthMs,
    initialLineup,
    midQuarterSubs,
  ]);

  // ─── Action handlers ───────────────────────────────────────
  // tap on a GS/GA token → open the confirm sheet (mirrors AFL's
  // score sheet, prevents accidental scoring). The goal only records
  // after the coach confirms via handleConfirmGoal.
  // tap on any other token → no-op (long-press still works).
  const handleTokenTap = (positionId: string, playerId: string | null) => {
    if (!playerId) return;
    if (!SCORING_POSITIONS.has(positionId)) return;
    if (currentQuarter < 1 || quarterEnded || finalised) return;
    setPendingGoal({ playerId, positionId });
  };

  const handleConfirmGoal = () => {
    if (!pendingGoal) return;
    const { playerId } = pendingGoal;
    const player = squadById.get(playerId);
    const playerName =
      player?.full_name.trim().split(/\s+/)[0] ?? null;
    startTransition(async () => {
      await recordNetballGoal(auth, game.id, playerId, currentQuarter, clockMs);
    });
    setPendingGoal(null);
    startUndoToast("team", playerName);
  };

  const handleCancelGoal = () => setPendingGoal(null);

  const handleOpponentGoal = useCallback(() => {
    startTransition(async () => {
      await recordNetballOpponentGoal(auth, game.id, currentQuarter, clockMs);
    });
    startUndoToast("opp", null);
  }, [auth, game.id, currentQuarter, clockMs, startUndoToast]);

  // long-press on any token (court OR bench strip) → open the player
  // actions modal. Bench tiles pass positionId=null; the modal hides
  // the lock-for-next-break action for bench targets since there's no
  // current position to lock to.
  const handleTokenLongPress = (positionId: string | null, playerId: string | null) => {
    if (!playerId) return;
    setActionsTarget({ playerId, positionId });
  };

  // ─ Modal action wiring ───
  const closeActions = () => setActionsTarget(null);

  // Generic helper used by injury + loan flows. Pops the player out of
  // their court position in the local overlay (so the picker sees a
  // vacant slot) and opens the Pick Replacement sheet. Bench targets
  // skip both: there's no slot to vacate.
  const vacateAndPromptReplacement = (playerId: string, positionId: string | null) => {
    if (!positionId) return;
    setLocalOverlay((prev) => {
      const base = prev ?? initialLineup ?? emptyGenericLineup(ageGroup.positions);
      const next: GenericLineup = {
        positions: { ...base.positions },
        bench: [...base.bench],
      };
      next.positions[positionId] = (next.positions[positionId] ?? []).filter(
        (id) => id !== playerId,
      );
      return next;
    });
    setReplacingTarget({ positionId, vacatingPlayerId: playerId });
  };

  // Mark injured: write the audit-trail event, flag the player client-side,
  // then auto-prompt the bench replacement sheet so the coach can plug
  // the gap in two taps. Substitution itself is local-overlay only until
  // the next quarter break makes it durable.
  const handleMarkInjured = () => {
    if (!actionsTarget) return;
    const { playerId, positionId } = actionsTarget;
    // Close the actions modal FIRST so it can't accidentally trap a
    // subsequent long-press behind a stale state transition.
    closeActions();
    setInjuredIds((prev) => new Set(prev).add(playerId));
    startTransition(async () => {
      await markInjury(auth, game.id, {
        player_id: playerId,
        injured: true,
        quarter: Math.max(1, currentQuarter),
        elapsed_ms: clockMs,
      });
    });
    vacateAndPromptReplacement(playerId, positionId);
  };

  const handleUnInjury = () => {
    if (!actionsTarget) return;
    const { playerId } = actionsTarget;
    closeActions();
    setInjuredIds((prev) => {
      const next = new Set(prev);
      next.delete(playerId);
      return next;
    });
    startTransition(async () => {
      await markInjury(auth, game.id, {
        player_id: playerId,
        injured: false,
        quarter: Math.max(1, currentQuarter),
        elapsed_ms: clockMs,
      });
    });
  };

  const handleMarkLoaned = () => {
    if (!actionsTarget) return;
    const { playerId, positionId } = actionsTarget;
    // Close the actions modal FIRST — same reason as injury: don't let
    // a still-rendering modal block the next long-press attempt.
    closeActions();
    setLoanedIds((prev) => new Set(prev).add(playerId));
    startTransition(async () => {
      await markLoan(auth, game.id, {
        player_id: playerId,
        loaned: true,
        quarter: Math.max(1, currentQuarter),
        elapsed_ms: clockMs,
      });
    });
    // Loan = same UX as injury. The lent player vacates their slot and
    // the coach picks a bench replacement to play out the rest of the
    // quarter; otherwise the team is stuck playing a player short until
    // the next break.
    vacateAndPromptReplacement(playerId, positionId);
  };

  const handleUnLoan = () => {
    if (!actionsTarget) return;
    const { playerId } = actionsTarget;
    closeActions();
    setLoanedIds((prev) => {
      const next = new Set(prev);
      next.delete(playerId);
      return next;
    });
    startTransition(async () => {
      await markLoan(auth, game.id, {
        player_id: playerId,
        loaned: false,
        quarter: Math.max(1, currentQuarter),
        elapsed_ms: clockMs,
      });
    });
  };

  const handleLockForNextBreak = () => {
    if (!actionsTarget?.positionId) return;
    const { playerId, positionId } = actionsTarget;
    closeActions();
    setNextBreakLocks((prev) => ({ ...prev, [positionId]: playerId }));
  };

  const handleUnlock = () => {
    if (!actionsTarget?.positionId) return;
    const { positionId } = actionsTarget;
    closeActions();
    setNextBreakLocks((prev) => {
      const next = { ...prev };
      delete next[positionId];
      return next;
    });
  };

  // Pick-replacement: drop the picked bench player into the vacated
  // position in the local overlay AND record the substitution
  // timestamp so per-player time accounting can split credit
  // accurately. Substitution becomes durable when the next quarter
  // break confirms via period_break_swap.
  const handlePickReplacement = (replacementId: string) => {
    if (!replacingTarget) return;
    const { positionId, vacatingPlayerId } = replacingTarget;
    setLocalOverlay((prev) => {
      const base = prev ?? initialLineup ?? emptyGenericLineup(ageGroup.positions);
      const next: GenericLineup = {
        positions: { ...base.positions },
        bench: base.bench.filter((id) => id !== replacementId),
      };
      next.positions[positionId] = [replacementId];
      return next;
    });
    setMidQuarterSubs((prev) => [
      ...prev,
      {
        positionId,
        outPlayerId: vacatingPlayerId,
        inPlayerId: replacementId,
        atMs: clockMs,
      },
    ]);
    setReplacingTarget(null);
  };

  // ─── Off-court roster (drives the bench strip on the live view) ──
  // Anyone in the available pool who isn't currently in a court
  // position. We surface bench / injured / lent in a single strip
  // because the coach mostly cares "who's not playing right now and
  // why" — splitting them into separate sections is more clutter than
  // signal at the point of decision.
  type OffCourtStatus = "bench" | "injured" | "loaned";
  const offCourt = useMemo(() => {
    const onCourtIds = new Set<string>();
    for (const ids of Object.values(onCourt.positions)) {
      for (const id of ids) onCourtIds.add(id);
    }
    const seen = new Set<string>();
    const list: { player: Player; status: OffCourtStatus }[] = [];
    const consider = (pid: string) => {
      if (!pid || seen.has(pid) || onCourtIds.has(pid)) return;
      seen.add(pid);
      const player = squadById.get(pid);
      if (!player) return;
      const status: OffCourtStatus = injuredIds.has(pid)
        ? "injured"
        : loanedIds.has(pid)
        ? "loaned"
        : "bench";
      list.push({ player, status });
    };
    // Order: explicit bench first (most likely to come on next), then
    // anyone else available, then sidelined naturally fall in via their
    // status flag.
    for (const id of onCourt.bench) consider(id);
    for (const id of availableIds) consider(id);
    // Sort sidelined to the end so the active bench stands out.
    list.sort((a, b) => {
      const rank = (s: OffCourtStatus) => (s === "bench" ? 0 : 1);
      return rank(a.status) - rank(b.status);
    });
    return list;
  }, [onCourt, availableIds, squadById, injuredIds, loanedIds]);

  // Build replacement candidates: active squad − on-court − injured − loaned.
  const replacementCandidates = useMemo<Player[]>(() => {
    if (!replacingTarget) return [];
    const onCourtIds = new Set<string>();
    for (const ids of Object.values(onCourt.positions)) {
      for (const id of ids) onCourtIds.add(id);
    }
    return squad.filter(
      (p) =>
        !onCourtIds.has(p.id) &&
        !injuredIds.has(p.id) &&
        !loanedIds.has(p.id),
    );
  }, [replacingTarget, onCourt, squad, injuredIds, loanedIds]);

  // ─── Initial lineup (before game starts) ────────────────────
  if (!hasStarted) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <header className="text-center">
          <h1 className="text-xl font-semibold">vs {game.opponent}</h1>
          <p className="text-sm text-neutral-600">
            Set your starting lineup for Q1.
          </p>
        </header>
        <NetballLineupPicker
          ageGroup={ageGroup}
          squad={squad}
          availableIds={availableIds}
          thisGameEvents={thisGameEvents}
          seasonEvents={seasonEvents}
          onConfirm={async (lineup) =>
            new Promise<void>((resolve) => {
              startTransition(async () => {
                await startNetballGame(auth, game.id, lineup, ageGroup.defaultOnFieldSize);
                resolve();
              });
            })
          }
          confirmLabel="Start game"
          disabled={isPending}
        />
      </div>
    );
  }

  // ─── Game finalised ─────────────────────────────────────────
  if (finalised) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <NetballScoreBug
          teamName={teamName}
          opponentName={game.opponent}
          team={teamScore}
          opponent={opponentScore}
          quarterLabel="FT"
          clockText="—"
        />
        <CourtDisplay
          lineup={onCourt}
          ageGroup={ageGroup}
          squadById={squadById}
          disabled
          playerStats={playerStats}
          playerGoals={playerGoals}
        />
        <NetballBenchStrip
          entries={offCourt}
          playerStats={playerStats}
          playerGoals={playerGoals}
        />
      </div>
    );
  }

  // ─── Quarter break — Siren Footy-style reshuffle ──────────
  // Replaced the position-by-position lineup picker with the
  // NetballQuarterBreak component (mirrors AFL's QuarterBreak design):
  // header card with fairness score + suggested-reshuffle toggle,
  // per-third sections, two-tap to swap, time bars per player. The
  // component handles its own period_break_swap + startNetballQuarter
  // writes; we just clear the local overlay/lock state on success.
  if (quarterEnded && currentQuarter < 4) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <NetballScoreBug
          teamName={teamName}
          opponentName={game.opponent}
          team={teamScore}
          opponent={opponentScore}
          quarterLabel={`Q${currentQuarter} BRK`}
          clockText="—"
        />
        <NetballQuarterBreak
          auth={auth}
          gameId={game.id}
          squad={squad}
          availableIds={availableIds}
          ageGroup={ageGroup}
          currentQuarter={currentQuarter}
          previousLineup={onCourt}
          preAppliedLocks={nextBreakLocks}
          periodSeconds={ageGroup.periodSeconds}
          thisGameEvents={thisGameEvents}
          seasonEvents={seasonEvents}
          injuredIds={injuredIds}
          loanedIds={loanedIds}
          playerGoals={playerGoals}
          playerStats={playerStats}
          midQuarterSubs={midQuarterSubs}
          onStarted={() => {
            // Locks are single-use; local overlay is durable now via
            // the period_break_swap event the component just wrote.
            setNextBreakLocks({});
            setLocalOverlay(null);
            // Belt-and-braces: clear any modal-/sheet-driving state
            // that might have lingered from the previous quarter so
            // a stuck overlay can't block long-press in the new one.
            // (closeActions / setReplacingTarget(null) on the success
            // paths usually handle this; this is the safety net.)
            setActionsTarget(null);
            setReplacingTarget(null);
            setPendingGoal(null);
          }}
        />
      </div>
    );
  }

  // ─── Pre-kickoff: lineup is set, Q1 hasn't started yet ──────
  // `startNetballGame` writes only the `lineup_set` event; `quarter_start`
  // is a separate action so coaches can pause between locking the
  // lineup and umpires calling play. Without this gate the LIVE branch
  // renders with currentQuarter === 0 (Q0 · 00:00) which looks broken
  // and would record goals against a phantom quarter.
  if (currentQuarter === 0 && !quarterEnded) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <NetballScoreBug
          teamName={teamName}
          opponentName={game.opponent}
          team={teamScore}
          opponent={opponentScore}
          quarterLabel="PRE"
          clockText={formatClock(quarterLengthMs)}
        />
        <p className="text-center text-sm text-neutral-600">
          Lineup locked. Tap when the umpires call play.
        </p>
        {/* Start-Q1 button sits ABOVE the court, mirroring AFL's
            LiveGame layout (between header/toasts and the field). Keeps
            the action prominent rather than burying it below the court. */}
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              await startNetballQuarter(auth, game.id, 1);
            })
          }
          disabled={isPending}
          className="w-full rounded-lg bg-brand-600 py-3 text-white font-semibold disabled:opacity-60"
        >
          {isPending ? "Starting…" : "Start Q1"}
        </button>
        <CourtDisplay lineup={onCourt} ageGroup={ageGroup} squadById={squadById} disabled />
      </div>
    );
  }

  // ─── Between Q4 and finalise: show finalise button ──────────
  if (quarterEnded && currentQuarter >= 4) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <NetballScoreBug
          teamName={teamName}
          opponentName={game.opponent}
          team={teamScore}
          opponent={opponentScore}
          quarterLabel="Q4 END"
          clockText="—"
        />
        <CourtDisplay lineup={onCourt} ageGroup={ageGroup} squadById={squadById} disabled />
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              await endNetballQuarter(auth, game.id, 4, clockMs);
            })
          }
          disabled={isPending}
          className="w-full rounded-lg bg-brand-600 py-3 text-white font-semibold disabled:opacity-60"
        >
          {isPending ? "Finalising…" : "Finalise game"}
        </button>
      </div>
    );
  }

  // ─── LIVE (currentQuarter > 0, not ended) ───────────────────
  // Goal scoring is per-player: tap a GS or GA token to attribute a
  // goal to that player. Long-press any player to open the actions
  // modal (injury / loan / lock-for-next-break).
  const actionsPlayer = actionsTarget
    ? squadById.get(actionsTarget.playerId) ?? null
    : null;

  return (
    <div className="flex flex-col gap-4 p-4">
      <NetballScoreBug
        teamName={teamName}
        opponentName={game.opponent}
        team={teamScore}
        opponent={opponentScore}
        quarterLabel={`Q${currentQuarter}`}
        clockText={formatClock(remainingMs)}
        isPending={isPending}
        onOpponentGoal={handleOpponentGoal}
      />

      {/* Undo last score — toast (8s, dark bg) then persistent chip
          (muted bg) until the next score replaces it. Mirrors AFL's
          LiveGame.tsx:855 chip exactly so the affordance is familiar. */}
      {lastScore && (
        <div
          className={`flex items-center justify-between rounded-sm px-3 py-1.5 transition-colors ${
            undoToastVisible ? "bg-ink text-warm" : "bg-surface-alt"
          }`}
          role="status"
          aria-live="polite"
        >
          <span
            className={`text-xs ${
              undoToastVisible ? "text-warm/80" : "text-ink-dim"
            }`}
          >
            {undoToastVisible
              ? `${
                  lastScore.kind === "team" ? teamName : game.opponent
                } goal${lastScore.playerName ? ` — ${lastScore.playerName}` : ""}`
              : "Undo last score"}
          </span>
          <button
            type="button"
            onClick={handleUndoLastScore}
            disabled={isPending}
            className={`font-mono text-xs font-bold uppercase tracking-micro transition-colors disabled:opacity-60 ${
              undoToastVisible
                ? "text-warn hover:text-warn/80"
                : "text-brand-700 hover:text-brand-600"
            }`}
          >
            Undo
          </button>
        </div>
      )}

      <CourtDisplay
        lineup={onCourt}
        ageGroup={ageGroup}
        squadById={squadById}
        onTokenTap={handleTokenTap}
        onTokenLongPress={handleTokenLongPress}
        scoringPositionIds={SCORING_POSITIONS}
        injuredIds={injuredIds}
        loanedIds={loanedIds}
        nextBreakLocks={nextBreakLocks}
        playerStats={playerStats}
        playerGoals={playerGoals}
      />

      <NetballBenchStrip
        entries={offCourt}
        playerStats={playerStats}
        playerGoals={playerGoals}
        onTileLongPress={(pid) => handleTokenLongPress(null, pid)}
      />

      <p className="text-center text-xs text-neutral-500">
        Tap GS or GA to score (with confirm). Long-press any player for
        actions. The quarter ends automatically when the clock reaches
        zero.
      </p>

      {/* Action modal — opens on long-press of any token. */}
      {actionsTarget && actionsPlayer && (
        <NetballPlayerActions
          player={actionsPlayer}
          positionId={actionsTarget.positionId}
          isInjured={injuredIds.has(actionsTarget.playerId)}
          isLoaned={loanedIds.has(actionsTarget.playerId)}
          isLockedForNextBreak={
            actionsTarget.positionId
              ? nextBreakLocks[actionsTarget.positionId] === actionsTarget.playerId
              : false
          }
          onMarkInjured={handleMarkInjured}
          onUnInjury={handleUnInjury}
          onMarkLoaned={handleMarkLoaned}
          onUnLoan={handleUnLoan}
          onLockForNextBreak={handleLockForNextBreak}
          onUnlock={handleUnlock}
          onClose={closeActions}
        />
      )}

      {/* Replace sheet — opens after Mark Injured OR Lend to Opposition
          for a court player. Shared UX so the coach picks a bench
          player to fill the vacant slot in two taps either way. */}
      {replacingTarget && (
        <PickReplacementSheet
          positionId={replacingTarget.positionId}
          vacatingPlayerName={
            squadById.get(replacingTarget.vacatingPlayerId)?.full_name ?? "Player"
          }
          candidates={replacementCandidates}
          onPick={handlePickReplacement}
          onCancel={() => setReplacingTarget(null)}
        />
      )}

      {/* Goal confirm sheet — mirrors AFL's player-tap-to-score sheet
          at LiveGame.tsx:996. Floats above bottom of viewport so the
          coach can sanity-check the player before committing. */}
      {pendingGoal && (() => {
        const player = squadById.get(pendingGoal.playerId);
        return (
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 p-3">
            <div className="pointer-events-auto mx-auto max-w-xl rounded-md border-2 border-brand-500 bg-surface p-3 shadow-modal">
              <div className="mb-2 flex items-center gap-2">
                <p className="flex-1 truncate text-sm font-semibold text-ink">
                  Record goal for{" "}
                  <span className="text-brand-700">
                    {player?.full_name ?? "player"}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={handleCancelGoal}
                  className="flex-shrink-0 font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute hover:text-ink-dim"
                >
                  Cancel
                </button>
              </div>
              <button
                type="button"
                onClick={handleConfirmGoal}
                disabled={isPending}
                className="w-full rounded-sm bg-brand-600 py-3 font-mono text-base font-bold uppercase tracking-micro text-white shadow-card transition-colors duration-fast ease-out-quart hover:bg-brand-500 disabled:opacity-60"
              >
                + Goal
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Score bug ──────────────────────────────────────────────
// Broadcast-style scoreboard: HOME · clock pill · AWAY in three
// columns, mirroring the AFL GameHeader at src/components/live/
// GameHeader.tsx:73. Same tokens, same proportions — single-number
// scores instead of AFL's "G·B + total" because netball is
// goals-only. The clock pill is non-interactive (netball has no
// pause/resume; the clock auto-runs and auto-ends at the hooter).
//
// quarterLabel + clockText are computed by the parent so a single
// component covers every phase: PRE / Q1-4 / BRK / FT.
function NetballScoreBug({
  teamName,
  opponentName,
  team,
  opponent,
  quarterLabel,
  clockText,
  onOpponentGoal,
  isPending,
}: {
  teamName: string;
  opponentName: string;
  team: { goals: number };
  opponent: { goals: number };
  /** Small uppercase label inside the clock pill — e.g. "PRE", "Q2", "BRK", "FT". */
  quarterLabel: string;
  /** Big numeric line inside the clock pill — e.g. "08:00", "—". */
  clockText: string;
  onOpponentGoal?: () => void;
  isPending?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 rounded-md bg-surface px-4 py-3 shadow-card">
      {/* Left: home team */}
      <div className="min-w-0">
        <p className="truncate font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
          {teamName}
        </p>
        <p className="nums mt-0.5 flex items-baseline gap-1.5 font-mono leading-none text-ink">
          <span className="text-[36px] font-bold tracking-tightest">
            {team.goals}
          </span>
        </p>
      </div>

      {/* Centre: dark clock pill. suppressHydrationWarning on the
          countdown text because the parent's clockMs state is updated
          by an interval tick after hydration; React 18 occasionally
          flags the first post-mount setState as a hydration diff if
          the tick lands inside the hydration commit. The text itself
          re-renders fine — we just don't want a noisy warning. */}
      <div className="self-center flex flex-col items-center justify-center rounded-md bg-ink px-3 py-1.5 text-warm shadow-pop">
        <span className="font-mono text-[10px] font-bold uppercase leading-none tracking-micro text-warm/70">
          {quarterLabel}
        </span>
        <span
          className="nums mt-0.5 font-mono text-[22px] font-bold leading-none tracking-tightest text-warm"
          suppressHydrationWarning
        >
          {clockText}
        </span>
      </div>

      {/* Right: opponent — mirror layout */}
      <div className="min-w-0 text-right">
        <p className="truncate font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
          {opponentName}
        </p>
        <p className="nums mt-0.5 flex items-baseline justify-end gap-1.5 font-mono leading-none text-ink">
          <span className="text-[36px] font-bold tracking-tightest">
            {opponent.goals}
          </span>
        </p>
        {onOpponentGoal && (
          <div className="mt-0.5 flex justify-end gap-1">
            <button
              type="button"
              onClick={onOpponentGoal}
              disabled={isPending}
              className="rounded-xs bg-surface-alt px-1.5 py-0.5 font-mono text-[9px] font-semibold text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-hairline hover:text-ink disabled:pointer-events-none disabled:opacity-60"
              aria-label="Record opponent goal"
            >
              +G
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Read-only court rendering ───────────────────────────────
// Tokens stack vertically within each third (top → bottom reads
// GS, GA, WA, C, WD, GD, GK after item 3's WA/WD-to-centre move) and
// are subtly staggered left/right of centre for visual rhythm.
function CourtDisplay({
  lineup,
  ageGroup,
  squadById,
  disabled,
  onTokenTap,
  onTokenLongPress,
  scoringPositionIds,
  injuredIds,
  loanedIds,
  nextBreakLocks,
  playerStats,
  playerGoals,
}: {
  lineup: GenericLineup;
  ageGroup: AgeGroupConfig;
  squadById: Map<string, Player>;
  disabled?: boolean;
  /** Called with the playerId currently in the tapped position. */
  onTokenTap?: (positionId: string, playerId: string | null) => void;
  /** Called with the playerId for a long-press (≥500ms hold). */
  onTokenLongPress?: (positionId: string, playerId: string | null) => void;
  /**
   * Position ids that signal "tap me to score" (GS + GA in netball). Tokens
   * not in this set are still rendered but have no goal-affordance. The
   * actual handler still fires on tap regardless — this only drives
   * styling — so non-scoring positions can open the long-press menu via
   * the same component without confusing coaches into thinking everyone
   * shoots.
   */
  scoringPositionIds?: Set<string>;
  /** Players flagged as injured this game — drives INJ badge + greyscale. */
  injuredIds?: Set<string>;
  /** Players lent to opposition this game — drives LENT badge + greyscale. */
  loanedIds?: Set<string>;
  /** Position → playerId locks for the next quarter break — drives 🔒 badge. */
  nextBreakLocks?: Record<string, string>;
  /** Per-player {attack, centre, defence} ms — drives the stacked bar + total under each name. */
  playerStats?: Map<string, PlayerThirdMs>;
  /** Per-player goals scored this game — drives the dark chip in each token's top-right corner. */
  playerGoals?: Record<string, number>;
}) {
  const byThird = (third: "attack-third" | "centre-third" | "defence-third") =>
    ageGroup.positions.filter((id) => primaryThirdFor(id) === third);

  const renderThird = (positionIds: string[]) => (
    <>
      {positionIds.map((positionId) => {
        const pid = lineup.positions[positionId]?.[0] ?? null;
        const name = pid ? squadById.get(pid)?.full_name ?? null : null;
        const stats = pid ? playerStats?.get(pid) : undefined;
        const totalMs = stats
          ? stats.attack + stats.centre + stats.defence
          : undefined;
        return (
          <div
            key={positionId}
            className={`relative z-10 flex w-full ${alignClass(positionId)}`}
          >
            <PositionToken
              positionId={positionId}
              playerName={name}
              disabled={disabled}
              canScore={scoringPositionIds?.has(positionId) ?? false}
              injured={injuredIds?.has(pid ?? "") ?? false}
              loaned={loanedIds?.has(pid ?? "") ?? false}
              locked={
                pid != null && nextBreakLocks?.[positionId] === pid
              }
              stats={stats}
              totalMs={totalMs}
              goalCount={pid ? playerGoals?.[pid] : undefined}
              onTap={
                onTokenTap ? () => onTokenTap(positionId, pid) : undefined
              }
              onLongPress={
                onTokenLongPress
                  ? () => onTokenLongPress(positionId, pid)
                  : undefined
              }
            />
          </div>
        );
      })}
    </>
  );

  return (
    <Court
      attackThird={renderThird(byThird("attack-third"))}
      centreThird={renderThird(byThird("centre-third"))}
      defenceThird={renderThird(byThird("defence-third"))}
    />
  );
}

// ─── Tick clock ──────────────────────────────────────────────
// Ticks every 500ms while running so the UI clock drifts within
// half a second of the real quarter clock. Events carry elapsed_ms
// too so the state is always reconstructable from events alone.
function useClock(running: boolean, setMs: (f: (prev: number) => number) => void): void {
  useEffect(() => {
    if (!running || typeof window === "undefined") return;
    const id = window.setInterval(() => {
      setMs((prev) => prev + 500);
    }, 500);
    return () => window.clearInterval(id);
  }, [running, setMs]);
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const ss = (totalSeconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

// ─── alignClass ─────────────────────────────────────────────
// Position-keyed horizontal alignment within each band. Spreads tokens
// across the full width of the court rather than stacking them in a
// central column.
//
// Pure alternating zigzag down the court — left/right/left/right/left
// /right/left for GS, GA, WA, C, WD, GD, GK respectively. C sits dead
// centre between WA and WD as the genuine pivot. The zigzag keeps
// every adjacent pair on OPPOSITE sides, so GA/WA sit across from each
// other (instead of stacking on the same wing) and the same for WD/GD,
// matching real-court geography where GA defends from the opposite
// side to WA's attacking lane.
//
// AFL doesn't have an analogous concept (zones are spatial bands, not
// named positions), so this is netball-specific and lives here rather
// than in the shared sports config.
function alignClass(positionId: string): string {
  switch (positionId) {
    case "gs":
      return "justify-start pl-4";
    case "ga":
      return "justify-end pr-4";
    case "wa":
      return "justify-start pl-4";
    case "c":
      return "justify-center";
    case "wd":
      return "justify-end pr-4";
    case "gd":
      return "justify-start pl-4";
    case "gk":
      return "justify-end pr-4";
    default:
      return "justify-center";
  }
}

// ─── applyLocks ─────────────────────────────────────────────
// Pre-applies a lock map to a lineup before passing to the next-quarter
// lineup picker. For each (positionId, playerId) lock:
//   1. Remove the player from any other position they currently occupy.
//   2. Bump whoever currently holds positionId out to the bench.
//   3. Place the locked player at positionId.
// Soft lock: the picker shows this as the starting state, coach can
// still rearrange.
function applyLocks(
  base: GenericLineup,
  locks: Record<string, string>,
  positionIds: readonly string[],
): GenericLineup {
  if (Object.keys(locks).length === 0) return base;
  const next: GenericLineup = {
    positions: {},
    bench: [...base.bench],
  };
  for (const id of positionIds) {
    next.positions[id] = [...(base.positions[id] ?? [])];
  }
  for (const [posId, playerId] of Object.entries(locks)) {
    // 1. Remove the locked player from any other position.
    for (const id of Object.keys(next.positions)) {
      if (id !== posId) {
        next.positions[id] = next.positions[id].filter((p) => p !== playerId);
      }
    }
    next.bench = next.bench.filter((p) => p !== playerId);
    // 2. Bench the existing occupant of the target position (if any).
    const displaced = next.positions[posId] ?? [];
    for (const p of displaced) {
      if (p !== playerId && !next.bench.includes(p)) next.bench.push(p);
    }
    // 3. Place the locked player.
    next.positions[posId] = [playerId];
  }
  return next;
}
