"use client";

// ─── LeagueLiveGame ──────────────────────────────────────────
// Rugby-league live-game orchestrator. Mirrors AFL `LiveGame.tsx`
// and netball `NetballLiveGame.tsx` end-to-end so coaches who run
// teams in multiple sports get a consistent live-game shell —
// shared `LiveTopBar` / `LiveStickyScoreBar` / `LiveAdminUtilityRow`
// chrome wrapped around RL-specific surfaces.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SFButton } from "@/components/sf";
import { LiveTopBar } from "@/components/live/LiveTopBar";
import { LiveAdminUtilityRow } from "@/components/live/LiveAdminUtilityRow";
import { ManualEndQuarterConfirm } from "@/components/live/ManualEndQuarterConfirm";
import { SubDueModal } from "@/components/live/SubDueModal";
import { ScoreRecordingDock } from "@/components/live/ScoreRecordingDock";
import { LiveStickyScoreBar } from "@/components/live/LiveStickyScoreBar";
import { LongPressHint } from "@/components/live/LongPressHint";
import { LockModal } from "@/components/live/LockModal";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { enqueueLiveAction } from "@/lib/live/registerLiveActions";
import { finaliseLeagueGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/league-actions";
import { LeagueField } from "./LeagueField";
import { LeagueBenchStrip } from "./LeagueBenchStrip";
import { LeagueScoreBug } from "./LeagueScoreBug";
import { LeagueNextSubCard } from "./LeagueNextSubCard";
import { LeagueScorerPicker } from "./LeagueScorerPicker";
import { LeagueFullTimeReview } from "./LeagueFullTimeReview";
import { LeagueGameSummaryCard } from "./LeagueGameSummaryCard";
import { VestAssignmentCard } from "./VestAssignmentCard";
import { RecordConversionDialog } from "./RecordConversionDialog";
import { KickoffPicker } from "./KickoffPicker";
import { currentVests, type VestType } from "@/lib/sports/rugby_league/vests";
import {
  playerConversionStatusInCycle,
  kickoffTakers,
  kickoffRecordedForPeriod,
} from "@/lib/sports/rugby_league/kicks";
import {
  playerMsOnField,
  suggestLeagueSubs,
} from "@/lib/sports/rugby_league/fairness";
import type { AgeGroupConfig } from "@/lib/sports/types";
import type { Game, GameEvent, LiveAuth, Player } from "@/lib/types";
import type { LeagueGameState } from "@/lib/sports/rugby_league/fairness";

interface LeagueLiveGameProps {
  auth: LiveAuth;
  game: Game;
  teamName: string;
  squad: Player[];
  ageGroup: AgeGroupConfig;
  periodSeconds: number;
  subIntervalSeconds: number | null;
  /** Team-level scoring toggle (sport-agnostic). U6/U7 default off; U8+ default on. */
  trackScoring: boolean;
  state: LeagueGameState;
  thisGameEvents: GameEvent[];
  isAdmin: boolean;
  exitHref: string;
}

export function LeagueLiveGame({
  auth,
  game,
  teamName,
  squad,
  ageGroup,
  periodSeconds,
  subIntervalSeconds,
  trackScoring,
  state,
  thisGameEvents,
  isAdmin,
  exitHref,
}: LeagueLiveGameProps) {
  const router = useRouter();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [endQConfirmOpen, setEndQConfirmOpen] = useState(false);
  const [subAckedAtBaseMs, setSubAckedAtBaseMs] = useState<number | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [conversionDialogOpen, setConversionDialogOpen] = useState(false);
  /**
   * Own-team scorer picker — invoked by the scorebug's `+T` chip.
   * The chip itself doesn't mutate state; it opens this picker so
   * the coach can attribute the try without first having to tap a
   * player tile.
   */
  const [scorerPickerOpen, setScorerPickerOpen] = useState(false);
  /**
   * Long-press action sheet target. Null when closed; otherwise the
   * player_id whose tile was long-pressed. Driven by both field and
   * bench tiles via `onPlayerLongPress`.
   */
  const [actionSheetPlayerId, setActionSheetPlayerId] = useState<string | null>(
    null,
  );
  /**
   * When set, the VestAssignmentCard is mounted as a forced modal.
   * Triggered automatically when an FR/DH wearer leaves the field
   * (subbed off, injured, or loaned) — the coach must pick a
   * replacement before play continues.
   */
  const [forceVestReplaceOpen, setForceVestReplaceOpen] = useState(false);
  /**
   * Track which periods we've already prompted a forced vest
   * replacement for. Without this, the modal would re-mount every
   * render after the coach dismisses it (the missing-wearer state
   * lingers until the next vest_assigned lands).
   */
  const dismissedForceVestRef = useRef<Set<string>>(new Set());

  const kickoffSkippedRef = useRef<Set<number>>(new Set());
  const [kickoffSkippedTick, setKickoffSkippedTick] = useState(0);

  // ── Local clock tick + pause ─────────────────────────────────
  // The clock derives `elapsedMs` from wall-clock time anchored at
  // `state.quarterStartedAt`. Pause is currently CLIENT-ONLY: while
  // `pausedAtElapsedMs` is non-null the elapsed value is frozen at
  // that point. Pause doesn't persist across reloads yet — needs a
  // `quarter_pause` / `quarter_resume` event pair to lock in server-
  // side. Filed as a follow-up; the UX matches AFL for now.
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [pausedAtElapsedMs, setPausedAtElapsedMs] = useState<number | null>(
    null,
  );
  const running = pausedAtElapsedMs == null;
  useEffect(() => {
    if (!state.quarterStartedAt || state.quarterEnded || state.finalised) {
      return;
    }
    if (!running) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state.quarterStartedAt, state.quarterEnded, state.finalised, running]);

  const elapsedMs = useMemo(() => {
    if (pausedAtElapsedMs != null) return pausedAtElapsedMs;
    if (state.quarterStartedAt == null) return state.quarterElapsedMs ?? 0;
    if (nowMs == null) return state.quarterElapsedMs ?? 0;
    return Math.max(0, nowMs - new Date(state.quarterStartedAt).getTime());
  }, [nowMs, state.quarterStartedAt, state.quarterElapsedMs, pausedAtElapsedMs]);

  // Reset pause when the period flips — a fresh quarter starts
  // running by default.
  useEffect(() => {
    setPausedAtElapsedMs(null);
  }, [state.currentQuarter, state.quarterEnded]);

  function handleClockTap() {
    if (!state.quarterStartedAt || state.quarterEnded || state.finalised) {
      return;
    }
    setPausedAtElapsedMs((prev) => (prev == null ? elapsedMs : null));
  }

  const hooterFiredRef = useRef(false);

  // ── Period label resolver ─────────────────────────────────────
  const periodLabel = ageGroup.periodLabel ?? "quarter";
  const periodLabelPlural = ageGroup.periodLabelPlural ?? "quarters";

  // ── Derived lineups ───────────────────────────────────────────
  // `forwardPlayers` and `backPlayers` map the position-aware buckets
  // back to Player records. `fieldPlayers` is the union used wherever
  // the consumer doesn't care which zone — keeps the bulk of the live
  // logic legible since most of it (vest assignments, late-arrival
  // detection, sub timing) doesn't read zone info.
  const forwardPlayers = useMemo<Player[]>(() => {
    if (!state.lineup) return [];
    return state.lineup.forwards
      .map((id) => squad.find((p) => p.id === id))
      .filter((p): p is Player => Boolean(p));
  }, [state.lineup, squad]);
  const backPlayers = useMemo<Player[]>(() => {
    if (!state.lineup) return [];
    return state.lineup.backs
      .map((id) => squad.find((p) => p.id === id))
      .filter((p): p is Player => Boolean(p));
  }, [state.lineup, squad]);
  const fieldPlayers = useMemo<Player[]>(
    () => [...forwardPlayers, ...backPlayers],
    [forwardPlayers, backPlayers],
  );
  const benchPlayers = useMemo<Player[]>(() => {
    if (!state.lineup) return [];
    return state.lineup.bench
      .map((id) => squad.find((p) => p.id === id))
      .filter((p): p is Player => Boolean(p));
  }, [state.lineup, squad]);

  // Late-arrival candidates.
  const lateArrivalCandidates = useMemo<Player[]>(() => {
    if (!state.lineup) return squad;
    const placed = new Set([
      ...state.lineup.forwards,
      ...state.lineup.backs,
      ...state.lineup.bench,
    ]);
    return squad.filter((p) => !placed.has(p.id));
  }, [squad, state.lineup]);

  // ── Injury / loan derivation (last value wins per player) ────
  const { injuredIds, loanedIds } = useMemo(() => {
    const injured = new Map<string, { ts: string; on: boolean }>();
    const loaned = new Map<string, { ts: string; on: boolean }>();
    for (const ev of thisGameEvents) {
      if (!ev.player_id) continue;
      const meta = (ev.metadata ?? {}) as {
        injured?: boolean;
        loaned?: boolean;
      };
      if (ev.type === "injury") {
        const on = meta.injured ?? true;
        const prev = injured.get(ev.player_id);
        if (!prev || prev.ts < ev.created_at) {
          injured.set(ev.player_id, { ts: ev.created_at, on });
        }
      } else if (ev.type === "player_loan") {
        const on = meta.loaned ?? true;
        const prev = loaned.get(ev.player_id);
        if (!prev || prev.ts < ev.created_at) {
          loaned.set(ev.player_id, { ts: ev.created_at, on });
        }
      }
    }
    return {
      injuredIds: Array.from(injured.entries())
        .filter(([, v]) => v.on)
        .map(([id]) => id),
      loanedIds: Array.from(loaned.entries())
        .filter(([, v]) => v.on)
        .map(([id]) => id),
    };
  }, [thisGameEvents]);
  const injuredSet = useMemo(() => new Set(injuredIds), [injuredIds]);
  const loanedSet = useMemo(() => new Set(loanedIds), [loanedIds]);

  // ── Vest assignment ──────────────────────────────────────────
  const periodForVests = state.currentQuarter || 1;
  const activeVests = useMemo(
    () => currentVests(thisGameEvents, periodForVests),
    [thisGameEvents, periodForVests],
  );
  const vestByPlayer = useMemo<Record<string, VestType>>(() => {
    const map: Record<string, VestType> = {};
    if (activeVests.fr) map[activeVests.fr] = "fr";
    if (activeVests.dh) map[activeVests.dh] = "dh";
    return map;
  }, [activeVests]);
  const vestRequired
    = Boolean(ageGroup.vestRequirements?.fr || ageGroup.vestRequirements?.dh);

  // ── Conversion / kickoff cycle state ─────────────────────────
  const onFieldIds = useMemo(() => {
    if (!state.lineup) return [];
    return [...state.lineup.forwards, ...state.lineup.backs];
  }, [state.lineup]);
  const onFieldSet = useMemo(() => new Set(onFieldIds), [onFieldIds]);
  const conversionByPlayer = useMemo(
    () => playerConversionStatusInCycle(thisGameEvents, onFieldIds),
    [thisGameEvents, onFieldIds],
  );
  const kickoffTakerIds = useMemo(
    () => kickoffTakers(thisGameEvents),
    [thisGameEvents],
  );

  // ── Per-player time on field ─────────────────────────────────
  // Mirrors AFL's `totalMsByPlayer` map. The replay engine doesn't
  // track this (RL fairness is "unbroken periods" so the dashboard
  // path doesn't need minute resolution), but the live tiles do —
  // the AFL-style `#7 · 8:42` readout demands it. Computed each
  // render from the event log; quantization in `LeaguePlayerTile`'s
  // memo means tick-induced re-renders mostly hit the cache.
  const totalMsByPlayer = useMemo(
    () => playerMsOnField(thisGameEvents, state.currentQuarter, elapsedMs),
    [thisGameEvents, state.currentQuarter, elapsedMs],
  );
  const kickingAllowed = ageGroup.kickingAllowed === true;
  const kickoffNeededForPeriod
    = kickingAllowed
    && state.currentQuarter >= 1
    && !state.quarterEnded
    && !state.finalised
    && !kickoffRecordedForPeriod(thisGameEvents, state.currentQuarter);

  // ── Sub-due derivation ───────────────────────────────────────
  const subIntervalMs
    = subIntervalSeconds != null ? subIntervalSeconds * 1000 : null;
  const lastSwapOrPeriodElapsed = useMemo<number | null>(() => {
    if (state.currentQuarter < 1) return null;
    for (let i = thisGameEvents.length - 1; i >= 0; i--) {
      const ev = thisGameEvents[i];
      const meta = ev.metadata as { quarter?: number; elapsed_ms?: number };
      if (meta.quarter !== state.currentQuarter) continue;
      if (ev.type === "swap") {
        return typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : null;
      }
      if (ev.type === "quarter_start") {
        return 0;
      }
    }
    return null;
  }, [thisGameEvents, state.currentQuarter]);
  // Filter out injured / loaned bench players — they can't come on.
  const swappableBench = useMemo(
    () =>
      benchPlayers.filter(
        (p) => !injuredSet.has(p.id) && !loanedSet.has(p.id),
      ),
    [benchPlayers, injuredSet, loanedSet],
  );
  const hasSwappableBench = swappableBench.length > 0;
  const subIsDue
    = subIntervalMs != null
    && lastSwapOrPeriodElapsed != null
    && state.currentQuarter >= 1
    && !state.quarterEnded
    && !state.finalised
    && hasSwappableBench
    && elapsedMs - lastSwapOrPeriodElapsed >= subIntervalMs;

  const msUntilDue
    = subIntervalMs != null && lastSwapOrPeriodElapsed != null
      ? lastSwapOrPeriodElapsed + subIntervalMs - elapsedMs
      : null;

  // Reset sub-due ack on period change.
  useEffect(() => {
    setSubAckedAtBaseMs(null);
  }, [state.currentQuarter]);

  // ── Next-sub suggestion ──────────────────────────────────────
  // FR / DH wearers are excluded from the off-candidate pool so the
  // suggestion never asks the coach to remove a vest mid-period
  // unless they explicitly long-press the wearer + tap "Replace".
  const excludeOff = useMemo(() => {
    const out: string[] = [];
    if (activeVests.fr) out.push(activeVests.fr);
    if (activeVests.dh) out.push(activeVests.dh);
    return out;
  }, [activeVests]);
  // Bench filtered down to swappable players — caller-side exclusion
  // for injured / loaned. The suggester reads `currentLineup.bench`
  // directly, so we pass a filtered copy rather than the raw lineup.
  const chipByPlayerId = useMemo(
    () => new Map(squad.map((p) => [p.id, p.chip ?? null])),
    [squad],
  );
  const nextSubSuggestions = useMemo(() => {
    if (state.currentQuarter < 1 || state.quarterEnded || state.finalised) {
      return [];
    }
    if (!state.lineup) return [];
    return suggestLeagueSubs(
      thisGameEvents,
      state.currentQuarter,
      {
        forwards: state.lineup.forwards,
        backs: state.lineup.backs,
        bench: swappableBench.map((p) => p.id),
      },
      excludeOff,
      elapsedMs,
      chipByPlayerId,
    );
  }, [
    thisGameEvents,
    state.currentQuarter,
    state.quarterEnded,
    state.finalised,
    state.lineup,
    swappableBench,
    excludeOff,
    elapsedMs,
    chipByPlayerId,
  ]);

  // ── Force-vest-replacement detection ─────────────────────────
  // Triggered when an FR/DH wearer is no longer on the field.
  // Possible causes: sub off (swap), injury, loan.
  const missingVestWearer = useMemo<VestType | null>(() => {
    if (!vestRequired || !state.lineup) return null;
    if (state.currentQuarter < 1 || state.finalised) return null;
    if (
      ageGroup.vestRequirements?.fr
      && activeVests.fr
      && !onFieldSet.has(activeVests.fr)
    ) {
      return "fr";
    }
    if (
      ageGroup.vestRequirements?.dh
      && activeVests.dh
      && !onFieldSet.has(activeVests.dh)
    ) {
      return "dh";
    }
    return null;
  }, [
    vestRequired,
    state.lineup,
    state.currentQuarter,
    state.finalised,
    ageGroup.vestRequirements,
    activeVests,
    onFieldSet,
  ]);
  // Auto-open the forced replacement when the wearer disappears,
  // unless the coach has already dismissed this period's prompt
  // (e.g. "Replace later" — they may want to bring the wearer
  // back themselves).
  useEffect(() => {
    if (missingVestWearer == null) return;
    const key = `${state.currentQuarter}-${missingVestWearer}`;
    if (dismissedForceVestRef.current.has(key)) return;
    setForceVestReplaceOpen(true);
  }, [missingVestWearer, state.currentQuarter]);
  // Clear the "dismissed for period N" set when the period changes.
  useEffect(() => {
    dismissedForceVestRef.current = new Set();
  }, [state.currentQuarter]);

  const periodForAssignment
    = state.quarterEnded && state.currentQuarter < ageGroup.periodCount
      ? state.currentQuarter + 1
      : state.currentQuarter || 1;

  const selectedPlayer = useMemo(
    () => squad.find((p) => p.id === selectedPlayerId) ?? null,
    [selectedPlayerId, squad],
  );
  const selectedOnField
    = selectedPlayer != null
    && (state.lineup
      ? state.lineup.forwards.includes(selectedPlayer.id)
        || state.lineup.backs.includes(selectedPlayer.id)
      : false);
  const selectedOnBench
    = selectedPlayer != null && state.lineup?.bench.includes(selectedPlayer.id);

  // ── Click handlers ────────────────────────────────────────────
  function handlePlayerTap(playerId: string) {
    setError(null);
    setSelectedPlayerId((prev) => (prev === playerId ? null : playerId));
  }

  function handleClearSelection() {
    setSelectedPlayerId(null);
  }

  const endQuarterAtClient = useCallback(
    async (elapsed: number) => {
      setPending(true);
      const { flushed } = enqueueLiveAction("endLeagueQuarter", [
        auth,
        game.id,
        state.currentQuarter,
        elapsed,
      ]);
      await flushed;
      setPending(false);
      router.refresh();
    },
    [auth, game.id, state.currentQuarter, router],
  );

  useEffect(() => {
    if (state.quarterEnded || state.finalised) {
      hooterFiredRef.current = false;
      return;
    }
    if (!state.quarterStartedAt) return;
    if (hooterFiredRef.current) return;
    // While paused, the clock display is frozen but `elapsedMs` may
    // still satisfy the period cap from before the pause — don't
    // auto-end during a pause; the coach is making a deliberate
    // stop and will resume / end explicitly.
    if (!running) return;
    const periodMs = periodSeconds * 1000;
    if (elapsedMs >= periodMs) {
      hooterFiredRef.current = true;
      void endQuarterAtClient(periodMs);
    }
  }, [
    elapsedMs,
    state.quarterEnded,
    state.finalised,
    state.quarterStartedAt,
    periodSeconds,
    running,
    endQuarterAtClient,
  ]);

  async function handleStartNextPeriod() {
    setPending(true);
    setError(null);
    const next = state.currentQuarter + 1;
    const { flushed } = enqueueLiveAction("startLeagueQuarter", [
      auth,
      game.id,
      next,
    ]);
    await flushed;
    setPending(false);
    router.refresh();
  }

  async function recordTryForPlayer(playerId: string) {
    setPending(true);
    const { flushed } = enqueueLiveAction("recordTry", [
      auth,
      game.id,
      playerId,
      state.currentQuarter,
      elapsedMs,
    ]);
    await flushed;
    setPending(false);
    handleClearSelection();
    if (kickingAllowed) {
      setConversionDialogOpen(true);
    }
    router.refresh();
  }

  async function handleRecordTryFromDock() {
    if (!selectedPlayer) {
      setError("Tap a player first.");
      return;
    }
    void recordTryForPlayer(selectedPlayer.id);
  }

  async function handleRecordOpponentTry() {
    setPending(true);
    const { flushed } = enqueueLiveAction("recordOpponentTry", [
      auth,
      game.id,
      state.currentQuarter,
      elapsedMs,
    ]);
    await flushed;
    setPending(false);
    router.refresh();
  }

  function handleOpenConversionDialog() {
    setError(null);
    setConversionDialogOpen(true);
  }

  async function handleRecordOpponentConversion() {
    setPending(true);
    const { flushed } = enqueueLiveAction("recordOpponentConversion", [
      auth,
      game.id,
      state.currentQuarter,
      elapsedMs,
    ]);
    await flushed;
    setPending(false);
    router.refresh();
  }

  async function handleUndoScore() {
    setPending(true);
    const { flushed } = enqueueLiveAction("undoLeagueScore", [auth, game.id]);
    await flushed;
    setPending(false);
    router.refresh();
  }

  async function applySwap(offId: string, onId: string) {
    setPending(true);
    const { flushed } = enqueueLiveAction("recordLeagueSwap", [
      auth,
      game.id,
      {
        off_player_id: offId,
        on_player_id: onId,
        quarter: state.currentQuarter,
        elapsed_ms: elapsedMs,
      },
    ]);
    await flushed;
    setPending(false);
    handleClearSelection();
    router.refresh();
  }

  /**
   * Apply EVERY suggested swap in the next-sub card — rotates the
   * whole bench in one tap. Each pair is enqueued as its own
   * `recordLeagueSwap` so the replay sees them in order, and so a
   * mid-rotation failure doesn't cascade.
   *
   * The bench/field sets change as each swap lands; the suggester
   * already paired off-targets uniquely so we can fire them in
   * order without re-evaluating. We do NOT re-run the suggester
   * between flushes — the snapshot the coach saw on screen is
   * what gets executed.
   */
  async function handleApplyAllSubs() {
    if (nextSubSuggestions.length === 0) return;
    setPending(true);
    const flushedAll: Promise<void>[] = [];
    for (const swap of nextSubSuggestions) {
      const { flushed } = enqueueLiveAction("recordLeagueSwap", [
        auth,
        game.id,
        {
          off_player_id: swap.off.playerId,
          on_player_id: swap.on.playerId,
          quarter: state.currentQuarter,
          elapsed_ms: elapsedMs,
        },
      ]);
      flushedAll.push(flushed);
    }
    await Promise.all(flushedAll).catch(() => {
      // Per-op failure already rolls back via the queue's cap;
      // we just stop waiting so the UI unfreezes.
    });
    setPending(false);
    handleClearSelection();
    router.refresh();
  }

  async function maybeCompleteSwap(secondId: string) {
    if (!selectedPlayer || !state.lineup) return false;
    const onForwards = state.lineup.forwards;
    const onBacks = state.lineup.backs;
    const zoneOfId = (id: string): "forward" | "back" | null => {
      if (onForwards.includes(id)) return "forward";
      if (onBacks.includes(id)) return "back";
      return null;
    };
    const firstZone = zoneOfId(selectedPlayer.id);
    const secondZone = zoneOfId(secondId);
    const firstOnField = firstZone !== null;
    const secondOnField = secondZone !== null;
    // Field ↔ field: positional swap. Both players stay on the
    // field. If they're in the same zone, just exchange order in
    // that bucket (the formation arranger reads order to assign
    // slots). If they're in different zones, swap zones — useful
    // when the coach wants to flip a forward and a back without
    // benching anyone.
    if (firstOnField && secondOnField) {
      let nextForwards = onForwards.slice();
      let nextBacks = onBacks.slice();
      if (firstZone === secondZone) {
        const arr = firstZone === "forward" ? nextForwards : nextBacks;
        const i = arr.indexOf(selectedPlayer.id);
        const j = arr.indexOf(secondId);
        if (i >= 0 && j >= 0) {
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        if (firstZone === "forward") nextForwards = arr;
        else nextBacks = arr;
      } else {
        // Cross-zone — swap their bucket membership.
        nextForwards = nextForwards.map((id) =>
          id === selectedPlayer.id
            ? secondId
            : id === secondId
              ? selectedPlayer.id
              : id,
        );
        nextBacks = nextBacks.map((id) =>
          id === selectedPlayer.id
            ? secondId
            : id === secondId
              ? selectedPlayer.id
              : id,
        );
      }
      setPending(true);
      const { flushed } = enqueueLiveAction("recordLeagueLineupSet", [
        auth,
        game.id,
        {
          forwards: nextForwards,
          backs: nextBacks,
          bench: state.lineup.bench,
        },
      ]);
      await flushed;
      setPending(false);
      handleClearSelection();
      router.refresh();
      return true;
    }
    // Field ↔ bench (or bench ↔ field): standard rolling sub.
    if (firstOnField !== secondOnField) {
      const off = firstOnField ? selectedPlayer.id : secondId;
      const on = firstOnField ? secondId : selectedPlayer.id;
      await applySwap(off, on);
      return true;
    }
    return false;
  }

  async function handlePlayerTapMaybeSwap(playerId: string) {
    if (
      selectedPlayer
      && state.lineup
      && playerId !== selectedPlayer.id
    ) {
      const completed = await maybeCompleteSwap(playerId);
      if (completed) return;
    }
    handlePlayerTap(playerId);
  }

  /**
   * Empty slot was tapped. When a bench player is selected, move
   * them onto the field via a fresh `lineup_set` — no swap-off
   * needed because the slot is already empty. The replay engine
   * picks up the new field/bench split and the formation re-renders
   * with the player filling the previously-empty slot.
   *
   * No-op when nothing's selected — the empty slot stays clickable
   * but does nothing until the coach picks a bench player.
   */
  async function handleVacantSpotTap() {
    if (!selectedPlayer || !state.lineup) return;
    if (!state.lineup.bench.includes(selectedPlayer.id)) return;
    setPending(true);
    // Route the promoted bench player by chip — Forward chip lands
    // in forwards, Back chip lands in backs, unchipped fall through
    // to forwards (keeps the slot-fill stable when nobody is
    // chipped).
    const promoted = squad.find((p) => p.id === selectedPlayer.id) ?? null;
    const targetZone
      = promoted?.chip === "b" ? "back" : "forward";
    const nextForwards
      = targetZone === "forward"
        ? [...state.lineup.forwards, selectedPlayer.id]
        : state.lineup.forwards;
    const nextBacks
      = targetZone === "back"
        ? [...state.lineup.backs, selectedPlayer.id]
        : state.lineup.backs;
    const nextBench = state.lineup.bench.filter(
      (id) => id !== selectedPlayer.id,
    );
    const { flushed } = enqueueLiveAction("recordLeagueLineupSet", [
      auth,
      game.id,
      { forwards: nextForwards, backs: nextBacks, bench: nextBench },
    ]);
    await flushed;
    setPending(false);
    handleClearSelection();
    router.refresh();
  }

  async function handleAddLateArrival(playerId: string) {
    setPending(true);
    // The shared `addLateArrival` action expects an input object,
    // not a bare player id (matches AFL's `handleLateArrival`
    // shape). Passing the bare string silently lands an event with
    // `player_id: undefined`, which is why the bench refused to
    // render the new arrival — the replay engine ignored the row.
    const { flushed } = enqueueLiveAction("addLateArrival", [
      auth,
      game.id,
      {
        player_id: playerId,
        quarter: Math.max(1, state.currentQuarter),
        elapsed_ms: elapsedMs,
      },
    ]);
    await flushed;
    setPending(false);
    router.refresh();
  }

  async function handleFinalise() {
    setPending(true);
    setError(null);
    const result = await finaliseLeagueGame(auth, game.id, elapsedMs);
    setPending(false);
    if (!result.success) {
      setError(result.error ?? "Couldn't finalise the game.");
      return;
    }
    router.refresh();
  }

  // ── Long-press action handlers ──────────────────────────────
  function handlePlayerLongPress(playerId: string) {
    setError(null);
    setActionSheetPlayerId(playerId);
  }

  async function handleToggleInjury(playerId: string, injured: boolean) {
    setPending(true);
    const { flushed } = enqueueLiveAction("markInjury", [
      auth,
      game.id,
      {
        player_id: playerId,
        injured,
        quarter: state.currentQuarter,
        elapsed_ms: elapsedMs,
      },
    ]);
    await flushed;
    setPending(false);
    setActionSheetPlayerId(null);
    router.refresh();
  }

  async function handleToggleLoan(playerId: string, loaned: boolean) {
    setPending(true);
    const { flushed } = enqueueLiveAction("markLoan", [
      auth,
      game.id,
      {
        player_id: playerId,
        loaned,
        quarter: state.currentQuarter,
        elapsed_ms: elapsedMs,
      },
    ]);
    await flushed;
    setPending(false);
    setActionSheetPlayerId(null);
    router.refresh();
  }

  function handleReplaceVestFromActionSheet() {
    setActionSheetPlayerId(null);
    setForceVestReplaceOpen(true);
  }

  // Mid-game forward↔back override. Emits `league_position_change`
  // and the replayer moves the player between lineup.forwards and
  // lineup.backs without touching field membership (stints + §6
  // compliance keep ticking). No-op when the player isn't on field
  // — the action-sheet only surfaces the button for on-field
  // players anyway.
  async function handleMoveLeaguePosition(
    playerId: string,
    toZone: "forward" | "back",
  ) {
    if (!state.lineup) return;
    const wasOnField
      = state.lineup.forwards.includes(playerId)
      || state.lineup.backs.includes(playerId);
    if (!wasOnField) return;
    setPending(true);
    const { flushed } = enqueueLiveAction("recordLeaguePositionChange", [
      auth,
      game.id,
      {
        player_id: playerId,
        to_zone: toZone,
        quarter: state.currentQuarter,
        elapsed_ms: elapsedMs,
      },
    ]);
    await flushed;
    setPending(false);
    setActionSheetPlayerId(null);
    router.refresh();
  }

  function handleForceVestDismiss() {
    setForceVestReplaceOpen(false);
    if (missingVestWearer != null) {
      const key = `${state.currentQuarter}-${missingVestWearer}`;
      dismissedForceVestRef.current.add(key);
    }
  }

  // Auto-close the forced-replace modal when no wearer is missing
  // anymore (e.g. the coach swapped them back on rather than
  // replacing the vest).
  useEffect(() => {
    if (missingVestWearer == null && forceVestReplaceOpen) {
      setForceVestReplaceOpen(false);
    }
  }, [missingVestWearer, forceVestReplaceOpen]);

  // ── State views ───────────────────────────────────────────────
  const isPeriodActive
    = state.currentQuarter >= 1 && !state.quarterEnded && !state.finalised;
  const isAtQbreak
    = state.quarterEnded
    && state.currentQuarter >= 1
    && state.currentQuarter < ageGroup.periodCount
    && !state.finalised;
  const isAtFinalQ
    = state.quarterEnded
    && state.currentQuarter >= ageGroup.periodCount
    && !state.finalised;
  const minutes = Math.floor(elapsedMs / 60_000);
  const seconds = Math.floor((elapsedMs % 60_000) / 1000);
  const clockReadout = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  const hasStickyBottom
    = isPeriodActive || isAtQbreak || isAtFinalQ || state.finalised;
  const scoreDockVisible
    = isPeriodActive && Boolean(selectedPlayer) && selectedOnField;
  const stickyPb
    = scoreDockVisible
      ? "pb-[calc(13rem+env(safe-area-inset-bottom))]"
      : hasStickyBottom
        ? "pb-[calc(7rem+env(safe-area-inset-bottom))]"
        : "";

  // Action-sheet target lookup
  const actionSheetPlayer = useMemo(
    () => squad.find((p) => p.id === actionSheetPlayerId) ?? null,
    [actionSheetPlayerId, squad],
  );
  const actionSheetOnField
    = actionSheetPlayerId != null
    && (state.lineup
      ? state.lineup.forwards.includes(actionSheetPlayerId)
        || state.lineup.backs.includes(actionSheetPlayerId)
      : false);
  const actionSheetVest
    = actionSheetPlayerId != null ? vestByPlayer[actionSheetPlayerId] ?? null : null;
  const actionSheetInjured
    = actionSheetPlayerId != null && injuredSet.has(actionSheetPlayerId);
  const actionSheetLoaned
    = actionSheetPlayerId != null && loanedSet.has(actionSheetPlayerId);

  return (
    <div className={`space-y-3 ${stickyPb}`.trim()}>
      <LiveTopBar exitHref={exitHref} game={game} />

      {error && <InlineAlert kind="danger">{error}</InlineAlert>}

      {/* Next-sub indicator — mirrors AFL's SwapCard. Renders the
          full bench rotation (one swap per bench player) with
          "Do all N swaps" so the whole bench cycles in one tap. */}
      {isPeriodActive && nextSubSuggestions.length > 0 && (
        <LeagueNextSubCard
          suggestions={nextSubSuggestions}
          msUntilDue={msUntilDue}
          subIntervalMs={subIntervalMs}
          due={subIsDue}
          onApplyAll={() => void handleApplyAllSubs()}
          onApplyOne={(swap) =>
            void applySwap(swap.off.playerId, swap.on.playerId)
          }
          pending={pending}
          playerById={new Map(squad.map((p) => [p.id, p]))}
        />
      )}

      {/* Field + bench */}
      {state.lineup && (
        <>
          <LeagueField
            players={fieldPlayers}
            forwardPlayers={forwardPlayers}
            backPlayers={backPlayers}
            onFieldSize={game.on_field_size}
            vestRequirements={ageGroup.vestRequirements}
            triesByPlayer={state.playerTries}
            totalMsByPlayer={totalMsByPlayer}
            vestByPlayer={vestByPlayer}
            conversionByPlayer={conversionByPlayer}
            kickoffTakerIds={kickoffTakerIds}
            injuredIds={injuredSet}
            loanedIds={loanedSet}
            selectedPlayerId={selectedPlayerId}
            onPlayerClick={handlePlayerTapMaybeSwap}
            onPlayerLongPress={handlePlayerLongPress}
            onVacantSpotTap={
              selectedPlayer && selectedOnBench
                ? handleVacantSpotTap
                : undefined
            }
            disabled={pending}
          />
          <LeagueBenchStrip
            players={benchPlayers}
            triesByPlayer={state.playerTries}
            totalMsByPlayer={totalMsByPlayer}
            vestByPlayer={vestByPlayer}
            conversionByPlayer={conversionByPlayer}
            kickoffTakerIds={kickoffTakerIds}
            injuredIds={injuredSet}
            loanedIds={loanedSet}
            selectedPlayerId={selectedPlayerId}
            onPlayerClick={handlePlayerTapMaybeSwap}
            onPlayerLongPress={handlePlayerLongPress}
            disabled={pending}
          />
        </>
      )}

      {kickoffNeededForPeriod
        && !kickoffSkippedRef.current.has(state.currentQuarter)
        && kickoffSkippedTick >= 0 && (
          <KickoffPicker
            auth={auth}
            gameId={game.id}
            squad={squad}
            events={thisGameEvents}
            period={state.currentQuarter}
            onSkip={() => {
              kickoffSkippedRef.current.add(state.currentQuarter);
              setKickoffSkippedTick((n) => n + 1);
            }}
          />
        )}

      {selectedPlayer && selectedOnBench && isPeriodActive && (
        <p className="rounded-md bg-brand-50 px-3 py-2 text-xs text-brand-800">
          Selected from bench: <strong>{selectedPlayer.full_name}</strong> —
          tap a player on the field to swap them on.{" "}
          <button
            type="button"
            onClick={handleClearSelection}
            className="text-brand-700 underline"
          >
            Cancel
          </button>
        </p>
      )}

      {isAtQbreak && (
        <section className="rounded-xl border border-brand-500/40 bg-brand-50 p-4 shadow-card">
          <p className="mb-3 text-sm font-medium text-ink">
            {periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1)}{" "}
            {state.currentQuarter} done. Score:{" "}
            <strong>{state.teamScore.points}</strong> –{" "}
            <strong>{state.opponentScore.points}</strong>.
          </p>
          <SFButton
            onClick={handleStartNextPeriod}
            disabled={pending}
            variant="accent"
            size="lg"
            full
          >
            Ready for {periodLabel} {state.currentQuarter + 1}
          </SFButton>
        </section>
      )}

      {isAtQbreak && vestRequired && state.lineup && (
        <VestAssignmentCard
          auth={auth}
          gameId={game.id}
          squad={squad}
          onFieldPlayerIds={[
            ...state.lineup.forwards,
            ...state.lineup.backs,
          ]}
          events={thisGameEvents}
          ageGroup={ageGroup}
          period={periodForAssignment}
        />
      )}

      {/* Pre-finalise review — full per-period reconcile + finalise
          button. Mirrors AFL `FullTimeReview` shape: per-side score
          boxes, per-period table, finalise CTA. */}
      {isAtFinalQ && (
        <LeagueFullTimeReview
          auth={auth}
          gameId={game.id}
          state={state}
          events={thisGameEvents}
          ageGroup={ageGroup}
          trackScoring={trackScoring}
          finalisedElapsedMs={elapsedMs}
          teamName={teamName}
          opponentName={game.opponent || "Opponent"}
        />
      )}

      {/* Post-finalise share card — selectable share text + "Copy
          for group chat". Mirrors AFL `GameSummaryCard`. */}
      {state.finalised && (
        <LeagueGameSummaryCard
          state={state}
          events={thisGameEvents}
          squad={squad}
          trackScoring={trackScoring}
          teamName={teamName}
          opponentName={game.opponent || "Opponent"}
          finalisedElapsedMs={elapsedMs}
          showArrivalPulse
        />
      )}

      <LiveAdminUtilityRow
        candidates={lateArrivalCandidates}
        onLateArrival={handleAddLateArrival}
        lateArrivalPending={pending}
        isAdmin={isAdmin}
        auth={auth}
        gameId={game.id}
      />

      {/* End-period-early lives on the scorebug clock pill now —
          the standalone link button has been folded into the
          pause-aware affordance pattern from AFL's `GameHeader`. */}

      {/* Score-recording dock — appears when a field player is selected. */}
      {scoreDockVisible && selectedPlayer && (
        <ScoreRecordingDock
          heading={
            <>
              Record score for{" "}
              <span className="text-brand-700">
                {selectedPlayer.full_name}
              </span>
            </>
          }
          onCancel={handleClearSelection}
          actions={
            <div className="space-y-2">
              {/* Single + Try button. The conversion dialog auto-
                  opens after the try lands at U8+, since you can't
                  have a conversion without a try first. */}
              <button
                type="button"
                onClick={handleRecordTryFromDock}
                disabled={pending}
                className="w-full rounded-sm bg-brand-600 py-3 font-mono text-base font-bold uppercase tracking-micro text-white shadow-card transition-colors duration-fast ease-out-quart hover:bg-brand-500 disabled:opacity-60"
              >
                + Try
              </button>
              <p className="text-center text-[11px] text-ink-mute">
                Or tap a bench player to swap{" "}
                <strong>{selectedPlayer.full_name}</strong> off.
              </p>
            </div>
          }
        />
      )}

      {/* Sticky-bottom scorebug + undo strip. */}
      {hasStickyBottom && (
        <LiveStickyScoreBar
          scorebug={
            <LeagueScoreBug
              teamName={teamName}
              opponentName={game.opponent || "Opponent"}
              teamScore={state.teamScore}
              opponentScore={state.opponentScore}
              periodLabel={periodLabel}
              periodLabelPlural={periodLabelPlural}
              currentPeriod={state.currentQuarter}
              periodCount={ageGroup.periodCount}
              clockReadout={clockReadout}
              quarterEnded={state.quarterEnded}
              trackScoring={trackScoring}
              onTeamTry={
                // Allow recording during live play AND at quarter
                // break + final-quarter review — Steve 2026-05-18:
                // buzzer-beater tries land after the hooter, and
                // coaches need to log them post-whistle. Also lets
                // coaches correct a missed score at the break.
                (isPeriodActive || isAtQbreak || isAtFinalQ)
                  ? () => setScorerPickerOpen(true)
                  : undefined
              }
              onTeamConversion={
                (isPeriodActive || isAtQbreak || isAtFinalQ) && kickingAllowed
                  ? handleOpenConversionDialog
                  : undefined
              }
              onOpponentTry={
                (isPeriodActive || isAtQbreak || isAtFinalQ)
                  ? handleRecordOpponentTry
                  : undefined
              }
              onOpponentConversion={
                (isPeriodActive || isAtQbreak || isAtFinalQ) && kickingAllowed
                  ? handleRecordOpponentConversion
                  : undefined
              }
              kickingAllowed={kickingAllowed}
              pending={pending}
              running={running}
              onClockTap={isPeriodActive ? handleClockTap : undefined}
              onEndPeriodEarly={
                isPeriodActive ? () => setEndQConfirmOpen(true) : undefined
              }
            />
          }
          undoStrip={
            (state.teamScore.points > 0 || state.opponentScore.points > 0)
              && !state.finalised
              ? (
                <div className="mx-4 mb-1 flex items-center justify-end px-3">
                  <button
                    type="button"
                    onClick={handleUndoScore}
                    disabled={pending}
                    className="text-xs font-medium text-ink-dim underline-offset-2 hover:text-ink hover:underline disabled:opacity-60"
                  >
                    Undo last score
                  </button>
                </div>
              )
              : undefined
          }
        />
      )}

      {endQConfirmOpen && (
        <ManualEndQuarterConfirm
          quarter={state.currentQuarter}
          onConfirm={() => {
            setEndQConfirmOpen(false);
            void endQuarterAtClient(elapsedMs);
          }}
          onCancel={() => setEndQConfirmOpen(false)}
          playersLabel="on-field"
          // U10–U12 plays halves; U6–U9 plays quarters. The picker's
          // age-group config carries the right label so the modal
          // reads "End H2" instead of "End Q2" at U10+.
          periodLabel={periodLabel}
        />
      )}

      {subIsDue && subAckedAtBaseMs !== lastSwapOrPeriodElapsed && (
        <SubDueModal
          onAcknowledge={() => setSubAckedAtBaseMs(lastSwapOrPeriodElapsed)}
        />
      )}

      {conversionDialogOpen && state.lineup && (
        <RecordConversionDialog
          auth={auth}
          gameId={game.id}
          squad={squad}
          onFieldPlayerIds={[
            ...state.lineup.forwards,
            ...state.lineup.backs,
          ]}
          events={thisGameEvents}
          quarter={state.currentQuarter}
          elapsedMs={elapsedMs}
          onClose={() => setConversionDialogOpen(false)}
        />
      )}

      {/* Force-vest-replace modal: shown when an FR/DH wearer leaves
          the field (sub, injury, loan) until the coach picks a
          replacement OR explicitly dismisses for the period. */}
      {forceVestReplaceOpen && vestRequired && state.lineup && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-2xl bg-surface p-4 shadow-modal sm:rounded-2xl">
            <header className="mb-3 flex items-start justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wide text-ink-dim">
                  Replace {missingVestWearer === "fr" ? "First Receiver" : missingVestWearer === "dh" ? "Dummy Half" : "vest"}
                </h2>
                <p className="text-xs text-ink-mute">
                  The vest wearer is no longer on the field. Pick a
                  replacement to continue.
                </p>
              </div>
              <button
                type="button"
                onClick={handleForceVestDismiss}
                className="rounded-md px-2 py-1 text-sm text-ink-mute hover:bg-surface-alt"
              >
                Later
              </button>
            </header>
            <VestAssignmentCard
              auth={auth}
              gameId={game.id}
              squad={squad}
              onFieldPlayerIds={[
                ...state.lineup.forwards,
                ...state.lineup.backs,
              ]}
              events={thisGameEvents}
              ageGroup={ageGroup}
              period={state.currentQuarter || 1}
              onDone={() => setForceVestReplaceOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Own-team scorer picker — invoked by scorebug +T. */}
      {scorerPickerOpen && (
        <LeagueScorerPicker
          onFieldPlayers={fieldPlayers}
          pending={pending}
          onCancel={() => setScorerPickerOpen(false)}
          onPick={(pid) => {
            setScorerPickerOpen(false);
            void recordTryForPlayer(pid);
          }}
        />
      )}

      {/* Long-press action sheet — shared `LockModal` (same modal AFL
          uses) so coaches running both sports get identical UX. RL
          omits the lock-to-field / lock-to-zone buttons (no zones to
          lock to and the vest mechanic covers "always on"). A
          dedicated "Replace First Receiver / Dummy Half" button
          surfaces for current vest wearers via the optional
          vestReplaceLabel prop. */}
      {actionSheetPlayer && (
        <LockModal
          player={actionSheetPlayer}
          currentLock={null}
          currentZone={null}
          isInjured={actionSheetInjured}
          isLoaned={actionSheetLoaned}
          seasonLoanMins={0}
          squadLoanMins={0}
          onUnlock={() => setActionSheetPlayerId(null)}
          onToggleInjury={() =>
            void handleToggleInjury(
              actionSheetPlayer.id,
              !actionSheetInjured,
            )
          }
          onToggleLoan={() =>
            void handleToggleLoan(
              actionSheetPlayer.id,
              !actionSheetLoaned,
            )
          }
          onSwitch={() => {
            setActionSheetPlayerId(null);
            setSelectedPlayerId(actionSheetPlayer.id);
          }}
          vestReplaceLabel={
            actionSheetVest === "fr"
              ? "First Receiver"
              : actionSheetVest === "dh"
                ? "Dummy Half"
                : undefined
          }
          onReplaceVest={
            actionSheetVest ? handleReplaceVestFromActionSheet : undefined
          }
          // "Move to {Forwards/Backs}" hidden from the long-press
          // menu (Steve 2026-05-19) — coaches handle forward/back
          // re-ratios manually via tap-to-swap.
          onClose={() => setActionSheetPlayerId(null)}
        />
      )}

      {/* First-tap long-press discovery hint. */}
      <LongPressHint enabled={isPeriodActive} />
    </div>
  );
}
