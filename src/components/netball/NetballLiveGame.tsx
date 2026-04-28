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

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Game, GameEvent, LiveAuth, Player } from "@/lib/types";
import { Court } from "@/components/netball/Court";
import { PositionToken } from "@/components/netball/PositionToken";
import { NetballLineupPicker } from "@/components/netball/LineupPicker";
import { NetballPlayerActions } from "@/components/netball/NetballPlayerActions";
import { NetballQuarterBreak } from "@/components/netball/NetballQuarterBreak";
import { PickReplacementSheet } from "@/components/netball/PickReplacementSheet";
import { netballSport, primaryThirdFor } from "@/lib/sports/netball";
import type { AgeGroupConfig } from "@/lib/sports/types";
import {
  type GenericLineup,
  emptyGenericLineup,
  gamePositionCounts,
  seasonPositionCounts,
} from "@/lib/sports/netball/fairness";
import {
  startNetballGame,
  periodBreakSwap,
  startNetballQuarter,
  endNetballQuarter,
  recordNetballGoal,
  recordNetballOpponentGoal,
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
    quarterEnded,
    finalised,
    thisGameEvents,
    seasonEvents,
  } = props;

  const [isPending, startTransition] = useTransition();
  const [clockMs, setClockMs] = useState(_quarterElapsedMs);

  // Quarter length in ms — varies by age group (Set 6min, Go/11u 8min,
  // 12u 10min, 13u 12min, Open 15min). Drives the countdown header and
  // the auto-end-at-hooter trigger below.
  const quarterLengthMs = ageGroup.periodSeconds * 1000;
  const remainingMs = Math.max(0, quarterLengthMs - clockMs);

  // Re-sync the local clock to the replayed elapsed_ms whenever the
  // quarter changes (Q1 → Q2 → …) or the page reloads with a fresh
  // replayed value. Without this, useState's one-shot init means the
  // clock keeps ticking from Q1's last value into Q2.
  useEffect(() => {
    setClockMs(_quarterElapsedMs);
  }, [_quarterElapsedMs, currentQuarter]);

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
  // Modal target: long-press opens player actions for this player.
  const [actionsTarget, setActionsTarget] = useState<{
    playerId: string;
    positionId: string | null;
  } | null>(null);
  // Pick-replacement target: set after marking a court player injured.
  const [replacingTarget, setReplacingTarget] = useState<{
    positionId: string;
    injuredPlayerId: string;
  } | null>(null);
  // Pending goal: tap on a GS/GA token doesn't fire the goal directly;
  // it sets this and surfaces a confirm sheet (mirrors AFL's score
  // sheet). Prevents accidental scoring from a stray tap during play.
  const [pendingGoal, setPendingGoal] = useState<{
    playerId: string;
    positionId: string;
  } | null>(null);

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
    startTransition(async () => {
      await recordNetballGoal(auth, game.id, playerId, currentQuarter, clockMs);
    });
    setPendingGoal(null);
  };

  const handleCancelGoal = () => setPendingGoal(null);

  // long-press on any token → open the player actions modal.
  const handleTokenLongPress = (positionId: string, playerId: string | null) => {
    if (!playerId) return;
    setActionsTarget({ playerId, positionId });
  };

  // ─ Modal action wiring ───
  const closeActions = () => setActionsTarget(null);

  // Mark injured: write the audit-trail event, flag the player client-side,
  // then auto-prompt the bench replacement sheet so the coach can plug
  // the gap in two taps. Substitution itself is local-overlay only until
  // the next quarter break makes it durable.
  const handleMarkInjured = () => {
    if (!actionsTarget) return;
    const { playerId, positionId } = actionsTarget;
    setInjuredIds((prev) => new Set(prev).add(playerId));
    startTransition(async () => {
      await markInjury(auth, game.id, {
        player_id: playerId,
        injured: true,
        quarter: Math.max(1, currentQuarter),
        elapsed_ms: clockMs,
      });
    });
    closeActions();
    // Only auto-prompt when the injured player was on the court.
    if (positionId) {
      // Pop them off the court immediately in the local overlay so
      // the picker sees the gap.
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
      setReplacingTarget({ positionId, injuredPlayerId: playerId });
    }
  };

  const handleUnInjury = () => {
    if (!actionsTarget) return;
    const { playerId } = actionsTarget;
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
    closeActions();
  };

  const handleMarkLoaned = () => {
    if (!actionsTarget) return;
    const { playerId } = actionsTarget;
    setLoanedIds((prev) => new Set(prev).add(playerId));
    startTransition(async () => {
      await markLoan(auth, game.id, {
        player_id: playerId,
        loaned: true,
        quarter: Math.max(1, currentQuarter),
        elapsed_ms: clockMs,
      });
    });
    closeActions();
  };

  const handleUnLoan = () => {
    if (!actionsTarget) return;
    const { playerId } = actionsTarget;
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
    closeActions();
  };

  const handleLockForNextBreak = () => {
    if (!actionsTarget?.positionId) return;
    const { playerId, positionId } = actionsTarget;
    setNextBreakLocks((prev) => ({ ...prev, [positionId]: playerId }));
    closeActions();
  };

  const handleUnlock = () => {
    if (!actionsTarget?.positionId) return;
    const { positionId } = actionsTarget;
    setNextBreakLocks((prev) => {
      const next = { ...prev };
      delete next[positionId];
      return next;
    });
    closeActions();
  };

  // Pick-replacement: drop the picked bench player into the vacated
  // position in the local overlay. Substitution becomes durable when
  // the next quarter break confirms via period_break_swap.
  const handlePickReplacement = (replacementId: string) => {
    if (!replacingTarget) return;
    const { positionId } = replacingTarget;
    setLocalOverlay((prev) => {
      const base = prev ?? initialLineup ?? emptyGenericLineup(ageGroup.positions);
      const next: GenericLineup = {
        positions: { ...base.positions },
        bench: base.bench.filter((id) => id !== replacementId),
      };
      next.positions[positionId] = [replacementId];
      return next;
    });
    setReplacingTarget(null);
  };

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
        <CourtDisplay lineup={onCourt} ageGroup={ageGroup} squadById={squadById} disabled />
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
          onStarted={() => {
            // Locks are single-use; local overlay is durable now via
            // the period_break_swap event the component just wrote.
            setNextBreakLocks({});
            setLocalOverlay(null);
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
        onOpponentGoal={() =>
          startTransition(async () => {
            await recordNetballOpponentGoal(
              auth,
              game.id,
              currentQuarter,
              clockMs,
            );
          })
        }
      />

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

      {/* Replace-after-injury sheet — opens after Mark injured for a court player. */}
      {replacingTarget && (
        <PickReplacementSheet
          positionId={replacingTarget.positionId}
          injuredPlayerName={
            squadById.get(replacingTarget.injuredPlayerId)?.full_name ?? "Player"
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
}) {
  const byThird = (third: "attack-third" | "centre-third" | "defence-third") =>
    ageGroup.positions.filter((id) => primaryThirdFor(id) === third);

  const renderThird = (positionIds: string[]) => (
    <>
      {positionIds.map((positionId) => {
        const pid = lineup.positions[positionId]?.[0] ?? null;
        const name = pid ? squadById.get(pid)?.full_name ?? null : null;
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
