"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { SlotFillSheet } from "@/components/ui/SlotFillSheet";
import { Guernsey } from "@/components/sf";
import {
  addRetroScore,
  deleteScore,
  getGameScoreLog,
  markLoan,
  recordLineupSet,
  setOnFieldSize as setOnFieldSizeAction,
  startQuarter as startQuarterAction,
  type ScoreLogEntry,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import {
  ALL_ZONES,
  fairnessScore,
  suggestStartingLineup,
  zoneTeammatesFromLineup,
  type PlayerZoneMinutes,
  type SeasonAvailability,
  type ZoneCaps,
  type ZoneMinutes,
} from "@/lib/fairness";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import {
  emptyLineup,
  type Lineup,
  type Player,
  type PositionModel,
  type Zone,
} from "@/lib/types";
import { positionsFor, ZONE_SHORT_LABELS } from "@/lib/ageGroups";

// Players who came on shortly before the quarter break — keep them in their
// zone rather than moving them again immediately.
const RECENT_ARRIVAL_MS = 3 * 60 * 1000; // 3 minutes

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
  onStarted,
}: QuarterBreakProps) {
  const lineup = useLiveGame((s) => s.lineup);
  const currentQuarter = useLiveGame((s) => s.currentQuarter);
  const setLineup = useLiveGame((s) => s.setLineup);
  const basePlayedZoneMs = useLiveGame((s) => s.basePlayedZoneMs);
  const lastStintMs = useLiveGame((s) => s.lastStintMs);
  const lastStintZone = useLiveGame((s) => s.lastStintZone);
  const lockedIds = useLiveGame((s) => s.lockedIds);
  const zoneLockedPlayers = useLiveGame((s) => s.zoneLockedPlayers);
  const injuredIds = useLiveGame((s) => s.injuredIds);
  const loanedIds = useLiveGame((s) => s.loanedIds);
  const setLoaned = useLiveGame((s) => s.setLoaned);
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
  const [lineupMode, setLineupMode] = useState<"suggested" | "keep" | "manual">("suggested");

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

  const score = fairnessScore(combinedZoneMins);
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

  useEffect(() => {
    if (availableForLineup.length === 0) return;
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
      router.refresh();
    });
  }

  // ─── Lend-player panel state ──────────────────────────────────
  // Tap a player chip to flip their loan flag for the upcoming
  // quarter. Optimistic store update + persistent player_loan event.
  const [loanPending, startLoanTransition] = useTransition();
  const [loanError, setLoanError] = useState<string | null>(null);

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
      router.refresh();
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
      router.refresh();
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

  function handleStart() {
    setError(null);
    // Normalise draft shape before sending (defensive — always full-zones).
    const full: Lineup = { ...emptyLineup(), ...draft };
    startTransition(async () => {
      if (!lineupsEqual(lineup, full)) {
        const r = await recordLineupSet(auth, gameId, full);
        if (!r.success) {
          setError(r.error);
          return;
        }
        setLineup(full);
      }
      const result = await startQuarterAction(auth, gameId, nextQuarter);
      if (!result.success) {
        setError(result.error);
        return;
      }
      onStarted();
      // Server-rendered events list is now stale; refresh so the page
      // picks up the new quarter_start event and re-renders into LIVE.
      // Mirrors Plan 05-04's netball fix.
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-hairline bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
              Quarter break
            </p>
            <p className="mt-0.5 text-lg font-bold text-ink">
              Set zones for Q{nextQuarter}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums text-brand-600">
              {score}
            </p>
            <div className="flex items-center justify-end gap-1">
              <p className="text-[11px] uppercase tracking-micro text-ink-mute">
                Fairness
              </p>
              <InfoTooltip label="About the fairness index" placement="bottom-right">
                <p className="font-semibold text-ink">Fairness index</p>
                <p className="mt-1">
                  Tracks how evenly zone minutes are shared across the squad.
                  100 = perfectly even; lower numbers mean some kids have had
                  noticeably more (or less) time in certain positions.
                </p>
                <p className="mt-2">
                  Aim for a high score{" "}
                  <strong className="text-ink">by the end of the season</strong>
                  , not every game. Individual games often sit lower — that&apos;s
                  normal. Rotations even out as the year goes on.
                </p>
              </InfoTooltip>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={lineupMode === "suggested" ? "primary" : "secondary"}
            onClick={() => setLineupMode("suggested")}
          >
            {lineupMode === "suggested" ? "✓ Suggested" : "Suggested"}
          </Button>
          <Button
            size="sm"
            variant={lineupMode === "keep" ? "primary" : "secondary"}
            onClick={() => setLineupMode("keep")}
          >
            {lineupMode === "keep" ? "✓ Keep last quarter" : "Keep last quarter"}
          </Button>
          <Button
            size="sm"
            variant={lineupMode === "manual" ? "primary" : "secondary"}
            onClick={() => setLineupMode("manual")}
          >
            {lineupMode === "manual" ? "✓ Set manually" : "Set manually"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-ink-dim">
          {lineupMode === "suggested"
            ? `Auto-rebalanced for Q${nextQuarter} — least-played zones get priority.`
            : lineupMode === "keep"
              ? `Carries last quarter's lineup straight into Q${nextQuarter} — no rotation.`
              : `Blank field for Q${nextQuarter}. Tap a position, then a bench player to fill it.`}
        </p>
      </div>

      {/* Match adjustments — change the on-field size and lend players
          to the opposition before the next quarter kicks off. Both are
          common short-handed scenarios in junior footy / netball. */}
      <div className="rounded-md border border-hairline bg-surface p-4 shadow-card">
        <p className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
          Match adjustments
        </p>
        <p className="mt-1 text-xs text-ink-dim">
          Set how many on the field for Q{nextQuarter} and lend any players to the opposition. Stays the same as last quarter unless you change it.
        </p>

        {/* On-field size dropdown */}
        <div className="mt-3">
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

        {/* Lend players */}
        <div className="mt-4">
          <p className="text-xs font-semibold text-ink">Lend a player</p>
          <p className="mt-0.5 text-xs text-ink-mute">
            Lent players sit out for the rest of the game until you tap them again.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {players.length === 0 && (
              <p className="text-xs text-ink-mute">No players in the squad.</p>
            )}
            {players.map((p) => {
              const isLoaned = loanedSet.has(p.id);
              const isInjured = injuredSet.has(p.id);
              if (isInjured) return null;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleLoanToggle(p.id, !isLoaned)}
                  disabled={loanPending}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    isLoaned
                      ? "border-warn/50 bg-warn-soft text-warn"
                      : "border-hairline bg-surface text-ink-dim hover:border-brand-500/40 hover:bg-brand-50"
                  } disabled:opacity-60`}
                  aria-pressed={isLoaned}
                >
                  {p.jersey_number != null && (
                    <span className="tabular-nums font-semibold">
                      {p.jersey_number}
                    </span>
                  )}
                  <span>{p.full_name}</span>
                  {isLoaned && <span aria-hidden>✓</span>}
                </button>
              );
            })}
          </div>
          {loanError && (
            <p className="mt-1 text-xs text-danger" role="alert">
              {loanError}
            </p>
          )}
        </div>
      </div>

      {/* Period recap — read-only summary of the just-finished
          quarter alongside the running total. Coach uses this to
          reconcile with the opposition before resuming. */}
      {currentQuarter >= 1 && (
        <div className="rounded-md border border-hairline bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
              Q{justEndedQuarter} score
            </p>
            <button
              type="button"
              onClick={() => setShowFixScores((v) => !v)}
              className="text-xs font-medium text-brand-700 hover:text-brand-800"
            >
              {showFixScores ? "Hide fix scores" : "Fix scores"}
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md border border-hairline bg-surface-alt p-3">
              <p className="text-[10px] font-bold uppercase tracking-micro text-ink-mute">
                Us — Q{justEndedQuarter}
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-ink">
                {thisQuarterScore?.ours.goals ?? 0}.{thisQuarterScore?.ours.behinds ?? 0}{" "}
                <span className="text-sm font-normal text-ink-mute">
                  ({aflPts(thisQuarterScore?.ours.goals ?? 0, thisQuarterScore?.ours.behinds ?? 0)})
                </span>
              </p>
            </div>
            <div className="rounded-md border border-hairline bg-surface-alt p-3">
              <p className="text-[10px] font-bold uppercase tracking-micro text-ink-mute">
                Them — Q{justEndedQuarter}
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-ink">
                {thisQuarterScore?.theirs.goals ?? 0}.{thisQuarterScore?.theirs.behinds ?? 0}{" "}
                <span className="text-sm font-normal text-ink-mute">
                  ({aflPts(thisQuarterScore?.theirs.goals ?? 0, thisQuarterScore?.theirs.behinds ?? 0)})
                </span>
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-dim">
            Running total — Us {totalUs.goals}.{totalUs.behinds} ({aflPts(totalUs.goals, totalUs.behinds)})
            {" · "}
            Them {totalThem.goals}.{totalThem.behinds} ({aflPts(totalThem.goals, totalThem.behinds)})
          </p>

          {/* Expandable Fix-scores panel */}
          {showFixScores && (
            <div className="mt-4 border-t border-hairline pt-4">
              <p className="text-xs font-semibold text-ink">Fix scores</p>
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
                                  onClick={() => handleDeleteScore(e)}
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
          )}
        </div>
      )}

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
                  const total = zones.reduce((a, z) => a + zm[z], 0) || 1;
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
                        <span className="flex h-3 flex-1 max-w-[60px] overflow-hidden rounded-full bg-surface-alt" aria-hidden>
                          {zones.map((z) => (
                            <span
                              key={z}
                              style={{ width: `${(zm[z] / total) * 100}%` }}
                              className={ZONE_BAR_COLOR[z]}
                            />
                          ))}
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

      <div className="flex justify-end">
        <Button onClick={handleStart} loading={isPending}>
          Start Q{nextQuarter}
        </Button>
      </div>

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
    </div>
  );
}
