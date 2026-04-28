"use client";

// ─── Netball Quarter Break ────────────────────────────────────
// Visual + interaction language mirrors AFL's QuarterBreak component
// at src/components/live/QuarterBreak.tsx. The header card carries the
// fairness score + suggested-reshuffle toggle, and the body lists
// players grouped by court third (Attack / Centre / Defence) plus
// Bench. Tap two players to swap their slots — the same "two-tap to
// swap" pattern coaches already know from AFL.
//
// Differences from AFL:
//   - Each netball position holds exactly 1 player, so the swap is
//     position-to-position rather than zone-bucket-to-zone-bucket.
//   - Time bars show three thirds (attack/centre/defence) instead of
//     five zones — uses the same colourblind-safe palette tokens
//     (zone-f / zone-c / zone-b) so the design language carries.
//   - Position chip (GS / GA / etc.) replaces the AFL jersey-number
//     badge since netball doesn't use squad numbers.
//   - Fairness score is the position-count CV from
//     netballFairnessScore, not minutes-equity.

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import {
  periodBreakSwap,
  startNetballQuarter,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/netball-actions";
import {
  netballSport,
  primaryThirdFor,
} from "@/lib/sports/netball";
import {
  type GenericLineup,
  type PlayerThirdMs,
  formatMinSec,
  gamePositionCounts,
  lastQuarterThirds,
  lastQuarterTeammatesInThird,
  netballFairnessScore,
  playerThirdMs,
  seasonPositionCounts,
  suggestNetballLineup,
} from "@/lib/sports/netball/fairness";
import type { AgeGroupConfig } from "@/lib/sports/types";
import type { GameEvent, LiveAuth, Player } from "@/lib/types";

// Slot identifiers used to bucket the lineup display. "bench" is a
// pseudo-third for the strip below the three on-court bands.
type Slot = "attack-third" | "centre-third" | "defence-third" | "bench";

const SLOT_LABEL: Record<Slot, string> = {
  "attack-third": "Attack",
  "centre-third": "Centre",
  "defence-third": "Defence",
  bench: "Bench",
};

// Map third → bar-segment colour. Same palette tokens AFL uses (orange
// = forward / fuchsia = centre / blue = back) so a coach who manages
// both sports doesn't have to relearn the colour code.
const THIRD_BAR_COLOR: Record<"attack" | "centre" | "defence", string> = {
  attack: "bg-zone-f",
  centre: "bg-zone-c",
  defence: "bg-zone-b",
};

interface Props {
  auth: LiveAuth;
  gameId: string;
  squad: Player[];
  availableIds: string[];
  ageGroup: AgeGroupConfig;
  /** Quarter that just ended (1, 2, or 3). nextQuarter = currentQuarter + 1. */
  currentQuarter: number;
  /** Lineup at the end of the quarter that just played — the "stays" baseline. */
  previousLineup: GenericLineup;
  /** Lock-for-next-break entries from the live actions menu. Pre-applied to the suggested seed. */
  preAppliedLocks: Record<string, string>;
  /** Quarter length in seconds — drives time bars. */
  periodSeconds: number;
  thisGameEvents: GameEvent[];
  seasonEvents: GameEvent[];
  injuredIds: Set<string>;
  loanedIds: Set<string>;
  /** Per-player goals scored this game — drives the score chip on each tile. */
  playerGoals: Record<string, number>;
  /**
   * Per-player time-by-third map computed by the parent. Includes
   * mid-quarter substitutions via the segment-based accounting in
   * NetballLiveGame — passing it down avoids the Q-break tiles
   * computing their own (event-only) version that misses
   * mid-quarter subs and shows a substitute as 0:00 while the
   * injured player keeps the credit.
   */
  playerStats?: Map<string, PlayerThirdMs>;
  /**
   * Mid-quarter substitution log for the quarter just ended. Threaded
   * straight into period_break_swap's metadata so the replay engine
   * can split the closing quarter's time credit between sub-out and
   * sub-in players. Without this, after the next quarter starts and
   * the page replays from events, the original lineup would get
   * credited the full quarter (and the substitute would show 0:00).
   */
  midQuarterSubs: Array<{
    positionId: string;
    outPlayerId: string;
    inPlayerId: string;
    atMs: number;
  }>;
  /** Called once the period_break_swap + quarter_start actions complete. */
  onStarted: () => void;
}

export function NetballQuarterBreak({
  auth,
  gameId,
  squad,
  availableIds,
  ageGroup,
  currentQuarter,
  previousLineup,
  preAppliedLocks,
  periodSeconds,
  thisGameEvents,
  seasonEvents,
  injuredIds,
  loanedIds,
  playerGoals,
  playerStats,
  midQuarterSubs,
  onStarted,
}: Props) {
  const nextQuarter = currentQuarter + 1;
  const playersById = useMemo(
    () => new Map(squad.map((p) => [p.id, p])),
    [squad],
  );
  const positions = ageGroup.positions;

  // ─── Position grouping by third (drives section order) ────
  // Order top→bottom: Attack, Centre, Defence, Bench. Same as the live
  // court so the q-break view echoes the playing geography.
  const positionsByThird = useMemo(() => {
    const m: Record<Slot, string[]> = {
      "attack-third": [],
      "centre-third": [],
      "defence-third": [],
      bench: [],
    };
    for (const id of positions) {
      const t = primaryThirdFor(id);
      if (t === "attack-third") m["attack-third"].push(id);
      else if (t === "centre-third") m["centre-third"].push(id);
      else if (t === "defence-third") m["defence-third"].push(id);
    }
    return m;
  }, [positions]);

  // ─── Suggested reshuffle ───────────────────────────────────
  const sidelinedSet = useMemo(() => {
    const s = new Set<string>();
    injuredIds.forEach((id) => s.add(id));
    loanedIds.forEach((id) => s.add(id));
    return s;
  }, [injuredIds, loanedIds]);
  // Pool: availableIds + anyone currently on court (catches mid-quarter
  // fill-ins) minus injured/loaned. Same expansion the LineupPicker
  // does so a substituted-in player doesn't vanish at Q-break.
  const candidatePool = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (id: string) => {
      if (id && !seen.has(id) && !sidelinedSet.has(id)) {
        seen.add(id);
        out.push(id);
      }
    };
    for (const id of availableIds) add(id);
    for (const ids of Object.values(previousLineup.positions)) for (const id of ids) add(id);
    for (const id of previousLineup.bench) add(id);
    return out;
  }, [availableIds, previousLineup, sidelinedSet]);

  const suggestedLineup = useMemo(() => {
    const season = seasonPositionCounts(seasonEvents);
    const thisGame = gamePositionCounts(thisGameEvents);
    const thirdLookup = primaryThirdFor as (
      positionId: string,
    ) => "attack-third" | "centre-third" | "defence-third" | null;
    const lastThirds = lastQuarterThirds(thisGameEvents, thirdLookup);
    const prevTeammates = lastQuarterTeammatesInThird(
      thisGameEvents,
      thirdLookup,
    );
    const base = suggestNetballLineup({
      playerIds: candidatePool,
      positions,
      season,
      thisGame,
      isAllowed: (_pid, posId) => positions.includes(posId),
      seed: nextQuarter,
      thirdOf: thirdLookup,
      lastQuarterThird: lastThirds,
      previousTeammates: prevTeammates,
    });
    // Pre-apply locks: locked player goes to locked position, displacing
    // whoever the suggester put there.
    if (Object.keys(preAppliedLocks).length === 0) return base;
    const next: GenericLineup = {
      positions: {},
      bench: [...base.bench],
    };
    for (const id of positions) next.positions[id] = [...(base.positions[id] ?? [])];
    for (const [posId, lockedPid] of Object.entries(preAppliedLocks)) {
      // Remove locked player from anywhere they currently sit.
      for (const id of Object.keys(next.positions)) {
        if (id !== posId) next.positions[id] = next.positions[id].filter((p) => p !== lockedPid);
      }
      next.bench = next.bench.filter((p) => p !== lockedPid);
      // Bench whoever was at the target.
      const displaced = next.positions[posId] ?? [];
      for (const p of displaced) {
        if (p !== lockedPid && !next.bench.includes(p)) next.bench.push(p);
      }
      next.positions[posId] = [lockedPid];
    }
    return next;
  }, [
    candidatePool,
    positions,
    seasonEvents,
    thisGameEvents,
    nextQuarter,
    preAppliedLocks,
  ]);

  // ─── Draft state + reshuffle toggle ─────────────────────────
  const [draft, setDraft] = useState<GenericLineup>(suggestedLineup);
  const [selected, setSelected] = useState<string | null>(null);
  const [useReshuffle, setUseReshuffle] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Refresh draft when toggle flips or suggestion changes.
  useEffect(() => {
    setDraft(useReshuffle ? suggestedLineup : previousLineup);
    setSelected(null);
  }, [useReshuffle, suggestedLineup, previousLineup]);

  // ─── Time bars (per-third minutes, color-coded) ────────────
  // Source from the parent's playerStats prop (which factors in the
  // segment-based mid-quarter sub accounting). Falls back to a local
  // event-only computation if the parent hasn't provided stats —
  // shouldn't happen in normal flow but keeps the component self-
  // sufficient.
  const thirdMs = useMemo(() => {
    if (playerStats) return playerStats;
    return playerThirdMs(
      thisGameEvents,
      null,
      periodSeconds,
      primaryThirdFor as (positionId: string) => "attack-third" | "centre-third" | "defence-third" | null,
    );
  }, [playerStats, thisGameEvents, periodSeconds]);

  // ─── Fairness score (combined season + this-game position counts) ──
  const fairness = useMemo(() => {
    const season = seasonPositionCounts(seasonEvents);
    const thisGame = gamePositionCounts(thisGameEvents);
    const combined: typeof season = {};
    const merge = (src: typeof season) => {
      for (const [pid, counts] of Object.entries(src)) {
        combined[pid] ??= {};
        for (const [posId, n] of Object.entries(counts)) {
          combined[pid][posId] = (combined[pid][posId] ?? 0) + n;
        }
      }
    };
    merge(season);
    merge(thisGame);
    return netballFairnessScore(combined);
  }, [seasonEvents, thisGameEvents]);

  // ─── Helpers ───────────────────────────────────────────────
  function slotOfPosition(positionId: string): Slot {
    const t = primaryThirdFor(positionId);
    if (t === "attack-third") return "attack-third";
    if (t === "centre-third") return "centre-third";
    if (t === "defence-third") return "defence-third";
    return "bench";
  }

  function positionOfPlayer(pid: string, l: GenericLineup): string | null {
    for (const [posId, ids] of Object.entries(l.positions)) {
      if (ids.includes(pid)) return posId;
    }
    return null;
  }

  function isOnBench(pid: string, l: GenericLineup): boolean {
    return l.bench.includes(pid);
  }

  function slotOfPlayer(pid: string, l: GenericLineup): Slot | null {
    const pos = positionOfPlayer(pid, l);
    if (pos) return slotOfPosition(pos);
    if (isOnBench(pid, l)) return "bench";
    return null;
  }

  // Two-tap swap. If both selected players are in positions, swap them.
  // If one is on bench and one is in a position, swap (bench player
  // takes the position, on-court player goes to bench).
  function handleTap(pid: string) {
    if (sidelinedSet.has(pid)) return;
    if (!selected) {
      setSelected(pid);
      return;
    }
    if (selected === pid) {
      setSelected(null);
      return;
    }
    const a = selected;
    const b = pid;
    setDraft((prev) => {
      const aPos = positionOfPlayer(a, prev);
      const bPos = positionOfPlayer(b, prev);
      const aBench = isOnBench(a, prev);
      const bBench = isOnBench(b, prev);
      const next: GenericLineup = {
        positions: Object.fromEntries(
          Object.entries(prev.positions).map(([k, v]) => [k, [...v]]),
        ),
        bench: [...prev.bench],
      };
      // Helper: replace player x with player y in position posId.
      const replaceAt = (posId: string, x: string, y: string) => {
        next.positions[posId] = (next.positions[posId] ?? []).map((p) => (p === x ? y : p));
      };
      const removeFromBench = (x: string) => {
        next.bench = next.bench.filter((p) => p !== x);
      };
      if (aPos && bPos) {
        replaceAt(aPos, a, b);
        replaceAt(bPos, b, a);
      } else if (aPos && bBench) {
        replaceAt(aPos, a, b);
        removeFromBench(b);
        next.bench.push(a);
      } else if (aBench && bPos) {
        replaceAt(bPos, b, a);
        removeFromBench(a);
        next.bench.push(b);
      } else {
        // Both on bench: swap order in the bench array (no-op effectively).
      }
      return next;
    });
    setSelected(null);
  }

  function handleToggleReshuffle() {
    setUseReshuffle((v) => !v);
  }

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const r1 = await periodBreakSwap(
        auth,
        gameId,
        nextQuarter,
        draft,
        midQuarterSubs,
      );
      if (!r1.success) {
        setError(r1.error);
        return;
      }
      const r2 = await startNetballQuarter(auth, gameId, nextQuarter);
      if (!r2.success) {
        setError(r2.error);
        return;
      }
      onStarted();
    });
  }

  // ─── Render ────────────────────────────────────────────────
  const slots: Slot[] = ["attack-third", "centre-third", "defence-third", "bench"];

  return (
    <div className="space-y-4">
      {/* Header card — overline + heading + fairness + toggle */}
      <div className="rounded-md border border-hairline bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
              Quarter break
            </p>
            <p className="mt-0.5 text-lg font-bold text-ink">
              Set positions for Q{nextQuarter}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums text-brand-600">
              {fairness}
            </p>
            <p className="text-[11px] uppercase tracking-micro text-ink-mute">
              Fairness
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            variant={useReshuffle ? "primary" : "secondary"}
            onClick={handleToggleReshuffle}
          >
            {useReshuffle ? "✓ Using suggested reshuffle" : "Apply suggested reshuffle"}
          </Button>
          <span className="text-xs text-ink-dim">
            {useReshuffle
              ? "Tap to keep last quarter's lineup instead."
              : `Tap to auto-rebalance for Q${nextQuarter}.`}
          </span>
        </div>
      </div>

      <p className="px-1 text-xs text-ink-dim">
        Tap any two players to swap them — even across thirds or to the bench.
      </p>

      {/* Per-slot sections */}
      <div className="grid gap-3 sm:grid-cols-2">
        {slots.map((slot) => {
          // Build the list of {playerId, positionId|null} for this slot.
          const items: { pid: string; positionId: string | null }[] = [];
          if (slot === "bench") {
            for (const pid of draft.bench) items.push({ pid, positionId: null });
          } else {
            for (const posId of positionsByThird[slot]) {
              const occupant = draft.positions[posId]?.[0];
              if (occupant) items.push({ pid: occupant, positionId: posId });
            }
          }
          const cap = slot === "bench" ? null : positionsByThird[slot].length;
          return (
            <div
              key={slot}
              className="rounded-md border border-hairline bg-surface p-3 shadow-card"
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-dim">
                  {SLOT_LABEL[slot]}
                </h3>
                <span className="text-xs tabular-nums text-ink-mute">
                  {items.length}
                  {cap !== null && ` / ${cap}`}
                </span>
              </div>
              {items.length === 0 ? (
                <p className="px-1 py-2 text-xs text-ink-mute">Empty</p>
              ) : (
                <ul className="space-y-1.5">
                  {items.map(({ pid, positionId }) => {
                    const p = playersById.get(pid);
                    if (!p) return null;
                    const isSelected = selected === pid;
                    const isInjured = injuredIds.has(pid);
                    const isLoaned = loanedIds.has(pid);
                    const isSidelined = isInjured || isLoaned;
                    const stats = thirdMs.get(pid) ?? {
                      attack: 0,
                      centre: 0,
                      defence: 0,
                    };
                    const totalMs = stats.attack + stats.centre + stats.defence;
                    const prevSlot = slotOfPlayer(pid, previousLineup);
                    const moved = prevSlot && prevSlot !== slot;
                    return (
                      <li key={pid}>
                        <PlayerTile
                          player={p}
                          positionId={positionId}
                          isSelected={isSelected}
                          isInjured={isInjured}
                          isLoaned={isLoaned}
                          isSidelined={isSidelined}
                          movedFromLabel={
                            moved && prevSlot
                              ? SLOT_LABEL[prevSlot]
                              : null
                          }
                          stays={!moved && !isSidelined && prevSlot != null}
                          stats={stats}
                          totalMs={totalMs}
                          goalCount={playerGoals[pid] ?? 0}
                          onTap={() => handleTap(pid)}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={handleStart} loading={isPending}>
          Start Q{nextQuarter}
        </Button>
      </div>
    </div>
  );
}

// ─── Player tile ─────────────────────────────────────────────
// Mirrors the AFL QuarterBreak tile at LiveGame.tsx:364 — flat row,
// position chip on the left, name + movement underneath, time bar
// floating to the right. Tapping fires the parent's handleTap.
function PlayerTile({
  player,
  positionId,
  isSelected,
  isInjured,
  isLoaned,
  isSidelined,
  movedFromLabel,
  stays,
  stats,
  totalMs,
  goalCount,
  onTap,
}: {
  player: Player;
  positionId: string | null;
  isSelected: boolean;
  isInjured: boolean;
  isLoaned: boolean;
  isSidelined: boolean;
  movedFromLabel: string | null;
  stays: boolean;
  stats: PlayerThirdMs;
  totalMs: number;
  goalCount: number;
  onTap: () => void;
}) {
  const positionShort = positionId
    ? netballSport.allPositions.find((pp) => pp.id === positionId)?.shortLabel ??
      positionId.toUpperCase()
    : "B";
  const total = totalMs || 1;
  const pct = (v: number) => `${(v / total) * 100}%`;
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={isSidelined}
      aria-disabled={isSidelined}
      className={`relative flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors duration-fast ease-out-quart ${
        isSelected
          ? "border-brand-500 bg-brand-50 ring-2 ring-brand-400"
          : isSidelined
          ? "cursor-not-allowed border-hairline bg-surface-alt opacity-60"
          : "border-hairline bg-surface hover:bg-surface-alt"
      }`}
    >
      {/* Goal-count chip — top-right corner, dark pill, mirrors AFL.
          Hidden when zero so non-scorers stay visually clean. */}
      {goalCount > 0 && (
        <span
          className="nums absolute -right-1 -top-1.5 z-10 inline-flex items-center gap-0.5 rounded-xs bg-ink px-1 py-0.5 font-mono text-[9px] font-bold uppercase leading-none tracking-micro text-warm shadow-card"
          aria-label={`${goalCount} goal${goalCount === 1 ? "" : "s"}`}
        >
          {goalCount}
        </span>
      )}
      <span className="flex items-center gap-2">
        {/* Position chip — sky-accent like the live token. "B" for bench. */}
        <span className="inline-flex h-6 min-w-[1.75rem] items-center justify-center rounded-full bg-sky-100 px-1 font-mono text-[10px] font-bold uppercase tracking-micro text-sky-800 tabular-nums">
          {positionShort}
        </span>
        <span className="flex flex-col items-start">
          <span className="flex items-center gap-1.5">
            <span className="font-medium text-ink">{player.full_name}</span>
            {isInjured && (
              <span className="rounded-xs bg-danger px-1 font-mono text-[9px] font-bold uppercase leading-none tracking-micro text-white">
                INJ
              </span>
            )}
            {isLoaned && !isInjured && (
              <span className="rounded-xs bg-warn px-1 font-mono text-[9px] font-bold uppercase leading-none tracking-micro text-white">
                LENT
              </span>
            )}
          </span>
          {movedFromLabel && !isSidelined && (
            <span className="text-[10px] font-semibold uppercase tracking-micro text-brand-600">
              {movedFromLabel} → {positionId
                ? (netballSport.allPositions.find((pp) => pp.id === positionId)?.shortLabel ?? "")
                : "Bench"}
            </span>
          )}
          {stays && !isSidelined && !movedFromLabel && (
            <span className="text-[10px] uppercase tracking-micro text-ink-mute">
              stays
            </span>
          )}
          {totalMs > 0 && !isSidelined && (
            <span className="nums font-mono text-[10px] font-semibold text-ink-dim">
              {formatMinSec(totalMs)}
            </span>
          )}
        </span>
      </span>
      {/* Time bar — three thirds, colour-coded zone-f / zone-c / zone-b */}
      <span
        className="flex h-3 flex-1 max-w-[60px] overflow-hidden rounded-full bg-surface-alt"
        aria-hidden
      >
        <span style={{ width: pct(stats.attack) }} className={THIRD_BAR_COLOR.attack} />
        <span style={{ width: pct(stats.centre) }} className={THIRD_BAR_COLOR.centre} />
        <span style={{ width: pct(stats.defence) }} className={THIRD_BAR_COLOR.defence} />
      </span>
    </button>
  );
}
