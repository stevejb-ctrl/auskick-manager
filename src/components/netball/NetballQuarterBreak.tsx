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
import { SlotFillSheet } from "@/components/ui/SlotFillSheet";
import { enqueueLiveAction } from "@/lib/live/registerLiveActions";
import { NetballPlayerActions } from "@/components/netball/NetballPlayerActions";
import { NetballStartQuarterModal } from "@/components/netball/NetballStartQuarterModal";
import { ScoreReviewPanel } from "@/components/live/ScoreReviewPanel";
import { QuarterScoreTable } from "@/components/live/QuarterScoreTable";
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
  playerThirdMs,
  seasonAvailability,
  seasonPositionCounts,
  suggestNetballLineup,
} from "@/lib/sports/netball/fairness";
import { useLiveGame } from "@/lib/stores/liveGameStore";
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
  /** Whether the team has scoring tracked on. Hides the recap + Fix-scores
   *  panel when false. */
  trackScoring?: boolean;
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
  trackScoring = true,
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

  // ─── Draft state + lineup-build mode ─────────────────────────
  // 3-mode toggle:
  //   - "suggested": run the fairness rebalancer for the next quarter
  //     (the default — what coaches who don't micromanage want).
  //   - "keep": carry last quarter's lineup forward unchanged. Useful
  //     when the rotation already feels right and the coach just
  //     wants to keep playing.
  //   - "manual": clear the court entirely, park the candidate pool
  //     on the bench, and let the coach build the lineup themselves
  //     position-by-position. Mirrors the AFL Q-break.
  const [draft, setDraft] = useState<GenericLineup>(suggestedLineup);
  const [selected, setSelected] = useState<string | null>(null);
  // Initial value defers to the live store's rotationMode (set by
  // the pre-game LineupPicker or by a prior Q-break) so a coach who
  // picked "Set manually" sees Manual at every QB instead of having
  // to re-pick each break. Mirrors the AFL QB pattern from
  // ba04bd1. "keep" is a per-Q decision so it doesn't round-trip
  // through the store.
  const persistedRotationMode = useLiveGame((s) => s.rotationMode);
  const setPersistedRotationMode = useLiveGame((s) => s.setRotationMode);
  const [lineupMode, setLineupMode] = useState<"suggested" | "keep" | "manual">(
    persistedRotationMode === "manual" ? "manual" : "suggested",
  );
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
  // Position the coach is filling via the SlotFillSheet. Set when
  // they tap an empty position with no player pre-selected; cleared
  // on pick or cancel.
  const [fillTargetPosition, setFillTargetPosition] = useState<string | null>(
    null,
  );
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

  // Manual-mode seed: every position empty, candidatePool sitting on
  // the bench. Coach builds the lineup from scratch via tap-tap-to-
  // place. Memoised so the useEffect-driven draft swap doesn't
  // rebuild a new bench-array every render and re-trigger itself.
  const manualLineup = useMemo<GenericLineup>(() => {
    const positionsObj: Record<string, string[]> = {};
    for (const id of positions) positionsObj[id] = [];
    return { positions: positionsObj, bench: [...candidatePool] };
  }, [positions, candidatePool]);

  // Refresh draft when mode flips or suggestion changes. Then post-
  // process: any forcedBenchIds (recently-recovered players) the
  // suggester put on court get SWAPPED with whoever's first on the
  // bench, so the slot stays filled and the recovered player lands on
  // bench by default. Coach can manually swap them back into a slot
  // if they want to.
  // Only re-derive `draft` when the user explicitly changes
  // lineup mode OR when forcedBenchIds shifts (un-injuring a
  // player on the Q-break should push them onto bench by default).
  // Without this guard, ambient prop changes (suggestedLineup
  // recomputing as thisGameEvents updates) cause the user's
  // committed draft to be overwritten with a fresh suggestion —
  // visible as a "lineup flickers a few seconds after Q-break
  // mounts" bug Steve reported 2026-05-09.
  const lastAppliedModeRef = useRef<typeof lineupMode | null>(null);
  const lastForcedBenchSizeRef = useRef(0);
  useEffect(() => {
    const modeChanged = lastAppliedModeRef.current !== lineupMode;
    const forcedChanged = lastForcedBenchSizeRef.current !== forcedBenchIds.size;
    if (!modeChanged && !forcedChanged) return;
    lastAppliedModeRef.current = lineupMode;
    lastForcedBenchSizeRef.current = forcedBenchIds.size;
    const base =
      lineupMode === "suggested"
        ? suggestedLineup
        : lineupMode === "manual"
        ? manualLineup
        : previousLineup;
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
  }, [lineupMode, suggestedLineup, previousLineup, manualLineup, forcedBenchIds]);

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
  // Place a specific player into a specific position — pulls them
  // out of any current slot first so we don't double-book. Shared
  // by the legacy "tap player + tap empty" flow and the
  // SlotFillSheet pick handler.
  function placeInPosition(pid: string, positionId: string) {
    setDraft((prev) => {
      const next: GenericLineup = {
        positions: Object.fromEntries(
          Object.entries(prev.positions).map(([k, v]) => [
            k,
            v.filter((p) => p !== pid),
          ]),
        ),
        bench: prev.bench.filter((p) => p !== pid),
      };
      next.positions[positionId] = [pid];
      return next;
    });
  }

  // Tap on an empty position. No selection → open the
  // SlotFillSheet so the coach can pick a bench player in one tap.
  // Selection → fall through to the legacy "move selected player
  // into the empty slot" behaviour for coaches who already started
  // swapping.
  function handleTapEmpty(positionId: string) {
    if (!selected) {
      setFillTargetPosition(positionId);
      return;
    }
    if (sidelinedSet.has(selected)) {
      setSelected(null);
      return;
    }
    placeInPosition(selected, positionId);
    setSelected(null);
  }

  function handleFillPick(playerId: string) {
    if (!fillTargetPosition) return;
    placeInPosition(playerId, fillTargetPosition);
    setFillTargetPosition(null);
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

  function handleModeChange(next: "suggested" | "keep" | "manual") {
    if (next === lineupMode) return;
    setLineupMode(next);
    // "keep" is a one-off per-Q decision so it doesn't persist —
    // next Q-break falls back to whatever was previously stored
    // (suggested or manual). Same convention as AFL QB.
    if (next !== "keep") setPersistedRotationMode(next);
    setSelected(null);
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
    enqueueLiveAction("markInjury", [
      auth,
      gameId,
      {
        player_id: playerId,
        injured: false,
        quarter: nextQuarter,
        elapsed_ms: 0,
      },
    ]);
  }
  function handleUnLoan() {
    if (!actionsTarget) return;
    const playerId = actionsTarget;
    setActionsTarget(null);
    // Same bench-default rationale as handleUnInjury — coach decides
    // when (and if) to slot them in.
    setForcedBenchIds((prev) => new Set(prev).add(playerId));
    enqueueLiveAction("markLoan", [
      auth,
      gameId,
      {
        player_id: playerId,
        loaned: false,
        quarter: nextQuarter,
        elapsed_ms: 0,
      },
    ]);
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
    enqueueLiveAction("periodBreakSwap", [
      auth,
      gameId,
      nextQuarter,
      draft,
      midQuarterSubs,
    ]);
    setPendingStartQuarter(nextQuarter);
  }

  function handleConfirmQuarterStart() {
    if (pendingStartQuarter === null) return;
    const quarter = pendingStartQuarter;
    setError(null);
    const { flushed } = enqueueLiveAction("startNetballQuarter", [
      auth,
      gameId,
      quarter,
    ]);
    setPendingStartQuarter(null);
    onStarted();
    // Chain refresh after the queue flushes so SSR sees the
    // quarter_start event and renders Q(n+1)'s live state.
    // Without this, the init effect in NetballLiveGame would see
    // storeAheadOfServer=true on first render and wipe state.
    flushed.then(() => router.refresh());
  }

  // ─── Per-quarter score recap (driven by thisGameEvents) ────
  // Counts goal / opponent_goal events per quarter so the coach
  // can reconcile each break's scoreline with the opposition.
  // score_undo events with target_event_id cancel a paired score.
  // Mirrors AFL replayGame's scoreByQuarter computation but lives
  // here to avoid coupling NetballQuarterBreak to the AFL store.
  const scoreByQuarter = useMemo(() => {
    const periods: Array<{ ours: number; theirs: number }> = [
      { ours: 0, theirs: 0 },
      { ours: 0, theirs: 0 },
      { ours: 0, theirs: 0 },
      { ours: 0, theirs: 0 },
    ];
    const undoneTargets = new Set<string>();
    for (const ev of thisGameEvents) {
      if (ev.type !== "score_undo") continue;
      const target = (ev.metadata as { target_event_id?: string } | null)
        ?.target_event_id;
      if (target) undoneTargets.add(target);
    }
    for (const ev of thisGameEvents) {
      if (ev.type !== "goal" && ev.type !== "opponent_goal") continue;
      if (undoneTargets.has(ev.id)) continue;
      const meta = ev.metadata as
        | { quarter?: number; intended_quarter?: number }
        | null;
      const q =
        typeof meta?.intended_quarter === "number"
          ? meta.intended_quarter
          : typeof meta?.quarter === "number"
            ? meta.quarter
            : 0;
      if (q < 1 || q > 4) continue;
      if (ev.type === "goal") periods[q - 1].ours++;
      else periods[q - 1].theirs++;
    }
    return periods;
  }, [thisGameEvents]);

  const cumUs = scoreByQuarter.reduce((a, p) => a + p.ours, 0);
  const cumThem = scoreByQuarter.reduce((a, p) => a + p.theirs, 0);

  const [showFixScores, setShowFixScores] = useState(false);

  // ─── Match-adjustments (lend / mark injured at break) ──────
  // Mirrors the AFL QuarterBreak panel. Auto-expands when there's
  // already an active loan or injury so the coach can see and
  // change them without hunting for a closed section. Steve's
  // real-game complaint ("the UX only allows lending while the
  // quarter is running") was pure discoverability.
  const lentPlayers = useMemo(
    () =>
      squad.filter((p) => loanedIds.has(p.id) && !injuredIds.has(p.id)),
    [squad, loanedIds, injuredIds],
  );
  const injuredPlayersList = useMemo(
    () => squad.filter((p) => injuredIds.has(p.id)),
    [squad, injuredIds],
  );
  const [matchAdjustmentsOpen, setMatchAdjustmentsOpen] = useState(
    () =>
      lentPlayers.length > 0 ||
      injuredPlayersList.length > 0 ||
      // Auto-expand when the persisted rotation mode is non-default
      // so a coach who picked Manual pre-game (or at an earlier
      // break) lands and immediately sees the toggle. Mirrors AFL QB.
      persistedRotationMode !== "suggested",
  );
  const [lendPickerOpen, setLendPickerOpen] = useState(false);
  const [injuredPickerOpen, setInjuredPickerOpen] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [_adjustPending, startAdjustTransition] = useTransition();

  // Toggle handlers — both follow the optimistic pattern: flip the
  // local store first so the chip updates instantly, then write the
  // event. The next page revalidate rebuilds injuredIds/loanedIds
  // from events and the local flip becomes durable. We don't need
  // to roll back on failure — the action returns ActionResult and
  // the worst case is a stale chip until the next refresh. (AFL's
  // QuarterBreak does the same.)
  function handleLendToggleAtBreak(pid: string, nextLoaned: boolean) {
    setAdjustError(null);
    enqueueLiveAction("markLoan", [
      auth,
      gameId,
      {
        player_id: pid,
        loaned: nextLoaned,
        // Loan applies from the start of Q{nextQuarter}.
        quarter: nextQuarter,
        elapsed_ms: 0,
      },
    ]);
  }
  function handleInjuryToggleAtBreak(pid: string, nextInjured: boolean) {
    setAdjustError(null);
    enqueueLiveAction("markInjury", [
      auth,
      gameId,
      {
        player_id: pid,
        injured: nextInjured,
        quarter: nextQuarter,
        elapsed_ms: 0,
      },
    ]);
  }

  // ─── Render ────────────────────────────────────────────────
  const slots: Slot[] = ["attack-third", "centre-third", "defence-third", "bench"];

  return (
    <div className="space-y-4 pb-24">
      {/* Orientation strip — Steve 2026-05-13: mirror the AFL QB
          redesign. The hero card had eyebrow + title + fairness
          number + the 3-button rotation toggle + a mode-hint
          paragraph, which is far too much weight above the actual
          court tiles. Strip to a flush no-chrome heading. Fairness
          is gone. The rotation toggle moves into the Match-
          adjustments collapse below (renamed Game settings) — same
          place + same UX as the AFL QB. */}
      <div className="px-1">
        <p className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
          Quarter break
        </p>
        <p className="mt-0.5 text-lg font-bold text-ink">
          Set positions for Q{nextQuarter}
        </p>
        <p className="mt-1 text-xs text-ink-dim">
          {lineupMode === "suggested"
            ? `Auto-rebalanced for Q${nextQuarter}.`
            : lineupMode === "keep"
              ? "Carrying last quarter's lineup forward."
              : "Court is empty — tap a bench player, then a position."}
        </p>
      </div>

      {/* Match adjustments — collapsed by default, auto-opens when
          there's already an active loan or injury so the coach can
          manage both at the boundary between quarters (Steve's
          real-world request 2026-05-10). On-field size isn't
          surfaced for netball — it's fixed at 7 per the rules. */}
      <div className="rounded-md border border-hairline bg-surface shadow-card">
        <button
          type="button"
          onClick={() => setMatchAdjustmentsOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-alt"
          aria-expanded={matchAdjustmentsOpen}
          aria-controls="netball-qb-match-adjustments"
        >
          <span className="flex flex-1 items-center gap-3 text-sm">
            <span className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
              Game settings
            </span>
            <span className="text-xs text-ink-mute">
              {(() => {
                // Summary line — folds in rotation, then lent/injured.
                // Default game shows just "Defaults" so the coach
                // knows nothing's been touched. Mirrors AFL QB.
                const bits: string[] = [];
                if (lineupMode === "manual") bits.push("Manual lineup");
                else if (lineupMode === "keep") bits.push("Keeping last Q");
                if (lentPlayers.length > 0)
                  bits.push(`${lentPlayers.length} lent`);
                if (injuredPlayersList.length > 0)
                  bits.push(`${injuredPlayersList.length} injured`);
                return bits.length > 0 ? bits.join(" · ") : "Defaults";
              })()}
            </span>
          </span>
          <span aria-hidden className="text-ink-mute">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              className={`transition-transform duration-fast ease-out-quart ${
                matchAdjustmentsOpen ? "rotate-180" : ""
              }`}
            >
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>

        {matchAdjustmentsOpen && (
          <div
            id="netball-qb-match-adjustments"
            className="space-y-4 border-t border-hairline px-4 py-3"
          >
            {/* Rotation mode. Lifted from the old hero card so the
                header strip stays clean. Three modes — Suggested
                rotates per the fairness rebalancer (default), Keep
                carries Q{n} forward unchanged for a one-off "same
                again" quarter, Manual wipes the court for a from-
                scratch build. handleModeChange writes Suggested/
                Manual back to the live store so the choice persists
                across breaks; Keep is per-quarter and doesn't
                persist. Mirrors AFL QB. */}
            <div>
              <p className="text-xs font-semibold text-ink">Rotation</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={lineupMode === "suggested" ? "primary" : "secondary"}
                  onClick={() => handleModeChange("suggested")}
                >
                  {lineupMode === "suggested" ? "✓ Suggested" : "Suggested"}
                </Button>
                <Button
                  size="sm"
                  variant={lineupMode === "keep" ? "primary" : "secondary"}
                  onClick={() => handleModeChange("keep")}
                >
                  {lineupMode === "keep"
                    ? "✓ Keep last quarter"
                    : "Keep last quarter"}
                </Button>
                <Button
                  size="sm"
                  variant={lineupMode === "manual" ? "primary" : "secondary"}
                  onClick={() => handleModeChange("manual")}
                >
                  {lineupMode === "manual" ? "✓ Set manually" : "Set manually"}
                </Button>
              </div>
            </div>

            {/* Lend a player */}
            <div>
              <p className="text-xs font-semibold text-ink">Lend a player</p>
              <p className="mt-0.5 text-xs text-ink-mute">
                Lent players sit out for the rest of the game until you bring
                them back.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {lentPlayers.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 rounded-full border border-warn/50 bg-warn-soft px-2.5 py-1 text-xs font-medium text-warn"
                  >
                    <span>{p.full_name}</span>
                    <button
                      type="button"
                      onClick={() => handleLendToggleAtBreak(p.id, false)}
                      aria-label={`Bring ${p.full_name} back`}
                      className="ml-0.5 rounded-full px-1 text-[11px] font-bold leading-none text-warn/80 hover:bg-warn/15 hover:text-warn"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setLendPickerOpen(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-ink-dim transition-colors hover:border-brand-500/40 hover:bg-brand-50 hover:text-brand-700"
                >
                  <span aria-hidden>+</span>
                  Lend a player
                </button>
              </div>
            </div>

            {/* Mark injured / left early */}
            <div>
              <p className="text-xs font-semibold text-ink">
                Injured / left early
              </p>
              <p className="mt-0.5 text-xs text-ink-mute">
                Injured players sit out for the rest of the game until you
                bring them back.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {injuredPlayersList.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 rounded-full border border-danger/50 bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger"
                  >
                    <span>{p.full_name}</span>
                    <button
                      type="button"
                      onClick={() => handleInjuryToggleAtBreak(p.id, false)}
                      aria-label={`Mark ${p.full_name} fit`}
                      className="ml-0.5 rounded-full px-1 text-[11px] font-bold leading-none text-danger/80 hover:bg-danger/15 hover:text-danger"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setInjuredPickerOpen(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-ink-dim transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
                >
                  <span aria-hidden>+</span>
                  Mark injured
                </button>
              </div>
            </div>

            {adjustError && (
              <p className="text-xs text-danger" role="alert">
                {adjustError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Lend-player picker modal — same shape as AFL's. Lists every
          healthy, not-already-lent squad member. */}
      {lendPickerOpen && (
        <SlotFillSheet
          slotLabel="player"
          titleVerb="Lend"
          subtitle="Pick a player to lend to the opposition for the rest of the game. Tap their chip to bring them back."
          emptyMessage="Everyone is already lent or injured."
          candidates={squad
            .filter((p) => !loanedIds.has(p.id) && !injuredIds.has(p.id))
            .map((p) => ({ id: p.id, name: p.full_name }))}
          onPick={(pid) => {
            handleLendToggleAtBreak(pid, true);
            setLendPickerOpen(false);
          }}
          onCancel={() => setLendPickerOpen(false)}
        />
      )}

      {/* Injured-player picker — for the "kid had to leave at the
          break" case. Same shape as the lend picker but flips the
          injury flag. */}
      {injuredPickerOpen && (
        <SlotFillSheet
          slotLabel="player"
          titleVerb="Mark injured"
          subtitle="Pick a player to mark as injured / leaving early. Tap their chip to bring them back."
          emptyMessage="Everyone is already injured or lent."
          candidates={squad
            .filter((p) => !loanedIds.has(p.id) && !injuredIds.has(p.id))
            .map((p) => ({ id: p.id, name: p.full_name }))}
          onPick={(pid) => {
            handleInjuryToggleAtBreak(pid, true);
            setInjuredPickerOpen(false);
          }}
          onCancel={() => setInjuredPickerOpen(false)}
        />
      )}

      {/* Score panel — collapsed by default. Single-line score
          summary so the coach can reconcile with the opposition
          at a glance. Tap row to expand into the full per-quarter
          breakdown + per-player event log. */}
      {trackScoring && currentQuarter >= 1 && (() => {
        const lead = cumUs - cumThem;
        const leadLabel =
          lead === 0 ? "level" : lead > 0 ? `+${lead}` : `${lead}`;
        const leadClass =
          lead > 0
            ? "text-ok"
            : lead < 0
              ? "text-warn"
              : "text-ink-mute";
        return (
        <div className="rounded-md border border-hairline bg-surface shadow-card">
          <button
            type="button"
            onClick={() => setShowFixScores((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-alt"
            aria-expanded={showFixScores}
            aria-label={
              showFixScores
                ? "Hide score review"
                : "Review and update scores"
            }
          >
            {/* Header rhythm matches Game settings: [eyebrow]
                [summary] [chevron]. Score is the summary value, with
                the lead margin coloured inline so the at-a-glance
                read is preserved. Mirrors AFL QB. */}
            <span className="flex flex-1 items-center gap-3 text-sm">
              <span className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
                Score
              </span>
              <span className="nums truncate font-mono text-xs tabular-nums text-ink-mute">
                {cumUs}
                <span className="mx-1 text-ink-mute/70">–</span>
                {cumThem}
                {lead !== 0 && (
                  <>
                    <span className="mx-1 text-ink-mute/70">·</span>
                    <span className={`font-semibold ${leadClass}`}>
                      {leadLabel}
                    </span>
                  </>
                )}
              </span>
            </span>
            <span aria-hidden className="text-ink-mute">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                className={`transition-transform duration-fast ease-out-quart ${
                  showFixScores ? "rotate-180" : ""
                }`}
              >
                <path
                  d="M6 9l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>

          {showFixScores && (
            <div className="space-y-4 border-t border-hairline px-4 py-4">
              <QuarterScoreTable
                // Adapter: netball's local scoreByQuarter is
                // Array<{ours: number, theirs: number}> indexed
                // 0..3 (Q1..Q4). QuarterScoreTable expects the
                // AFL shape with .goals nested + 1..N indexing
                // (index 0 unused). Pre-built inline since the
                // table is only rendered when showFixScores is on.
                scoreByQuarter={[
                  { ours: { goals: 0 }, theirs: { goals: 0 } },
                  ...scoreByQuarter.map((q) => ({
                    ours: { goals: q.ours },
                    theirs: { goals: q.theirs },
                  })),
                ]}
                currentQuarter={currentQuarter}
                quarterEnded={true}
                sport="netball"
                teamName="Us"
                opponentName="Them"
              />
              <div className="border-t border-hairline pt-4">
                <p className="text-xs font-semibold text-ink">
                  Per-player events
                </p>
                <p className="mt-0.5 text-xs text-ink-mute">
                  Delete a wrong score with ×, or add one that was missed.
                </p>
                <div className="mt-3">
                  <ScoreReviewPanel
                    auth={auth}
                    gameId={gameId}
                    players={squad}
                    includeBehinds={false}
                    defaultQuarter={currentQuarter}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        );
      })()}

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
                      // Empty position placeholder — always tappable.
                      // No selection → opens the SlotFillSheet so the
                      // coach can pick a bench player in one tap.
                      // Selection → drops the selected player here
                      // (legacy two-tap path). Keyed by positionId
                      // since pid is null.
                      return (
                        <li key={`empty-${positionId}`}>
                          <EmptySlotTile
                            positionId={positionId!}
                            disabled={false}
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

      {/* Sticky kickoff CTA — Steve 2026-05-13: pin the primary
          Ready button to the bottom of the viewport so it's
          always reachable without scrolling past zones + bench +
          score panel. Same treatment as the AFL QB so the two
          sports feel identical. Outer container above gets pb-24
          so the last in-flow element isn't hidden behind the bar.

          Two-stage kickoff narrative preserved:
            Q-break button     "Ready for Q{n}"
            NetballStartModal  heading "Ready for Q{n}"
                                body    "Tap when the umpires call play."
                                CTA     "Start Q{n}"
          Distinct labels so each tap signals a different intent
          (commit-lineup → start-clock-on-whistle). */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface px-4 py-3 shadow-[0_-4px_16px_rgba(26,30,26,0.04)] sm:px-7 sm:py-4">
        <div className="mx-auto max-w-4xl">
          <Button
            onClick={handleStart}
            loading={isPending && pendingStartQuarter === null}
            className="w-full"
            size="lg"
          >
            Ready for Q{nextQuarter}
          </Button>
        </div>
      </div>

      {pendingStartQuarter !== null && (
        <NetballStartQuarterModal
          quarter={pendingStartQuarter}
          loading={isPending}
          onStart={handleConfirmQuarterStart}
          onCancel={() => setPendingStartQuarter(null)}
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

      {/* Empty-position picker sheet — opens when the coach taps an
          unfilled court position with no player pre-selected. Lists
          every bench player so they can place someone in one tap. */}
      {fillTargetPosition && (() => {
        const pos = netballSport.allPositions.find(
          (p) => p.id === fillTargetPosition,
        );
        const slotLabel = pos?.shortLabel ?? fillTargetPosition.toUpperCase();
        return (
          <SlotFillSheet
            slotLabel={slotLabel}
            candidates={draft.bench
              .filter((pid) => !sidelinedSet.has(pid))
              .map((pid) => playersById.get(pid))
              .filter((p): p is Player => !!p)
              .map((p) => ({ id: p.id, name: p.full_name }))}
            onPick={handleFillPick}
            onCancel={() => setFillTargetPosition(null)}
          />
        );
      })()}
    </div>
  );
}

// ─── Empty-slot tile ─────────────────────────────────────────
// Renders for an unfilled position so the coach has something to
// tap. Visually a dashed-border placeholder with the position label
// — always tappable now that tapping opens the SlotFillSheet (or
// fills with the currently-selected player as a fallback).
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
        {disabled ? "Empty" : "Tap to fill"}
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
