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

import { useEffect, useMemo, useState, useTransition } from "react";
import type { Game, GameEvent, LiveAuth, Player } from "@/lib/types";
import { Court } from "@/components/netball/Court";
import { PositionToken } from "@/components/netball/PositionToken";
import { NetballLineupPicker } from "@/components/netball/LineupPicker";
import { NetballPlayerActions } from "@/components/netball/NetballPlayerActions";
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
  // tap on a GS/GA token → record a goal attributed to that player.
  // tap on any other token → no-op (long-press still works).
  const handleTokenTap = (positionId: string, playerId: string | null) => {
    if (!playerId) return;
    if (!SCORING_POSITIONS.has(positionId)) return;
    if (currentQuarter < 1 || quarterEnded || finalised) return;
    startTransition(async () => {
      await recordNetballGoal(auth, game.id, playerId, currentQuarter, clockMs);
    });
  };

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
        <header className="text-center">
          <h1 className="text-xl font-semibold">Full time</h1>
          <ScoreHeader team={teamScore} opponent={opponentScore} />
        </header>
        <CourtDisplay lineup={onCourt} ageGroup={ageGroup} squadById={squadById} disabled />
      </div>
    );
  }

  // ─── Quarter break — lineup picker for the next quarter ────
  if (quarterEnded && currentQuarter < 4) {
    const nextQuarter = currentQuarter + 1;
    // Filter the candidate pool: injured + loaned players are excluded
    // from suggestions and from manual placement (the picker will still
    // show them as ineligible if a coach taps a slot, since they're
    // unavailable to play).
    const filteredAvailable = availableIds.filter(
      (id) => !injuredIds.has(id) && !loanedIds.has(id),
    );
    // Pre-apply lock-for-next-break: ensures the locked player starts
    // in the locked position when the picker opens. Coach can still
    // drag them out manually (it's a soft preference, not a hard pin).
    const seedLineup: GenericLineup = applyLocks(onCourt, nextBreakLocks, ageGroup.positions);
    return (
      <div className="flex flex-col gap-4 p-4">
        <header className="text-center">
          <h1 className="text-xl font-semibold">
            Quarter {currentQuarter} break
          </h1>
          <ScoreHeader team={teamScore} opponent={opponentScore} />
          <p className="text-sm text-neutral-600">
            Pick the lineup for Q{nextQuarter}.
          </p>
        </header>
        <NetballLineupPicker
          ageGroup={ageGroup}
          squad={squad}
          availableIds={filteredAvailable}
          initialLineup={seedLineup}
          thisGameEvents={thisGameEvents}
          seasonEvents={seasonEvents}
          onConfirm={async (lineup) =>
            new Promise<void>((resolve) => {
              startTransition(async () => {
                await periodBreakSwap(auth, game.id, nextQuarter, lineup);
                await startNetballQuarter(auth, game.id, nextQuarter);
                // Locks are single-use. Local overlay is durable now via
                // the period_break_swap event we just fired, so reset both.
                setNextBreakLocks({});
                setLocalOverlay(null);
                resolve();
              });
            })
          }
          confirmLabel={`Start Q${nextQuarter}`}
          disabled={isPending}
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
        <header className="text-center">
          <h1 className="text-xl font-semibold">vs {game.opponent}</h1>
          <p className="text-sm text-neutral-600">
            Lineup locked. Tap when the umpires call play.
          </p>
        </header>
        <CourtDisplay lineup={onCourt} ageGroup={ageGroup} squadById={squadById} disabled />
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
      </div>
    );
  }

  // ─── Between Q4 and finalise: show finalise button ──────────
  if (quarterEnded && currentQuarter >= 4) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <header className="text-center">
          <h1 className="text-xl font-semibold">End of Q4</h1>
          <ScoreHeader team={teamScore} opponent={opponentScore} />
        </header>
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
      <header className="text-center">
        <h1 className="text-xl font-semibold">
          Q{currentQuarter} · {formatClock(clockMs)}
        </h1>
        <ScoreHeader team={teamScore} opponent={opponentScore} />
      </header>

      <CourtDisplay
        lineup={onCourt}
        ageGroup={ageGroup}
        squadById={squadById}
        onTokenTap={handleTokenTap}
        onTokenLongPress={handleTokenLongPress}
        scoringPositionIds={SCORING_POSITIONS}
      />

      {/* Opponent goal — global because there's no opposition player to tap. */}
      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            await recordNetballOpponentGoal(auth, game.id, currentQuarter, clockMs);
          })
        }
        disabled={isPending}
        className="w-full rounded-lg border border-neutral-300 bg-white py-4 text-center text-lg font-bold text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
      >
        + Opp goal
      </button>

      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            await endNetballQuarter(auth, game.id, currentQuarter, clockMs);
          })
        }
        disabled={isPending}
        className="w-full rounded-lg border border-warn/40 bg-warn-soft py-3 text-center font-semibold text-warn disabled:opacity-60"
      >
        {isPending ? "…" : `End Q${currentQuarter}`}
      </button>

      <p className="text-center text-xs text-neutral-500">
        Tap GS or GA to record a goal. Long-press any player for actions.
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
    </div>
  );
}

// ─── Score header ────────────────────────────────────────────
function ScoreHeader({
  team,
  opponent,
}: {
  team: { goals: number };
  opponent: { goals: number };
}) {
  return (
    <div className="mt-1 flex justify-center gap-6 text-3xl font-bold">
      <span className="text-brand-700">{team.goals}</span>
      <span className="text-neutral-400">—</span>
      <span className="text-neutral-700">{opponent.goals}</span>
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
}) {
  const byThird = (third: "attack-third" | "centre-third" | "defence-third") =>
    ageGroup.positions.filter((id) => primaryThirdFor(id) === third);

  // Subtle alternating horizontal offset to break up the vertical column.
  // Cycles through these values by index within each third.
  const STAGGER = ["-1.25rem", "1.25rem", "-0.5rem", "0.5rem"];

  const renderThird = (positionIds: string[]) => (
    <>
      {positionIds.map((positionId, i) => {
        const pid = lineup.positions[positionId]?.[0] ?? null;
        const name = pid ? squadById.get(pid)?.full_name ?? null : null;
        return (
          <div
            key={positionId}
            className="flex justify-center"
            style={{ transform: `translateX(${STAGGER[i % STAGGER.length]})` }}
          >
            <PositionToken
              positionId={positionId}
              playerName={name}
              disabled={disabled}
              canScore={scoringPositionIds?.has(positionId) ?? false}
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
