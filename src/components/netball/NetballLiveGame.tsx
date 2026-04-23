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

  // Client-side tick during live play.
  useClock(!quarterEnded && !finalised && currentQuarter > 0, setClockMs);

  const squadById = useMemo(() => new Map(squad.map((p) => [p.id, p])), [squad]);

  // ─── State machine ─────────────────────────────────────────
  // hasStarted: we've recorded an initial lineup_set already.
  const hasStarted = !!initialLineup;

  // onCourt: the lineup actually playing now (for live display).
  // When quarterEnded + !finalised, we show the LineupPicker instead.
  const onCourt = initialLineup ?? emptyGenericLineup(ageGroup.positions);

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
          availableIds={availableIds}
          initialLineup={onCourt}
          thisGameEvents={thisGameEvents}
          seasonEvents={seasonEvents}
          onConfirm={async (lineup) =>
            new Promise<void>((resolve) => {
              startTransition(async () => {
                await periodBreakSwap(auth, game.id, nextQuarter, lineup);
                await startNetballQuarter(auth, game.id, nextQuarter);
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
  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="text-center">
        <h1 className="text-xl font-semibold">
          Q{currentQuarter} · {formatClock(clockMs)}
        </h1>
        <ScoreHeader team={teamScore} opponent={opponentScore} />
      </header>

      <CourtDisplay lineup={onCourt} ageGroup={ageGroup} squadById={squadById} />

      {/* Score buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              await recordNetballGoal(auth, game.id, null, currentQuarter, clockMs);
            })
          }
          disabled={isPending}
          className="flex-1 rounded-lg bg-brand-600 py-4 text-center text-lg font-bold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          + Goal
        </button>
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              await recordNetballOpponentGoal(auth, game.id, currentQuarter, clockMs);
            })
          }
          disabled={isPending}
          className="flex-1 rounded-lg border border-neutral-300 bg-white py-4 text-center text-lg font-bold text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
        >
          + Opp goal
        </button>
      </div>

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
        Substitutions happen at the quarter break — there are no mid-play subs in netball.
      </p>
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
function CourtDisplay({
  lineup,
  ageGroup,
  squadById,
  disabled,
}: {
  lineup: GenericLineup;
  ageGroup: AgeGroupConfig;
  squadById: Map<string, Player>;
  disabled?: boolean;
}) {
  const byThird = (third: "attack-third" | "centre-third" | "defence-third") =>
    ageGroup.positions.filter((id) => primaryThirdFor(id) === third);

  const token = (positionId: string) => {
    const pid = lineup.positions[positionId]?.[0];
    const name = pid ? squadById.get(pid)?.full_name ?? null : null;
    return <PositionToken key={positionId} positionId={positionId} playerName={name} disabled={disabled} />;
  };

  return (
    <Court
      attackThird={
        <div className="flex w-full items-center justify-around gap-2 px-2">
          {byThird("attack-third").map(token)}
        </div>
      }
      centreThird={
        <div className="flex w-full items-center justify-around gap-2 px-2">
          {byThird("centre-third").map(token)}
        </div>
      }
      defenceThird={
        <div className="flex w-full items-center justify-around gap-2 px-2">
          {byThird("defence-third").map(token)}
        </div>
      }
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
