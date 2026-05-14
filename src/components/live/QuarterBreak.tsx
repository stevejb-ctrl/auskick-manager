"use client";

import { useRouter } from "next/navigation";
import { startTransition as reactStartTransition, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { SlotFillSheet } from "@/components/ui/SlotFillSheet";
import { StartQuarterModal } from "@/components/live/StartQuarterModal";
import { Guernsey, SFButton } from "@/components/sf";
import {
  addRetroScore,
  deleteScore,
  getGameScoreLog,
  markInjury,
  markLoan,
  recordLineupSet,
  setOnFieldSize as setOnFieldSizeAction,
  startQuarter as startQuarterAction,
  type ScoreLogEntry,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import { CHIP_COLORS, type ChipKey } from "@/lib/chips";
import {
  ALL_ZONES,
  suggestStartingLineup,
  zoneTeammatesFromLineup,
  type PlayerZoneMinutes,
  type SeasonAvailability,
  type ZoneCaps,
  type ZoneMinutes,
} from "@/lib/fairness";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import { hapticTap } from "@/lib/haptics";
import {
  emptyLineup,
  type Lineup,
  type Player,
  type PositionModel,
  type Zone,
} from "@/lib/types";
import { positionsFor, ZONE_SHORT_LABELS } from "@/lib/ageGroups";
import { QuarterScoreTable } from "@/components/live/QuarterScoreTable";

// Players who came on shortly before the quarter break — keep them in their
// zone rather than moving them again immediately.
const RECENT_ARRIVAL_MS = 3 * 60 * 1000; // 3 minutes

// Format a minute count (decimal — e.g. 12.5) as M:SS. Used for the
// per-player THIS-GAME running total beside each time bar so a coach
// (and any parent at their shoulder) can see at a glance who's
// played 12:30 vs 4:00 today. Netball's PlayerTile already shows
// this; AFL was the gap. Season totals are deliberately not shown
// — kids who miss games naturally accrue lower season minutes and
// surfacing that just invites the wrong complaint.
function fmtMinSec(min: number): string {
  const totalSec = Math.max(0, Math.floor(min * 60));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface QuarterBreakProps {
  auth: import("@/lib/types").LiveAuth;
  gameId: string;
  players: Player[];
  season: PlayerZoneMinutes;
  /**
   * Per-player played-vs-available quarter counts across PRIOR
   * games. Drives the suggester's tiebreak so an under-utilised
   * regular climbs the queue ahead of a teammate with similar
   * in-game minutes today.
   */
  seasonAvailability: Record<string, SeasonAvailability>;
  zoneCaps: ZoneCaps;
  positionModel: PositionModel;
  /** Current persisted on-field size — drives the size dropdown. */
  currentOnFieldSize: number;
  /** Sport+age legal range for the on-field size dropdown. */
  minOnFieldSize: number;
  maxOnFieldSize: number;
  /** Default on-field size for the team's age group (shown as a hint). */
  defaultOnFieldSize: number;
  /** Per-chip mode (split / group) — drives the suggester's chip cost. */
  chipModeByKey?: Partial<Record<"a" | "b" | "c", "split" | "group">>;
  onStarted: () => void;
}

type Slot = Zone | "bench";

const ZONE_BAR_COLOR: Record<Zone, string> = {
  back: "bg-zone-b",
  hback: "bg-zone-b/70",
  mid: "bg-zone-c",
  hfwd: "bg-zone-f/70",
  fwd: "bg-zone-f",
};

function emptyZM(): ZoneMinutes {
  return { back: 0, hback: 0, mid: 0, hfwd: 0, fwd: 0 };
}

export function QuarterBreak({
  auth,
  gameId,
  players,
  season,
  seasonAvailability,
  zoneCaps,
  positionModel,
  currentOnFieldSize,
  minOnFieldSize,
  maxOnFieldSize,
  defaultOnFieldSize,
  chipModeByKey = {},
  onStarted,
}: QuarterBreakProps) {
  const lineup = useLiveGame((s) => s.lineup);
  const currentQuarter = useLiveGame((s) => s.currentQuarter);
  const setLineup = useLiveGame((s) => s.setLineup);
  // Started locally inside handleConfirmStart so the clock kicks off
  // the moment the modal Start tap commits — without it, the LiveGame
  // mount after refresh would land with clockStartedAt=null (because
  // beginNextQuarter resets it) and there's no longer a LiveGame
  // modal to bridge the gap (the dedicated modal was removed when
  // the kickoff commit moved here). Steve 2026-05-13.
  const startClock = useLiveGame((s) => s.startClock);
  const basePlayedZoneMs = useLiveGame((s) => s.basePlayedZoneMs);
  // pastQuarterZones is still populated by replayGame + the store
  // (kept in state so the suggester or a future per-quarter view
  // can read it) but the QB tile dropped its per-quarter bar in
  // favour of the time-in-zone proportional bar Steve asked for
  // 2026-05-13. No JSX consumer in this file.
  const lastStintMs = useLiveGame((s) => s.lastStintMs);
  const lastStintZone = useLiveGame((s) => s.lastStintZone);
  const lockedIds = useLiveGame((s) => s.lockedIds);
  const zoneLockedPlayers = useLiveGame((s) => s.zoneLockedPlayers);
  const injuredIds = useLiveGame((s) => s.injuredIds);
  const loanedIds = useLiveGame((s) => s.loanedIds);
  const setLoaned = useLiveGame((s) => s.setLoaned);
  const setInjured = useLiveGame((s) => s.setInjured);
  const sidelinedSet = useMemo(
    () => new Set<string>([...injuredIds, ...loanedIds]),
    [injuredIds, loanedIds]
  );
  const injuredSet = useMemo(() => new Set(injuredIds), [injuredIds]);
  const loanedSet = useMemo(() => new Set(loanedIds), [loanedIds]);

  const zones = useMemo(() => positionsFor(positionModel), [positionModel]);
  // Display FWD → CENTRE → BACK (top → bottom) to match the coach's field mental model.
  const slots = useMemo<Slot[]>(() => [[...zones].reverse(), "bench"].flat() as Slot[], [zones]);
  const slotLabel = (s: Slot) => {
    if (s === "bench") return "Bench";
    if (s === "mid") return "Centre";
    // Steve 2026-05-13: spell FWD out as Forward. Matches the
    // "Centre" treatment for mid above so the on-page labels read
    // as full words rather than abbreviations.
    if (s === "fwd") return "Forward";
    return ZONE_SHORT_LABELS[s];
  };

  const currentGameZoneMins = useMemo(() => {
    const out: PlayerZoneMinutes = {};
    for (const [pid, zm] of Object.entries(basePlayedZoneMs)) {
      const next = emptyZM();
      for (const z of ALL_ZONES) next[z] = zm[z] / 60000;
      out[pid] = next;
    }
    return out;
  }, [basePlayedZoneMs]);

  const combinedZoneMins = useMemo(() => {
    const out: PlayerZoneMinutes = {};
    for (const [pid, zm] of Object.entries(season)) {
      const next = emptyZM();
      for (const z of ALL_ZONES) next[z] = zm[z];
      out[pid] = next;
    }
    for (const [pid, zm] of Object.entries(currentGameZoneMins)) {
      out[pid] ??= emptyZM();
      for (const z of ALL_ZONES) out[pid][z] += zm[z];
    }
    return out;
  }, [season, currentGameZoneMins]);

  const [draft, setDraft] = useState<Lineup>(lineup);
  const [selected, setSelected] = useState<string | null>(null);
  // Slot the coach is filling via the SlotFillSheet. Set when they
  // tap an empty zone slot; cleared when they pick or cancel. Null
  // means the sheet is closed.
  const [fillTargetZone, setFillTargetZone] = useState<Zone | null>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Q-break lineup-build mode:
  //   "suggested" — auto-rebalance via the fairness suggester (default).
  //   "keep"      — carry last quarter's lineup through unchanged.
  //   "manual"    — wipe to a blank field, all players on bench, coach
  //                 builds the next quarter from scratch.
  // All three are fully editable via tap-tap below; the toggle just
  // sets the starting state when the coach lands on the Q-break.
  // Initial value defers to the live store's rotationMode (set by
  // the pre-game LineupPicker) so a coach who picked "Set manually"
  // pre-game sees Manual at every QB instead of having to re-pick
  // each break. Map to QB's three modes: store "manual" → "manual",
  // store "suggested" → "suggested" (no "keep" mapping — keep is a
  // per-Q decision the coach makes at each break, not a persistent
  // default).
  const persistedRotationMode = useLiveGame((s) => s.rotationMode);
  const setPersistedRotationMode = useLiveGame((s) => s.setRotationMode);
  const [lineupMode, setLineupMode] = useState<"suggested" | "keep" | "manual">(
    persistedRotationMode === "manual" ? "manual" : "suggested",
  );

  const playersById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players]
  );
  const availableForLineup = useMemo(() => {
    const all: string[] = [...lineup.bench];
    for (const z of ALL_ZONES) all.push(...lineup[z]);
    return all
      .map((id) => playersById.get(id))
      .filter((p): p is Player => !!p);
  }, [lineup, playersById]);
  // Injured / loaned players stay parked on the bench — never fed to the
  // reshuffler, never rotated onto the field at quarter breaks.
  const healthyForLineup = useMemo(
    () => availableForLineup.filter((p) => !sidelinedSet.has(p.id)),
    [availableForLineup, sidelinedSet]
  );
  const sidelinedIdsInLineup = useMemo(
    () => availableForLineup.filter((p) => sidelinedSet.has(p.id)).map((p) => p.id),
    [availableForLineup, sidelinedSet]
  );

  const nextQuarter = currentQuarter + 1;

  function slotOf(pid: string, l: Lineup): Slot | null {
    for (const s of slots) if (l[s].includes(pid)) return s;
    return null;
  }

  function handleTap(pid: string) {
    // Injured / loaned players are parked on the bench; tapping them is
    // a no-op so a coach can't manually drag them onto the field.
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
      const sa = slotOf(a, prev);
      const sb = slotOf(b, prev);
      if (!sa || !sb) return prev;
      const next: Lineup = {
        back: [...prev.back],
        hback: [...prev.hback],
        mid: [...prev.mid],
        hfwd: [...prev.hfwd],
        fwd: [...prev.fwd],
        bench: [...prev.bench],
      };
      if (sa === sb) {
        next[sa] = next[sa].map((p) => (p === a ? b : p === b ? a : p));
      } else {
        next[sa] = next[sa].map((p) => (p === a ? b : p));
        next[sb] = next[sb].map((p) => (p === b ? a : p));
      }
      return next;
    });
    setSelected(null);
  }

  // Move a bench player into a target zone — shared between the
  // SlotFillSheet pick path and any future direct-place affordances.
  // Pulls the player out of wherever they currently live (zone or
  // bench) so we don't double-count.
  function placeInZone(pid: string, target: Zone) {
    setDraft((prev) => ({
      back: prev.back.filter((p) => p !== pid),
      hback: prev.hback.filter((p) => p !== pid),
      mid: prev.mid.filter((p) => p !== pid),
      hfwd: prev.hfwd.filter((p) => p !== pid),
      fwd: prev.fwd.filter((p) => p !== pid),
      bench: prev.bench.filter((p) => p !== pid),
      [target]: [...prev[target], pid],
    }));
  }

  function handleFillPick(playerId: string) {
    if (!fillTargetZone) return;
    placeInZone(playerId, fillTargetZone);
    setFillTargetZone(null);
    setSelected(null);
  }

  const pinnedPositions = useMemo<Record<string, Zone>>(() => {
    const pins: Record<string, Zone> = {};
    // Recent arrivals: short last stint
    for (const [pid, dur] of Object.entries(lastStintMs)) {
      const z = lastStintZone[pid];
      if (z && dur < RECENT_ARRIVAL_MS) pins[pid] = z;
    }
    // Field-locked: always stay in their last zone (never go to bench)
    for (const pid of lockedIds) {
      const z = lastStintZone[pid];
      if (z) pins[pid] = z;
    }
    // Zone-locked: prefer their locked zone at quarter breaks
    for (const [pid, z] of Object.entries(zoneLockedPlayers)) {
      pins[pid] = z;
    }
    return pins;
  }, [lastStintMs, lastStintZone, lockedIds, zoneLockedPlayers]);

  // Q-just-ended teammate cohorts, keyed by player id. Built from
  // the END-of-quarter lineup (already in the live store) so it
  // captures exactly who shared a zone (or sat the bench) with whom
  // when the hooter went. Drives the suggester's partnership penalty
  // — see fairness.ts PARTNERSHIP_PENALTY.
  const previousZoneTeammates = useMemo(
    () => zoneTeammatesFromLineup(lineup),
    [lineup]
  );

  const suggestedLineup = useMemo(() => {
    if (availableForLineup.length === 0) return lineup;
    // `lastStintZone` is the zone each player ended the just-finished
    // quarter in (set by endCurrentQuarter when stints flush). The
    // suggester uses it to penalise re-using the same zone two
    // quarters running. The partnership penalty (driven by
    // `previousZoneTeammates`) handles the don't-clump-together rule
    // — replacing the older cluster penalty that compared source
    // zones in aggregate.
    // Phase D: chip-by-id map drives the chip-spread penalty so the
    // suggester scatters older/younger (or whatever the coach labels
    // each chip) across zones rather than bunching them.
    const chipByPlayerId: Record<string, "a" | "b" | "c" | null | undefined> = {};
    for (const p of players) chipByPlayerId[p.id] = p.chip;
    const suggested = suggestStartingLineup(
      healthyForLineup,
      combinedZoneMins,
      currentQuarter * 1000 + healthyForLineup.length,
      zoneCaps,
      currentGameZoneMins,
      pinnedPositions,
      lastStintZone,
      previousZoneTeammates,
      seasonAvailability,
      chipByPlayerId,
      chipModeByKey,
    );
    // Put any injured / loaned players back on the bench so they're still
    // visible to the coach but cannot be sent on.
    return {
      ...suggested,
      bench: [...suggested.bench, ...sidelinedIdsInLineup],
    };
  }, [
    availableForLineup.length,
    healthyForLineup,
    sidelinedIdsInLineup,
    combinedZoneMins,
    currentQuarter,
    lineup,
    zoneCaps,
    currentGameZoneMins,
    pinnedPositions,
    lastStintZone,
    previousZoneTeammates,
    seasonAvailability,
  ]);

  // Manual-mode draft: wipe positions, park every healthy player on
  // the bench (sidelined players stay on bench too — they're appended
  // separately below). Coach builds from this blank slate via tap-tap.
  const manualLineup = useMemo<Lineup>(() => {
    return {
      back: [],
      hback: [],
      mid: [],
      hfwd: [],
      fwd: [],
      bench: healthyForLineup.map((p) => p.id),
    };
  }, [healthyForLineup]);

  // Only re-derive `draft` when the user EXPLICITLY changes the
  // lineup mode. Without this guard, the effect re-fires whenever
  // any of suggestedLineup / manualLineup / lineup recomputes
  // underneath — and they DO recompute on:
  //   • The live store re-hydrating post-mount (basePlayedZoneMs
  //     ticks → currentGameZoneMins → combinedZoneMins →
  //     suggestedLineup)
  //   • setLineup() in handleStart() before router.refresh() —
  //     the store mutation makes `lineup` change, the effect
  //     fires, and the user's just-committed draft gets briefly
  //     overwritten by a freshly-recomputed suggestion.
  // Steve's user feedback 2026-05-09: at Q-break the lineup
  // "starts with a suggested lineup and then refreshes to a new
  // lineup a few seconds later", and on tap-to-start-next-quarter
  // it flickers similarly. Both traced to this useEffect.
  const lastAppliedModeRef = useRef<typeof lineupMode | null>(null);
  useEffect(() => {
    if (availableForLineup.length === 0) return;
    if (lastAppliedModeRef.current === lineupMode) return;
    lastAppliedModeRef.current = lineupMode;
    const next =
      lineupMode === "suggested"
        ? suggestedLineup
        : lineupMode === "manual"
          ? manualLineup
          : lineup;
    setDraft(next);
    setSelected(null);
  }, [lineupMode, suggestedLineup, manualLineup, lineup, availableForLineup.length]);

  // ─── Match-adjustment panel state ─────────────────────────────
  // The size dropdown is locally controlled — Q-break is a "stage"
  // moment, so we don't optimistically rerender the lineup picker
  // grid for the new caps. The coach sees "Q3 will play 10 a side"
  // confirmation instead, and the next quarter's render picks up
  // the new caps via router refresh after they hit Resume.
  const sizeOptions = useMemo(() => {
    const out: number[] = [];
    for (let s = maxOnFieldSize; s >= minOnFieldSize; s--) out.push(s);
    return out;
  }, [minOnFieldSize, maxOnFieldSize]);
  const [pendingSize, setPendingSize] = useState<number>(currentOnFieldSize);
  // Sync local state if the server-side currentOnFieldSize changes.
  useEffect(() => {
    setPendingSize(currentOnFieldSize);
  }, [currentOnFieldSize]);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [sizePending, startSizeTransition] = useTransition();

  function handleSizeChange(next: number) {
    if (next === currentOnFieldSize) {
      setPendingSize(next);
      return;
    }
    setSizeError(null);
    setPendingSize(next);
    startSizeTransition(async () => {
      const result = await setOnFieldSizeAction(auth, gameId, next);
      if (!result.success) {
        setSizeError(result.error);
        setPendingSize(currentOnFieldSize);
        return;
      }
      // The new caps come down via router.refresh after the user
      // taps Resume next quarter — handleStart already calls it.
      // Here we just confirm to the coach that the change took.
      reactStartTransition(() => router.refresh());
    });
  }

  // ─── Lend-player panel state ──────────────────────────────────
  // Tap a chip to un-lend a current loaner; tap "Lend a player" to
  // open a SlotFillSheet listing only available squad members.
  const [loanPending, startLoanTransition] = useTransition();
  const [loanError, setLoanError] = useState<string | null>(null);
  const [lendPickerOpen, setLendPickerOpen] = useState(false);

  function handleLoanToggle(pid: string, nextLoaned: boolean) {
    setLoanError(null);
    setLoaned(pid, nextLoaned);
    startLoanTransition(async () => {
      const result = await markLoan(auth, gameId, {
        player_id: pid,
        loaned: nextLoaned,
        // Loan stints flip at the boundary between quarters. The
        // coach is staging Q{nextQuarter}; the event semantically
        // applies "from the start of Q{nextQuarter}".
        quarter: nextQuarter,
        elapsed_ms: 0,
      });
      if (!result.success) {
        // Roll back the optimistic flip.
        setLoaned(pid, !nextLoaned);
        setLoanError(result.error);
      }
    });
  }

  // Mirror of handleLoanToggle for injuries — Steve's real-game
  // scenario is "kid had to leave at quarter time" (parent took
  // them home, hurt during the break, etc.). The injury event
  // applies from the start of the next quarter.
  function handleInjuryToggle(pid: string, nextInjured: boolean) {
    setLoanError(null);
    setInjured(pid, nextInjured);
    startLoanTransition(async () => {
      const result = await markInjury(auth, gameId, {
        player_id: pid,
        injured: nextInjured,
        quarter: nextQuarter,
        elapsed_ms: 0,
      });
      if (!result.success) {
        setInjured(pid, !nextInjured);
        setLoanError(result.error);
      }
    });
  }

  // ─── Match-adjustments collapse state ─────────────────────────
  // Collapsed by default — most coaches won't change size or lend a
  // player in any given quarter, so we keep the screen quiet. When
  // the section is closed we surface a one-line summary so the
  // coach knows whether anything is currently set.
  // Match-adjustments section: collapsed when fresh, but auto-
  // expanded if the coach already has a non-default state set
  // (lent or injured player, on-field-size override). Without
  // this, Steve's real-game complaint was "the UX only allows a
  // player to be lent while the quarter is running" — the section
  // existed but was closed and so invisible. Auto-opening when
  // there's an active state makes the management surface
  // discoverable exactly when you need it.
  // Steve 2026-05-13: always start the Game settings collapse closed.
  // Previously the initialiser auto-expanded when ANY setting was
  // non-default (lent / injured / size / rotation mode), but the
  // collapsed-header summary now spells out the active state in
  // plain English ("Auto-rebalanced · 1 lent · No injured") which
  // removes the discoverability problem the auto-expand was solving.
  // Always-closed-by-default keeps the QB visually quiet and
  // predictable across every quarter break.
  const [matchAdjustmentsOpen, setMatchAdjustmentsOpen] = useState(false);
  // Lend picker (existing) and injured picker (new) both reuse the
  // same SlotFillSheet shape. State is split so the two pickers
  // don't fight if a coach somehow opens both.
  const [injuredPickerOpen, setInjuredPickerOpen] = useState(false);
  const lentPlayers = useMemo(
    () =>
      players
        .filter((p) => loanedSet.has(p.id) && !injuredSet.has(p.id)),
    [players, loanedSet, injuredSet],
  );
  const injuredPlayers = useMemo(
    () => players.filter((p) => injuredSet.has(p.id)),
    [players, injuredSet],
  );

  // ─── Period recap (read from store) ───────────────────────────
  const scoreByQuarter = useLiveGame((s) => s.scoreByQuarter);
  // Surface "Q{currentQuarter}: us X.Y (pts) — them X.Y (pts)" plus
  // running totals. Coach reads this to sync up with the opposition's
  // record before resuming. Team is the LEFT, opp is the RIGHT.
  const justEndedQuarter = currentQuarter; // QuarterBreak shows AFTER Q ends.
  const thisQuarterScore = scoreByQuarter[justEndedQuarter] ?? null;
  const totalUs = useLiveGame((s) => s.teamScore);
  const totalThem = useLiveGame((s) => s.opponentScore);
  const aflPts = (g: number, b: number) => g * 6 + b;

  // ─── Fix-scores panel state ───────────────────────────────────
  const [showFixScores, setShowFixScores] = useState(false);
  const [scoreLog, setScoreLog] = useState<ScoreLogEntry[] | null>(null);
  const [scoreLogError, setScoreLogError] = useState<string | null>(null);
  const [scoreLogLoading, setScoreLogLoading] = useState(false);
  const [_scoreActionPending, startScoreActionTransition] = useTransition();
  // Pending delete — confirmation gate so a misclick can't silently
  // wipe a real goal during the post-Q reconcile flow. Mirrors the
  // pattern in ScoreReviewPanel.
  const [pendingDelete, setPendingDelete] = useState<ScoreLogEntry | null>(
    null,
  );
  // Add-score form state
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<
    "goal" | "behind" | "opponent_goal" | "opponent_behind"
  >("goal");
  const [addPlayerId, setAddPlayerId] = useState<string>("");
  const [addQuarter, setAddQuarter] = useState<number>(currentQuarter || 1);

  async function refreshScoreLog() {
    setScoreLogLoading(true);
    setScoreLogError(null);
    const result = await getGameScoreLog(auth, gameId);
    setScoreLogLoading(false);
    if (!result.success) {
      setScoreLogError(result.error);
      return;
    }
    setScoreLog(result.entries ?? []);
  }

  useEffect(() => {
    if (showFixScores && scoreLog === null) refreshScoreLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFixScores]);

  function handleDeleteScore(entry: ScoreLogEntry) {
    setScoreLogError(null);
    // Optimistically decrement the per-quarter slot in the store
    // alongside the cumulative. Pass the original quarter so the
    // right slot is touched even if we're past that period now.
    const q = entry.quarter ?? currentQuarter;
    const isOurs = entry.type === "goal" || entry.type === "behind";
    const kind = entry.type === "goal" || entry.type === "opponent_goal"
      ? "goals"
      : "behinds";
    if (isOurs) useLiveGame.getState().undoTeamScore(kind, q);
    else useLiveGame.getState().undoOpponentScore(kind, q);

    startScoreActionTransition(async () => {
      const result = await deleteScore(auth, gameId, entry.id);
      if (!result.success) {
        // Roll back optimistic.
        if (isOurs) useLiveGame.getState().incTeam(kind, q);
        else useLiveGame.getState().incOpponent(kind, q);
        setScoreLogError(result.error);
        return;
      }
      await refreshScoreLog();
      reactStartTransition(() => router.refresh());
    });
  }

  function handleAddScore() {
    setScoreLogError(null);
    const isOurs = addKind === "goal" || addKind === "behind";
    if (isOurs && !addPlayerId) {
      setScoreLogError("Pick a player.");
      return;
    }
    // Optimistic store bump.
    const kind = addKind === "goal" || addKind === "opponent_goal" ? "goals" : "behinds";
    if (isOurs) useLiveGame.getState().incTeam(kind, addQuarter);
    else useLiveGame.getState().incOpponent(kind, addQuarter);

    startScoreActionTransition(async () => {
      const result = await addRetroScore(auth, gameId, {
        kind: addKind,
        playerId: isOurs ? addPlayerId : null,
        intendedQuarter: addQuarter,
      });
      if (!result.success) {
        // Roll back.
        if (isOurs) useLiveGame.getState().undoTeamScore(kind, addQuarter);
        else useLiveGame.getState().undoOpponentScore(kind, addQuarter);
        setScoreLogError(result.error);
        return;
      }
      setAddOpen(false);
      setAddPlayerId("");
      await refreshScoreLog();
      reactStartTransition(() => router.refresh());
    });
  }

  // Map to scrub event lookup for "this score was already deleted by an undo".
  const undoneEventIds = useMemo(() => {
    if (!scoreLog) return new Set<string>();
    const out = new Set<string>();
    for (const e of scoreLog) {
      if (e.type === "score_undo" && e.target_event_id) out.add(e.target_event_id);
    }
    return out;
  }, [scoreLog]);

  // Active scoring events grouped by quarter (newest first), filtering
  // out ones that were already deleted via score_undo.
  const scoreLogByQuarter = useMemo(() => {
    if (!scoreLog) return null;
    const groups: Record<number, ScoreLogEntry[]> = { 1: [], 2: [], 3: [], 4: [] };
    for (const e of scoreLog) {
      if (e.type === "score_undo") continue;
      if (undoneEventIds.has(e.id)) continue;
      const q = e.quarter ?? 1;
      if (!groups[q]) groups[q] = [];
      groups[q].push(e);
    }
    // Newest first within each quarter.
    for (const q of Object.keys(groups)) {
      groups[+q].sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return groups;
  }, [scoreLog, undoneEventIds]);

  function lineupsEqual(a: Lineup, b: Lineup): boolean {
    const keys: (keyof Lineup)[] = ["back", "hback", "mid", "hfwd", "fwd", "bench"];
    for (const k of keys) {
      if (a[k].length !== b[k].length) return false;
      const sa = [...a[k]].sort();
      const sb = [...b[k]].sort();
      for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
    }
    return true;
  }

  // Two-step kickoff (Steve 2026-05-13): "Ready for Q{n+1}" used to
  // fire recordLineupSet + startQuarter immediately, then the modal
  // surfaced for the umpire's whistle gate. "Back to lineup" on that
  // modal was a dead-end — the period_break_swap had already
  // committed, no way back to the editable QB picker. Now: Ready
  // opens the modal here; only Start Q{n+1} commits both writes
  // atomically (lineup_set first, then quarter_start). "Back to
  // lineup" cleanly cancels — zero server writes.
  const [startModalOpen, setStartModalOpen] = useState(false);

  function handleOpenStartModal() {
    setError(null);
    setStartModalOpen(true);
  }

  function handleConfirmStart() {
    setError(null);
    // Normalise draft shape before sending (defensive — always full-zones).
    const full: Lineup = { ...emptyLineup(), ...draft };
    startTransition(async () => {
      if (!lineupsEqual(lineup, full)) {
        const r = await recordLineupSet(auth, gameId, full);
        if (!r.success) {
          setError(r.error);
          setStartModalOpen(false);
          return;
        }
        setLineup(full);
      }
      const result = await startQuarterAction(auth, gameId, nextQuarter);
      if (!result.success) {
        setError(result.error);
        setStartModalOpen(false);
        return;
      }
      onStarted();
      // Start the local clock right away — the modal commit is the
      // umpire's whistle, no further user action needed. Without
      // this the LiveGame mount after refresh would land with
      // clockStartedAt=null (beginNextQuarter resets it) and there's
      // no longer a LiveGame StartQuarterModal to bridge.
      startClock();
      // Medium haptic — the "go!" tap that kicks off the quarter.
      // Distinct from a light tap (score, swap) because this is a
      // deliberate consequential action the umpire's whistle aligns
      // to. P1-10 in MICRO-INTERACTIONS-PLAN.md.
      void hapticTap("medium");
      // Server-rendered events list is now stale; refresh so the page
      // picks up the new quarter_start event and re-renders into LIVE.
      // Mirrors Plan 05-04's netball fix.
      reactStartTransition(() => router.refresh());
    });
  }

  return (
    <div className="space-y-4">
      {/* Orientation strip — Steve 2026-05-13: the hero card used to
          dominate the QB top, but with the rotation toggle moved out
          (commit ba04bd1) and the fairness number removed in this
          commit, it had no functional content left worth a bordered
          card. Replace with a flush, no-chrome heading that visually
          rhymes with the GameInfoHeader strip above it. Steve
          2026-05-13 (follow-up): mode hint paragraph dropped too —
          the active mode now reads off the Game settings collapsed
          header below (e.g. "Auto-rebalanced") so duplicating it
          here was just noise. */}
      <div className="px-1">
        <p className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
          Quarter break
        </p>
        <p className="mt-0.5 text-lg font-bold text-ink">
          Set zones for Q{nextQuarter}
        </p>
      </div>

      {/* Game settings — collapsed by default. Steve 2026-05-13: the
          per-break header used to carry the rotation toggle (Suggested/
          Keep/Manual) + a hint paragraph + the title + fairness, and
          then the Match-adjustments card sat below with size/lend/
          injured. That's a lot of noise above the actual zone tiles.
          Consolidate everything-that-is-a-setting into one collapse
          named "Game settings" (matching the LineupPicker pattern).
          The current mode shows up in the collapsed summary line so a
          coach can tell at a glance what's in effect without expanding. */}
      <div className="rounded-md border border-hairline bg-surface shadow-card">
        <button
          type="button"
          onClick={() => setMatchAdjustmentsOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-alt"
          aria-expanded={matchAdjustmentsOpen}
          aria-controls="qb-match-adjustments"
        >
          <span className="flex flex-1 items-center gap-3 text-sm">
            <span className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
              Game settings
            </span>
            <span className="text-xs text-ink-mute">
              {(() => {
                // Summary line — Steve 2026-05-13 follow-up: always
                // lead with the rotation mode AND always surface
                // lent/injured status (even when both are zero) so
                // the closed header doubles as a discovery hint for
                // what's inside the collapse. A coach who doesn't
                // know they can lend/mark-injured at the break sees
                // "No lent · No injured" and learns the affordances
                // exist. Size still only shows when non-default —
                // it's a numeric value not a list, the "no" framing
                // doesn't fit.
                const bits: string[] = [];
                if (lineupMode === "suggested") bits.push("Auto-rebalanced");
                else if (lineupMode === "keep") bits.push("Keeping last Q");
                else bits.push("Manual lineup");
                if (currentOnFieldSize !== defaultOnFieldSize) {
                  bits.push(`${currentOnFieldSize} on field`);
                }
                bits.push(
                  lentPlayers.length > 0
                    ? `${lentPlayers.length} lent`
                    : "No lent",
                );
                bits.push(
                  injuredPlayers.length > 0
                    ? `${injuredPlayers.length} injured`
                    : "No injured",
                );
                return bits.join(" · ");
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
            id="qb-match-adjustments"
            className="space-y-4 border-t border-hairline px-4 py-3"
          >
            {/* Rotation mode. Lifted from the header card here so the
                header stays clean. Three modes — Suggested rotates per
                the fairness scorer (default), Keep carries Q{n} forward
                unchanged for a one-off "same again" quarter, Manual
                wipes the field for a from-scratch build. */}
            <div>
              <p className="text-xs font-semibold text-ink">Rotation</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={lineupMode === "suggested" ? "primary" : "secondary"}
                  onClick={() => {
                    setLineupMode("suggested");
                    setPersistedRotationMode("suggested");
                  }}
                >
                  {lineupMode === "suggested" ? "✓ Suggested" : "Suggested"}
                </Button>
                <Button
                  size="sm"
                  variant={lineupMode === "keep" ? "primary" : "secondary"}
                  // "keep" is a per-Q decision — DON'T persist it to the
                  // store. It's "I want THIS quarter's lineup carried
                  // forward", not a default mode. Next Q-break should
                  // fall back to whatever was previously persisted.
                  onClick={() => setLineupMode("keep")}
                >
                  {lineupMode === "keep"
                    ? "✓ Keep last quarter"
                    : "Keep last quarter"}
                </Button>
                <Button
                  size="sm"
                  variant={lineupMode === "manual" ? "primary" : "secondary"}
                  onClick={() => {
                    setLineupMode("manual");
                    setPersistedRotationMode("manual");
                  }}
                >
                  {lineupMode === "manual" ? "✓ Set manually" : "Set manually"}
                </Button>
              </div>
            </div>

            {/* On-field size dropdown */}
            <div>
              <label
                htmlFor="qb-on-field-size"
                className="block text-xs font-semibold text-ink"
              >
                On-field size
              </label>
              <div className="mt-1 flex items-center gap-2">
                <select
                  id="qb-on-field-size"
                  value={pendingSize}
                  onChange={(e) => handleSizeChange(parseInt(e.target.value, 10))}
                  disabled={sizePending || isPending}
                  className="rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm text-ink shadow-card focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:bg-surface-alt disabled:text-ink-mute"
                >
                  {sizeOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                      {s === defaultOnFieldSize ? " (default)" : ""}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-ink-mute">
                  {currentOnFieldSize === defaultOnFieldSize
                    ? `Default for this age group.`
                    : `Currently playing ${currentOnFieldSize} a side.`}
                </span>
              </div>
              {sizeError && (
                <p className="mt-1 text-xs text-danger" role="alert">
                  {sizeError}
                </p>
              )}
            </div>

            {/* Lend players — chips for current loaners + a picker
                button. Listing only the lent players (rather than
                every squad member) keeps the surface small even with
                a 22-player squad. */}
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
                    {p.jersey_number != null && (
                      <span className="tabular-nums font-semibold">
                        {p.jersey_number}
                      </span>
                    )}
                    <span>{p.full_name}</span>
                    <button
                      type="button"
                      onClick={() => handleLoanToggle(p.id, false)}
                      disabled={loanPending}
                      aria-label={`Bring ${p.full_name} back`}
                      className="ml-0.5 rounded-full px-1 text-[11px] font-bold leading-none text-warn/80 hover:bg-warn/15 hover:text-warn disabled:opacity-60"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setLendPickerOpen(true)}
                  disabled={loanPending}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-ink-dim transition-colors hover:border-brand-500/40 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-60"
                >
                  <span aria-hidden>+</span>
                  Lend a player
                </button>
              </div>
              {loanError && (
                <p className="mt-1 text-xs text-danger" role="alert">
                  {loanError}
                </p>
              )}
            </div>

            {/* Injured / left-early — paralleling Lend. The common
                Saturday case is a kid leaving at quarter time
                (parent pulls them out, niggle from the prior
                quarter, etc.); marking injured at the break excludes
                them from the next-quarter rotation without needing
                the long-press flow. */}
            <div>
              <p className="text-xs font-semibold text-ink">
                Injured / left early
              </p>
              <p className="mt-0.5 text-xs text-ink-mute">
                Injured players sit out for the rest of the game until you
                bring them back.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {injuredPlayers.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 rounded-full border border-danger/50 bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger"
                  >
                    {p.jersey_number != null && (
                      <span className="tabular-nums font-semibold">
                        {p.jersey_number}
                      </span>
                    )}
                    <span>{p.full_name}</span>
                    <button
                      type="button"
                      onClick={() => handleInjuryToggle(p.id, false)}
                      disabled={loanPending}
                      aria-label={`Mark ${p.full_name} fit`}
                      className="ml-0.5 rounded-full px-1 text-[11px] font-bold leading-none text-danger/80 hover:bg-danger/15 hover:text-danger disabled:opacity-60"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setInjuredPickerOpen(true)}
                  disabled={loanPending}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-ink-dim transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger disabled:opacity-60"
                >
                  <span aria-hidden>+</span>
                  Mark injured
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Lend-player picker modal — opens from the "+ Lend a player"
          button above. Lists every healthy, not-already-lent squad
          member; tap one to lend them for the rest of the game. */}
      {lendPickerOpen && (
        <SlotFillSheet
          slotLabel="player"
          titleVerb="Lend"
          subtitle="Pick a player to lend to the opposition for the rest of the game. Tap their chip to bring them back."
          emptyMessage="Everyone is already lent or injured."
          candidates={players
            .filter(
              (p) => !loanedSet.has(p.id) && !injuredSet.has(p.id),
            )
            .map((p) => ({
              id: p.id,
              name: p.full_name,
              jerseyNumber: p.jersey_number,
            }))}
          onPick={(pid) => {
            handleLoanToggle(pid, true);
            setLendPickerOpen(false);
          }}
          onCancel={() => setLendPickerOpen(false)}
        />
      )}

      {/* Injured-player picker — same shape as the lend picker but
          flips the injury flag instead. Used when a player has to
          leave at quarter time (parent pulls them out, niggle
          flared up during the break). */}
      {injuredPickerOpen && (
        <SlotFillSheet
          slotLabel="player"
          titleVerb="Mark injured"
          subtitle="Pick a player to mark as injured / leaving early. Tap their chip to bring them back."
          emptyMessage="Everyone is already injured or lent."
          candidates={players
            .filter(
              (p) => !loanedSet.has(p.id) && !injuredSet.has(p.id),
            )
            .map((p) => ({
              id: p.id,
              name: p.full_name,
              jerseyNumber: p.jersey_number,
            }))}
          onPick={(pid) => {
            handleInjuryToggle(pid, true);
            setInjuredPickerOpen(false);
          }}
          onCancel={() => setInjuredPickerOpen(false)}
        />
      )}

      {/* Score panel — collapsed by default. Single-line score
          summary so the coach can reconcile with the opposition
          at a glance without the panel taking real estate.
          Tapping the row anywhere expands to the full per-quarter
          breakdown table + per-player event log. */}
      {currentQuarter >= 1 && (() => {
        const usPts = aflPts(totalUs.goals, totalUs.behinds);
        const themPts = aflPts(totalThem.goals, totalThem.behinds);
        const lead = usPts - themPts;
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
            {/* Header rhythm matches the Game-settings collapse:
                [eyebrow] [summary] [chevron]. Steve 2026-05-13: the
                old layout used bold score numbers + a coloured pill +
                a "Review ▸" link, three different visual treatments
                in one row. Now the score is the summary value, with
                the lead margin coloured inline as the only at-a-
                glance read. Chevron is the single interaction cue. */}
            <span className="flex flex-1 items-center gap-3 text-sm">
              <span className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
                Score
              </span>
              <span className="nums truncate font-mono text-xs tabular-nums text-ink-mute">
                {totalUs.goals}.{totalUs.behinds} ({usPts})
                <span className="mx-1 text-ink-mute/70">–</span>
                {totalThem.goals}.{totalThem.behinds} ({themPts})
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
              {/* Quarter-by-quarter breakdown table — same shape as
                  the in-game QuarterScoreModal so the coach gets a
                  consistent view of the game's shape. */}
              <QuarterScoreTable
                scoreByQuarter={scoreByQuarter}
                currentQuarter={currentQuarter}
                quarterEnded={true}
                sport="afl"
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

              {scoreLogLoading && (
                <p className="mt-2 text-xs text-ink-mute">Loading…</p>
              )}
              {scoreLogError && (
                <p className="mt-2 text-xs text-danger" role="alert">
                  {scoreLogError}
                </p>
              )}

              {scoreLogByQuarter && (
                <div className="mt-3 space-y-3">
                  {[1, 2, 3, 4].map((q) => {
                    const entries = scoreLogByQuarter[q] ?? [];
                    if (entries.length === 0) return null;
                    return (
                      <div key={q}>
                        <p className="text-[10px] font-bold uppercase tracking-micro text-ink-mute">
                          Q{q}
                        </p>
                        <ul className="mt-1 divide-y divide-hairline rounded-md border border-hairline bg-surface-alt">
                          {entries.map((e) => {
                            const isOurs = e.type === "goal" || e.type === "behind";
                            const isGoal = e.type === "goal" || e.type === "opponent_goal";
                            const playerName = e.player_id
                              ? playersById.get(e.player_id)?.full_name ?? "—"
                              : null;
                            return (
                              <li
                                key={e.id}
                                className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                              >
                                <span className="flex items-center gap-2">
                                  <span
                                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                                      isOurs
                                        ? "bg-brand-100 text-brand-700"
                                        : "bg-warn-soft text-warn"
                                    }`}
                                  >
                                    {isGoal ? "G" : "B"}
                                  </span>
                                  <span className="font-medium text-ink">
                                    {isOurs ? playerName ?? "Player" : "Opposition"}
                                  </span>
                                  {e.retro && (
                                    <span className="rounded-full bg-ink-mute/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-micro text-ink-mute">
                                      Added
                                    </span>
                                  )}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setPendingDelete(e)}
                                  disabled={isPending}
                                  className="rounded-full border border-hairline px-2 py-0.5 text-[11px] font-medium text-ink-mute transition-colors hover:border-danger/30 hover:bg-danger/10 hover:text-danger disabled:opacity-60"
                                  aria-label="Delete this score"
                                >
                                  ×
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                  {[1, 2, 3, 4].every((q) => (scoreLogByQuarter[q] ?? []).length === 0) && (
                    <p className="text-xs text-ink-mute">No scores yet.</p>
                  )}
                </div>
              )}

              <div className="mt-3">
                {!addOpen ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAddOpen(true);
                      setAddQuarter(currentQuarter || 1);
                    }}
                    className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:border-brand-500/40 hover:text-brand-700"
                  >
                    + Add a missed score
                  </button>
                ) : (
                  <div className="rounded-md border border-hairline bg-surface p-3 shadow-card">
                    <p className="text-xs font-semibold text-ink">Add missed score</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="text-[11px] text-ink-mute">
                        Type
                        <select
                          value={addKind}
                          onChange={(e) =>
                            setAddKind(e.target.value as typeof addKind)
                          }
                          className="mt-0.5 block w-full rounded-md border border-hairline bg-surface px-2 py-1 text-xs text-ink"
                        >
                          <option value="goal">Goal (us)</option>
                          <option value="behind">Behind (us)</option>
                          <option value="opponent_goal">Goal (them)</option>
                          <option value="opponent_behind">Behind (them)</option>
                        </select>
                      </label>
                      <label className="text-[11px] text-ink-mute">
                        Quarter
                        <select
                          value={addQuarter}
                          onChange={(e) => setAddQuarter(parseInt(e.target.value, 10))}
                          className="mt-0.5 block w-full rounded-md border border-hairline bg-surface px-2 py-1 text-xs text-ink"
                        >
                          {[1, 2, 3, 4].map((q) => (
                            <option key={q} value={q}>
                              Q{q}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {(addKind === "goal" || addKind === "behind") && (
                      <label className="mt-2 block text-[11px] text-ink-mute">
                        Player
                        <select
                          value={addPlayerId}
                          onChange={(e) => setAddPlayerId(e.target.value)}
                          className="mt-0.5 block w-full rounded-md border border-hairline bg-surface px-2 py-1 text-xs text-ink"
                        >
                          <option value="">— pick —</option>
                          {players.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.jersey_number != null ? `#${p.jersey_number} ` : ""}
                              {p.full_name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleAddScore}
                        disabled={isPending}
                      >
                        Add
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setAddOpen(false);
                          setAddPlayerId("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            </div>
          )}
        </div>
        );
      })()}

      {availableForLineup.length > 0 && (
        <p className="px-1 text-xs text-ink-dim">
          Tap any two players to swap them — even across zones or to the bench.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {slots.map((slot) => (
          <div
            key={slot}
            className="rounded-md border border-hairline bg-surface p-3 shadow-card"
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-dim">
                {slotLabel(slot)}
              </h3>
              <span className="text-xs tabular-nums text-ink-mute">
                {draft[slot].length}
                {slot !== "bench" && ` / ${zoneCaps[slot]}`}
              </span>
            </div>
            {draft[slot].length === 0 ? (
              slot === "bench" ? (
                <p className="px-1 py-2 text-xs text-ink-mute">Empty</p>
              ) : (
                // Tappable empty-zone placeholder. Opens the
                // SlotFillSheet so the coach can pick a bench player
                // for this zone without going through the two-tap
                // swap dance — the only viable path in manual mode
                // where every zone starts empty.
                <button
                  type="button"
                  onClick={() => setFillTargetZone(slot)}
                  className="flex w-full items-center gap-2 rounded-md border-2 border-dashed border-brand-500/60 bg-brand-50 px-3 py-2.5 text-left text-sm text-brand-800 transition-colors hover:bg-brand-100"
                  aria-label={`Empty ${slotLabel(slot)} — tap to fill`}
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-brand-500/70 text-[10px] font-bold uppercase tracking-[0.1em] text-brand-700"
                  >
                    +
                  </span>
                  <span className="font-medium">Tap to fill</span>
                </button>
              )
            ) : (
              <ul className="space-y-1.5">
                {draft[slot].map((pid) => {
                  const p = playersById.get(pid);
                  if (!p) return null;
                  const isSelected = selected === pid;
                  const isInjured = injuredSet.has(pid);
                  const isLoaned = loanedSet.has(pid);
                  const isSidelined = isInjured || isLoaned;
                  const zm = currentGameZoneMins[pid] ?? emptyZM();
                  // Total played minutes drives the visible "12:30"
                  // label — 0 keeps the label hidden rather than
                  // showing "0:00".
                  const realTotal = zones.reduce((a, z) => a + zm[z], 0);
                  const prevSlot = slotOf(pid, lineup);
                  const moved = prevSlot && prevSlot !== slot;
                  return (
                    <li key={pid}>
                      <button
                        type="button"
                        onClick={() => handleTap(pid)}
                        disabled={isSidelined}
                        aria-disabled={isSidelined}
                        className={`flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors duration-fast ease-out-quart ${
                          isSelected
                            ? "border-brand-500 bg-brand-50 ring-2 ring-brand-400"
                            : isSidelined
                              ? "cursor-not-allowed border-hairline bg-surface-alt opacity-60"
                              : "border-hairline hover:bg-surface-alt"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <Guernsey num={p.jersey_number ?? ""} size={28} />
                          <span className="flex flex-col items-start">
                            <span className="flex items-center gap-1.5">
                              <span className="font-medium text-ink">
                                {p.chip && (
                                  <span
                                    aria-hidden
                                    className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${
                                      CHIP_COLORS[p.chip as ChipKey].dot
                                    }`}
                                  />
                                )}
                                {p.full_name}
                              </span>
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
                            {moved && prevSlot && !isSidelined && (
                              <span className="text-[10px] font-semibold uppercase tracking-micro text-brand-600">
                                {slotLabel(prevSlot)} → {slotLabel(slot)}
                              </span>
                            )}
                            {!moved && prevSlot && !isSidelined && (
                              <span className="text-[10px] uppercase tracking-micro text-ink-mute">
                                stays
                              </span>
                            )}
                            {isSidelined && (
                              <span className="text-[10px] uppercase tracking-micro text-ink-mute">
                                unavailable
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          {realTotal > 0 && !isSidelined && (
                            <span className="nums font-mono text-[10px] font-semibold tabular-nums text-ink-dim">
                              {fmtMinSec(realTotal)}
                            </span>
                          )}
                          {/* Time-in-zone bar — one segment per zone
                              the player has spent time in, width
                              proportional to ms played in that zone.
                              Steve 2026-05-13 asked for this back
                              after my earlier per-quarter
                              experiment: "i still can't see the
                              coloured bar indicating how much time
                              in each zone in the Set zones for Qx
                              page". The proportional bar answers
                              "how much of this kid's game has been
                              in each zone" at a glance, which the
                              per-quarter version didn't. Bar stays
                              empty (just the rounded grey track)
                              for a player who hasn't been on yet.
                              Colour tokens match the FWD/CENTRE/
                              BACK card headers via ZONE_BAR_COLOR. */}
                          <span
                            className="flex h-2.5 w-20 shrink-0 overflow-hidden rounded-full bg-surface-alt"
                            aria-hidden
                          >
                            {realTotal > 0 &&
                              zones.map((z) => {
                                const pct = (zm[z] / realTotal) * 100;
                                if (pct <= 0) return null;
                                return (
                                  <span
                                    key={z}
                                    style={{ width: `${pct}%` }}
                                    className={ZONE_BAR_COLOR[z]}
                                    title={`${slotLabel(z)}: ${fmtMinSec(zm[z])}`}
                                  />
                                );
                              })}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
                {/* Spare-capacity affordance — when a non-bench zone
                    has fewer players than its cap, surface a "+ Add"
                    row that opens the SlotFillSheet. Lets the coach
                    grow a short-handed zone without juggling swaps.
                    Bench has no cap, so it never renders. */}
                {slot !== "bench" && draft[slot].length < zoneCaps[slot] && (
                  <li>
                    <button
                      type="button"
                      onClick={() => setFillTargetZone(slot)}
                      className="flex w-full items-center gap-2 rounded-md border-2 border-dashed border-brand-500/60 bg-brand-50 px-2.5 py-2 text-left text-sm text-brand-800 transition-colors hover:bg-brand-100"
                      aria-label={`Add player to ${slotLabel(slot)}`}
                    >
                      <span
                        aria-hidden="true"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-brand-500/70 text-[10px] font-bold uppercase tracking-[0.1em] text-brand-700"
                      >
                        +
                      </span>
                      <span className="font-medium">Add player</span>
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
        ))}
      </div>

      {error && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {/* Sticky kickoff CTA — Steve 2026-05-13: "lets create a big
          sticky button at the bottom 'ready for Q1/2/3/4' so there
          is a clear happy path for the user to work through". The
          button used to sit inline at the bottom of the scroll, so
          on a long QB (lots of zones, lots of players, score panel
          expanded) the coach had to scroll past everything to reach
          it. Pin it to the bottom of the viewport with the same
          sticky-bar treatment the pre-game LineupPicker uses. The
          outer container above gets pb-24 so the last in-flow
          element isn't hidden behind the bar.

          Two-stage kickoff narrative preserved:
            Q-break button "Ready for Q{n}"  → opens StartQuarterModal
            Modal heading   "Ready for Q{n}"
            Modal body      "Tap when the hooter goes."
            Modal CTA       "Start Q{n}"
          Distinct labels so a coach taps each one knowing what
          it does (commit-lineup vs start-clock). Stagehand showed
          same-label buttons broke even an LLM agent. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(26,30,26,0.04)] sm:px-7 sm:pt-4">
        <div className="mx-auto max-w-4xl">
          <SFButton
            onClick={handleOpenStartModal}
            disabled={isPending}
            variant="accent"
            size="lg"
            full
          >
            Ready for Q{nextQuarter}
          </SFButton>
        </div>
      </div>

      {/* Await-kickoff modal — owned by QuarterBreak (Steve
          2026-05-13). Modal "Start Q{n+1}" handler runs both
          server writes atomically: recordLineupSet (if the draft
          differs from the committed lineup) then startQuarter.
          "Back to lineup" closes the modal — no writes, the QB
          picker is still editable in the background. */}
      {startModalOpen && (
        <StartQuarterModal
          quarter={nextQuarter}
          loading={isPending}
          onStart={handleConfirmStart}
          onCancel={() => setStartModalOpen(false)}
        />
      )}

      {/* Empty-zone picker sheet — opens when the coach taps a
          "Tap to fill" / "Add player" affordance. Lists every bench
          player so they can place someone in one tap. */}
      {fillTargetZone && (
        <SlotFillSheet
          slotLabel={slotLabel(fillTargetZone)}
          candidates={draft.bench
            .filter((pid) => !sidelinedSet.has(pid))
            .map((pid) => playersById.get(pid))
            .filter((p): p is Player => !!p)
            .map((p) => ({
              id: p.id,
              name: p.full_name,
              jerseyNumber: p.jersey_number,
            }))}
          onPick={handleFillPick}
          onCancel={() => setFillTargetZone(null)}
        />
      )}

      {/* Delete-score confirmation. Same shape as the FullTimeReview
          path's ScoreReviewPanel confirm — keeps the visual language
          consistent and prevents an accidental tap on the × from
          silently wiping a real goal during the Q-break reconcile. */}
      {pendingDelete &&
        (() => {
          const e = pendingDelete;
          const isOurs = e.type === "goal" || e.type === "behind";
          const isGoal = e.type === "goal" || e.type === "opponent_goal";
          const kindLabel = isGoal ? "goal" : "behind";
          const playerName = e.player_id
            ? playersById.get(e.player_id)?.full_name ?? "Player"
            : null;
          const subject = isOurs ? playerName ?? "Player" : "Opposition";
          const q = e.quarter ?? currentQuarter;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-ink/40"
                onClick={() => setPendingDelete(null)}
              />
              <div className="relative w-full max-w-sm rounded-lg border border-hairline bg-surface p-5 shadow-modal">
                <p className="text-center text-sm font-semibold text-ink">
                  Delete this score?
                </p>
                <p className="mt-2 text-center text-xs text-ink-mute">
                  {subject}&rsquo;s {kindLabel} in Q{q} will be removed from
                  the scoreline.
                </p>
                <div className="mt-4 flex gap-2">
                  <SFButton
                    className="flex-1"
                    variant="alarm"
                    onClick={() => {
                      const entry = pendingDelete;
                      setPendingDelete(null);
                      if (entry) handleDeleteScore(entry);
                    }}
                  >
                    Delete
                  </SFButton>
                  <SFButton
                    className="flex-1"
                    variant="ghost"
                    onClick={() => setPendingDelete(null)}
                  >
                    Cancel
                  </SFButton>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
