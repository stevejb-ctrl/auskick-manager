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

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  periodBreakSwap,
  startNetballQuarter,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/netball-actions";
import { markInjury, markLoan } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import { NetballPlayerActions } from "@/components/netball/NetballPlayerActions";
import { NetballStartQuarterModal } from "@/components/netball/NetballStartQuarterModal";
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
  seasonAvailability,
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
    // null when the slot was empty (no sub-out player) — see
    // NetballLiveGame's MidQuarterSub for the full story.
    outPlayerId: string | null;
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

  // Per-player time on court (ms), summed across thirds. Computed
  // here (above suggestedLineup) so the suggester can use it as the
  // who-plays sort key. Defined ONCE here and reused by the time-bar
  // rendering below.
  const thirdMs = useMemo(() => {
    if (playerStats) return playerStats;
    return playerThirdMs(
      thisGameEvents,
      null,
      periodSeconds,
      primaryThirdFor as (positionId: string) => "attack-third" | "centre-third" | "defence-third" | null,
    );
  }, [playerStats, thisGameEvents, periodSeconds]);

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
    // Per-player total minutes (in ms). Drives the suggester's
    // who-plays sort directly — least-time-played first. Sourced
    // from the parent's playerStats (already computed for the live
    // bars) which factors in mid-quarter subs via the segment
    // accounting, so a player who came on at 0:30 of Q1 and got
    // subbed off at 1:00 has 30,000 ms credited, NOT a full
    // quarter-equivalent. Falls back to a self-computed thirdMs
    // when playerStats isn't passed (defensive — shouldn't happen).
    const totalMsByPlayer: Record<string, number> = {};
    thirdMs.forEach((stats, pid) => {
      totalMsByPlayer[pid] = stats.attack + stats.centre + stats.defence;
    });
    // Season-level utilisation tiebreak. Counts each player's
    // quarters-played vs quarters-available across all prior games
    // — a consistent attendee who's been benched twice already
    // this season starts collecting sort priority for the next
    // game. The suggester only consults this signal when in-game
    // ms is tied, so within a single game the standard rotation
    // still drives the decisions.
    const seasonAvail = seasonAvailability(seasonEvents);
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
      thisGameTotalMs: totalMsByPlayer,
      seasonAvailability: seasonAvail,
    });
    // Pre-apply locks: locked player goes to locked position. If the
    // locked player was already placed elsewhere by the suggester, we
    // SWAP them with whoever's at the target slot — not bench-the-
    // displaced — so we don't leave a hole at the locked player's old
    // position. Only when the locked player came from the bench (or
    // wasn't placed at all) does the displaced player end up benched.
    if (Object.keys(preAppliedLocks).length === 0) return base;
    const next: GenericLineup = {
      positions: {},
      bench: [...base.bench],
    };
    for (const id of positions) next.positions[id] = [...(base.positions[id] ?? [])];
    for (const [posId, lockedPid] of Object.entries(preAppliedLocks)) {
      // Find where the locked player currently is.
      let lockedFromPos: string | null = null;
      for (const id of Object.keys(next.positions)) {
        if (next.positions[id].includes(lockedPid)) {
          lockedFromPos = id;
          break;
        }
      }
      const lockedFromBench = next.bench.includes(lockedPid);
      const displacedAtTarget = (next.positions[posId] ?? []).filter((p) => p !== lockedPid);
      // Vacate locked player from their old spot.
      if (lockedFromPos && lockedFromPos !== posId) {
        next.positions[lockedFromPos] = next.positions[lockedFromPos].filter((p) => p !== lockedPid);
      }
      if (lockedFromBench) {
        next.bench = next.bench.filter((p) => p !== lockedPid);
      }
      // Place lock at target.
      next.positions[posId] = [lockedPid];
      // Re-home the displaced player. If the lock came from another
      // court position, swap into that vacated slot — fills the hole
      // we'd otherwise leave behind. Otherwise bench them.
      for (const p of displacedAtTarget) {
        if (p === lockedPid) continue;
        if (lockedFromPos && lockedFromPos !== posId && next.positions[lockedFromPos].length === 0) {
          next.positions[lockedFromPos] = [p];
        } else if (!next.bench.includes(p)) {
          next.bench.push(p);
        }
      }
    }
    return next;
  }, [
    candidatePool,
    positions,
    seasonEvents,
    thisGameEvents,
    nextQuarter,
    preAppliedLocks,
    thirdMs,
  ]);

  // ─── Draft state + reshuffle toggle ─────────────────────────
  const [draft, setDraft] = useState<GenericLineup>(suggestedLineup);
  const [selected, setSelected] = useState<string | null>(null);
  const [useReshuffle, setUseReshuffle] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Phase 5: router.refresh() after startNetballQuarter success so the
  // page rerenders into the next quarter's live state without a manual
  // reload. Pairs with revalidatePath in netball-actions.ts.
  // (Phase 4 deferred item #2 / 04-EVIDENCE.md §5.)
  const router = useRouter();
  // Long-press target for the actions modal. Populated when the coach
  // long-presses an INJ / LENT tile in the sidelined section so they
  // can mark recovered or bring back from loan from the Q-break view
  // without bouncing back to the live court.
  const [actionsTarget, setActionsTarget] = useState<string | null>(null);
  // Players whom the coach has just un-injured / un-loaned during this
  // Q-break session. They re-enter the candidate pool, which means the
  // suggester would otherwise put them straight back on court — but a
  // recently-recovered player should default to the BENCH so the coach
  // explicitly decides if and where to bring them on. We post-process
  // the draft below to push these ids onto the bench regardless of
  // what the suggester chose. Cleared implicitly when the component
  // unmounts (next quarter starts a fresh instance).
  const [forcedBenchIds, setForcedBenchIds] = useState<Set<string>>(new Set());
  // Two-step start: handleStart commits the lineup snapshot
  // (period_break_swap) then surfaces the await-kickoff modal so the
  // GM can wait for the umpire's whistle. The modal's CTA fires the
  // actual quarter_start. Splitting the flow this way means the clock
  // doesn't tick from the lineup-confirm tap — it ticks from when the
  // umpire calls play, which is the moment a coach actually wants
  // recorded. (Mirrors AFL's StartQuarterModal pattern.)
  const [pendingStartQuarter, setPendingStartQuarter] = useState<number | null>(null);

  // Refresh draft when toggle flips or suggestion changes. Then post-
  // process: any forcedBenchIds (recently-recovered players) the
  // suggester put on court get SWAPPED with whoever's first on the
  // bench, so the slot stays filled and the recovered player lands on
  // bench by default. Coach can manually swap them back into a slot
  // if they want to.
  useEffect(() => {
    const base = useReshuffle ? suggestedLineup : previousLineup;
    if (forcedBenchIds.size === 0) {
      setDraft(base);
      setSelected(null);
      return;
    }
    const next: GenericLineup = {
      positions: Object.fromEntries(
        Object.entries(base.positions).map(([k, v]) => [k, [...v]]),
      ),
      bench: [...base.bench],
    };
    forcedBenchIds.forEach((pid) => {
      // Find the recovered player's current spot in the draft.
      let courtPos: string | null = null;
      for (const [posId, ids] of Object.entries(next.positions)) {
        if (ids.includes(pid)) {
          courtPos = posId;
          break;
        }
      }
      if (courtPos) {
        // Swap with the first eligible bench player (skip other
        // forced-bench ids so we don't ping-pong them onto court).
        const swapPartner = next.bench.find((b) => !forcedBenchIds.has(b));
        if (swapPartner) {
          next.positions[courtPos] = next.positions[courtPos].map((p) =>
            p === pid ? swapPartner : p,
          );
          next.bench = next.bench.filter((p) => p !== swapPartner);
          if (!next.bench.includes(pid)) next.bench.push(pid);
        }
        // No bench player to swap with — leave them on court rather
        // than create an empty slot. Edge case (full court, no bench
        // space).
      } else if (!next.bench.includes(pid)) {
        // Not on court; ensure they're on bench if the lineup knows
        // about them at all (post-revalidation).
        const lineupHasPid = Object.values(base.positions).some((v) => v.includes(pid)) || base.bench.includes(pid);
        if (lineupHasPid) next.bench.push(pid);
      }
    });
    setDraft(next);
    setSelected(null);
  }, [useReshuffle, suggestedLineup, previousLineup, forcedBenchIds]);

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

  // Players currently flagged injured or on loan — sourced from the
  // events-derived sets in the parent. The candidatePool intentionally
  // excludes them so the suggester doesn't put them back on court, but
  // the Q-break still surfaces them in a "Sidelined" strip below the
  // bench so the coach can:
  //   - see who's unavailable for this break, and
  //   - long-press to mark recovered / bring back, which fires the
  //     same markInjury/markLoan actions the live court uses. Once
  //     the event lands and the parent's sets refresh, the player
  //     flows back into candidatePool → suggestedLineup → bench.
  type SidelinedItem = { player: Player; status: "injured" | "loaned" };
  const sidelined = useMemo<SidelinedItem[]>(() => {
    const out: SidelinedItem[] = [];
    const byId = new Map(squad.map((p) => [p.id, p]));
    injuredIds.forEach((id) => {
      const p = byId.get(id);
      if (p) out.push({ player: p, status: "injured" });
    });
    loanedIds.forEach((id) => {
      if (injuredIds.has(id)) return;
      const p = byId.get(id);
      if (p) out.push({ player: p, status: "loaned" });
    });
    return out;
  }, [squad, injuredIds, loanedIds]);

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
  // Tap an empty position slot. With a player selected, that player
  // moves INTO the slot. The selected player's old position (if any)
  // gets vacated — leaving its own empty placeholder if they came from
  // court, or just removing them from the bench list. No-op without
  // a selection.
  function handleTapEmpty(positionId: string) {
    if (!selected) return;
    if (sidelinedSet.has(selected)) {
      setSelected(null);
      return;
    }
    setDraft((prev) => {
      const next: GenericLineup = {
        positions: Object.fromEntries(
          Object.entries(prev.positions).map(([k, v]) => [
            k,
            v.filter((p) => p !== selected),
          ]),
        ),
        bench: prev.bench.filter((p) => p !== selected),
      };
      next.positions[positionId] = [selected];
      return next;
    });
    setSelected(null);
  }

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

  // ─── Sidelined-tile long-press → un-mark handlers ──────────
  // Open the standard NetballPlayerActions modal targeted at a
  // sidelined player. Modal exposes "Mark recovered" / "Bring back
  // from loan"; selecting either fires markInjury/markLoan with
  // the negation flag, the page revalidates, and the parent's
  // event-derived injuredIds/loanedIds drop the id — at which
  // point sidelined recomputes (player vanishes from this strip)
  // and candidatePool/suggestedLineup re-derive (player appears
  // on the bench, ready to be tapped into a slot).
  function handleSidelinedLongPress(playerId: string) {
    setActionsTarget(playerId);
  }
  function handleUnInjury() {
    if (!actionsTarget) return;
    const playerId = actionsTarget;
    setActionsTarget(null);
    // Stamp the recovered player as bench-default so the suggester
    // doesn't put them straight back into a court position when the
    // events refresh. The draft useEffect post-processes this set
    // every time it rebuilds.
    setForcedBenchIds((prev) => new Set(prev).add(playerId));
    startTransition(async () => {
      await markInjury(auth, gameId, {
        player_id: playerId,
        injured: false,
        quarter: nextQuarter,
        elapsed_ms: 0,
      });
    });
  }
  function handleUnLoan() {
    if (!actionsTarget) return;
    const playerId = actionsTarget;
    setActionsTarget(null);
    // Same bench-default rationale as handleUnInjury — coach decides
    // when (and if) to slot them in.
    setForcedBenchIds((prev) => new Set(prev).add(playerId));
    startTransition(async () => {
      await markLoan(auth, gameId, {
        player_id: playerId,
        loaned: false,
        quarter: nextQuarter,
        elapsed_ms: 0,
      });
    });
  }

  function handleStart() {
    setError(null);
    // Validate before firing the period_break_swap. The pre-game
    // picker already runs the same gate (NetballLineupPicker:206) —
    // without it here, an empty slot + a benched player slip through
    // (the suggester always fills every slot, but a coach manually
    // dragging tiles can leave one open). validateLineup catches the
    // most common shapes: empty position, doubled-up position, dup
    // across position+bench. Surfaces the first issue inline.
    const validation = netballSport.validateLineup?.(draft, ageGroup);
    if (validation && !validation.ok) {
      setError(validation.issues[0]?.message ?? "Lineup is not valid.");
      return;
    }
    // Step 1: commit the lineup snapshot. Surface the await-kickoff
    // modal once it lands. quarter_start is deferred to the modal CTA
    // (handleConfirmQuarterStart) so the umpire's whistle — not the
    // lineup tap — decides when the clock kicks off.
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
      setPendingStartQuarter(nextQuarter);
    });
  }

  function handleConfirmQuarterStart() {
    if (pendingStartQuarter === null) return;
    const quarter = pendingStartQuarter;
    setError(null);
    startTransition(async () => {
      const result = await startNetballQuarter(auth, gameId, quarter);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setPendingStartQuarter(null);
      onStarted();
      // Phase 5: re-fetch so the page renders into Q(n+1)'s live state
      // without needing a manual reload. Pairs with revalidatePath in
      // netball-actions.ts startNetballQuarter.
      router.refresh();
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
          // For court bands, also surface UNFILLED positions as null-pid
          // entries so they render as tappable empty placeholders — coach
          // can pick a bench player and tap an empty slot to fill the
          // hole (otherwise lock-displacement / cancelled swaps leave
          // permanently-stuck holes the validator then refuses to ship).
          const items: { pid: string | null; positionId: string | null }[] = [];
          if (slot === "bench") {
            for (const pid of draft.bench) items.push({ pid, positionId: null });
          } else {
            for (const posId of positionsByThird[slot]) {
              const occupant = draft.positions[posId]?.[0];
              if (occupant) items.push({ pid: occupant, positionId: posId });
              else items.push({ pid: null, positionId: posId });
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
                    if (!pid) {
                      // Empty position placeholder — tappable when a
                      // player is currently selected, drops them into
                      // this slot. Keyed by positionId since pid is null.
                      return (
                        <li key={`empty-${positionId}`}>
                          <EmptySlotTile
                            positionId={positionId!}
                            disabled={!selected}
                            onTap={() => positionId && handleTapEmpty(positionId)}
                          />
                        </li>
                      );
                    }
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

      {/* Sidelined strip — players currently injured or on loan.
          Long-press a tile to open the actions modal and mark
          recovered / bring back from loan. Hidden when nobody is
          sidelined to avoid an empty band. */}
      {sidelined.length > 0 && (
        <div className="rounded-md border border-hairline bg-surface p-3 shadow-card">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-dim">
              Sidelined
            </h3>
            <span className="text-[10px] text-ink-mute">
              long-press to bring back
            </span>
          </div>
          <ul className="space-y-1.5">
            {sidelined.map(({ player, status }) => {
              const stats = thirdMs.get(player.id) ?? {
                attack: 0,
                centre: 0,
                defence: 0,
              };
              const totalMs = stats.attack + stats.centre + stats.defence;
              return (
                <li key={player.id}>
                  <PlayerTile
                    player={player}
                    positionId={null}
                    isSelected={false}
                    isInjured={status === "injured"}
                    isLoaned={status === "loaned"}
                    isSidelined
                    movedFromLabel={null}
                    stays={false}
                    stats={stats}
                    totalMs={totalMs}
                    goalCount={playerGoals[player.id] ?? 0}
                    onTap={() => {}}
                    onLongPress={() => handleSidelinedLongPress(player.id)}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {error && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={handleStart} loading={isPending && pendingStartQuarter === null}>
          Start Q{nextQuarter}
        </Button>
      </div>

      {pendingStartQuarter !== null && (
        <NetballStartQuarterModal
          quarter={pendingStartQuarter}
          loading={isPending}
          onStart={handleConfirmQuarterStart}
        />
      )}

      {/* Actions modal — opens on long-press of a sidelined tile.
          Reuses the same NetballPlayerActions the live court uses,
          but the lock-for-next-break / mark-injured / mark-loaned
          paths are hidden because the player is already sidelined
          (only un-injure / un-loan and Cancel show). */}
      {actionsTarget && (() => {
        const player = squad.find((p) => p.id === actionsTarget);
        if (!player) return null;
        return (
          <NetballPlayerActions
            player={player}
            positionId={null}
            isInjured={injuredIds.has(actionsTarget)}
            isLoaned={loanedIds.has(actionsTarget)}
            isLockedForNextBreak={false}
            onMarkInjured={() => setActionsTarget(null)}
            onUnInjury={handleUnInjury}
            onMarkLoaned={() => setActionsTarget(null)}
            onUnLoan={handleUnLoan}
            onLockForNextBreak={() => setActionsTarget(null)}
            onUnlock={() => setActionsTarget(null)}
            onClose={() => setActionsTarget(null)}
          />
        );
      })()}
    </div>
  );
}

// ─── Empty-slot tile ─────────────────────────────────────────
// Renders for an unfilled position so the coach has something to
// tap. Visually a dashed-border placeholder with the position label.
// Active state (when a player is currently selected) gets a brand
// outline + hint copy; idle state (no selection) is muted + disabled.
function EmptySlotTile({
  positionId,
  disabled,
  onTap,
}: {
  positionId: string;
  disabled: boolean;
  onTap: () => void;
}) {
  const pos = netballSport.allPositions.find((p) => p.id === positionId);
  const posLabel = pos?.shortLabel ?? positionId.toUpperCase();
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-md border-2 border-dashed px-3 py-2 text-left text-sm transition-colors ${
        disabled
          ? "border-hairline text-ink-mute"
          : "border-brand-500 bg-brand-50 text-brand-800 hover:bg-brand-100"
      }`}
      aria-label={`Empty ${posLabel} — tap to fill`}
    >
      <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-current px-2 text-[10px] font-bold uppercase tracking-micro">
        {posLabel}
      </span>
      <span className="font-medium">
        {disabled ? "Empty" : `Tap to place here`}
      </span>
    </button>
  );
}

// ─── Player tile ─────────────────────────────────────────────
// Mirrors the AFL QuarterBreak tile at LiveGame.tsx:364 — flat row,
// position chip on the left, name + movement underneath, time bar
// floating to the right. Tapping fires the parent's handleTap.
// onLongPress fires after a 500ms hold — used by the sidelined
// strip so the coach can mark a player recovered from the Q-break
// view without bouncing back to the live court.
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
  onLongPress,
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
  onLongPress?: () => void;
}) {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPressRef = useRef(false);
  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (!onLongPress) return;
    didLongPressRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    longPressTimerRef.current = setTimeout(() => {
      didLongPressRef.current = true;
      longPressTimerRef.current = null;
      onLongPress();
    }, 500);
  }
  function cancelLongPress() {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }
  function handleClick() {
    // Suppress the click if a long-press just fired (prevents the
    // tap-to-swap path from firing alongside the actions modal).
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return;
    }
    onTap();
  }
  const positionShort = positionId
    ? netballSport.allPositions.find((pp) => pp.id === positionId)?.shortLabel ??
      positionId.toUpperCase()
    : "B";
  const total = totalMs || 1;
  const pct = (v: number) => `${(v / total) * 100}%`;
  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={onLongPress ? handlePointerDown : undefined}
      onPointerUp={onLongPress ? cancelLongPress : undefined}
      onPointerCancel={onLongPress ? cancelLongPress : undefined}
      onPointerLeave={onLongPress ? cancelLongPress : undefined}
      // Sidelined tiles stay tappable when onLongPress is wired so
      // the coach can long-press to mark recovered. Without
      // onLongPress they remain disabled (the tap-to-swap path is
      // a no-op for sidelined players anyway).
      disabled={isSidelined && !onLongPress}
      aria-disabled={isSidelined && !onLongPress}
      className={`relative flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors duration-fast ease-out-quart ${
        isSelected
          ? "border-brand-500 bg-brand-50 ring-2 ring-brand-400"
          : isSidelined
          ? `${onLongPress ? "" : "cursor-not-allowed "}border-hairline bg-surface-alt opacity-60`
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
        {/* Position chip — text colour matches the third's time-bar
            colour (forward=orange, centre=purple, defence=blue) so
            coaches can map a colour to a third without reading
            labels. Bench tiles ("B") fall back to neutral ink. */}
        <span
          className={`inline-flex h-6 min-w-[1.75rem] items-center justify-center rounded-full bg-surface-alt px-1 font-mono text-[10px] font-bold uppercase tracking-micro tabular-nums ${
            (() => {
              if (!positionId) return "text-ink-dim";
              const t = primaryThirdFor(positionId);
              if (t === "attack-third") return "text-zone-f";
              if (t === "centre-third") return "text-zone-c";
              if (t === "defence-third") return "text-zone-b";
              return "text-ink-dim";
            })()
          }`}
        >
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
