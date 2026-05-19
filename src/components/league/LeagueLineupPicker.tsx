"use client";

// ─── LeagueLineupPicker ──────────────────────────────────────
// Pre-game lineup selection — mirrors the AFL LineupPicker shape
// closely so coaches who run an AFL team and a rugby-league team
// see the same UX.
//
//   1. Game Settings (collapsible)
//      ─ Rotation mode: Suggested / Set manually
//      ─ Players on field: select dropdown (legal range for the age
//        group, default flagged as recommended)
//      ─ Lend a player: chip list + "+ Lend a player" picker
//   2. Starting field — single SFCard with a row list (no zones,
//      since junior RL is positionless). FR and DH render as the
//      first two rows so the coach can see vest assignments at a
//      glance. Each row has a Guernsey jersey icon (number-free
//      for RL), the player name, and a swap icon on the right.
//   3. Tap a row → action sheet appears below the lineup card
//      with: Make/Remove FR · Make/Remove DH · Swap · Bench.
//   4. Sub interval — same shape AFL uses.
//
// Confirming kicks the game off via `startLeagueGame` which
// atomically writes lineup_set + quarter_start + vest_assigned
// for period 1 + persists the sub interval on the games row.

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LineupPickerBreadcrumb } from "@/components/lineup/LineupPickerBreadcrumb";
import { LineupPickerFooter } from "@/components/lineup/LineupPickerFooter";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { SFButton, SFCard, SFIcon, Guernsey } from "@/components/sf";
import { VestPlanPill, VestPlanCandidatePicker } from "./VestPlanRow";
import { markLoan } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import {
  startLeagueGame,
  saveLeagueLineupDraft,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/league-actions";
import {
  seasonVestCountsByPlayer,
  suggestLeagueLineup,
  suggestVestRotation,
} from "@/lib/sports/rugby_league/fairness";
import { chipZone } from "@/lib/sports/rugby_league/positions";
import type { AgeGroupConfig } from "@/lib/sports/types";
import type {
  GameEvent,
  LeagueLineup,
  LeagueZone,
  LiveAuth,
  Player,
} from "@/lib/types";

// ─── Sub-interval suggestion helpers (mirrors AFL, +RL §6) ────
// AFL has no analogue of Junior RL Law §6 (every player gets at
// least N unbroken periods). The base formula spreads
// `bench × gameMinutes` across the squad. RL has to do the same
// AFTER reserving each player's required unbroken window — coaches
// CAN'T sub during a player's unbroken stint, so rotation
// effectively only happens during the remaining time. Without
// this correction the suggested interval is roughly double what
// the rotation pool can actually use, and the coach is left with
// bench players who never get on.
function restsPerPlayer(benchSize: number): number {
  return Math.max(1, Math.ceil(benchSize / 2));
}
function suggestedSubMinutes(
  benchSize: number,
  totalPlayers: number,
  gameMinutes: number,
  /**
   * Minutes per player that are LOCKED for the unbroken-period
   * requirement (RL Laws §6). 0 for AFL/netball. Subtracted from
   * the gameMinutes pool before the per-bench share is divided,
   * since rotation can only happen outside the locked window.
   */
  unbrokenLockedMinutes: number = 0,
): number {
  if (benchSize <= 0 || totalPlayers <= 0) return 4;
  const rests = restsPerPlayer(benchSize);
  const rotateableMinutes = Math.max(
    1,
    gameMinutes - unbrokenLockedMinutes,
  );
  const raw = (benchSize * rotateableMinutes) / (totalPlayers * rests);
  const rounded = Math.round(raw * 2) / 2;
  return Math.min(10, Math.max(1, rounded));
}

interface LeagueLineupPickerProps {
  auth: LiveAuth;
  gameId: string;
  players: Player[];
  ageGroup: AgeGroupConfig;
  defaultOnFieldSize: number;
  minOnFieldSize: number;
  maxOnFieldSize: number;
  initialDraft?: { lineup: LeagueLineup; updated_at: string } | null;
  backHref?: string | null;
  seasonEvents: GameEvent[];
  initialLoanedIds?: string[];
  /**
   * Coach-defined chip labels — chip A is the Forward role, chip B
   * is the Back role (RL convention seeded by migration 0039). Used
   * to label the two field sections in the picker; falls back to
   * "Forwards" / "Backs" when null.
   */
  chipLabels?: {
    a: string | null;
    b: string | null;
  };
}

export function LeagueLineupPicker({
  auth,
  gameId,
  players,
  ageGroup,
  defaultOnFieldSize,
  minOnFieldSize,
  maxOnFieldSize,
  initialDraft,
  backHref,
  seasonEvents,
  initialLoanedIds = [],
  chipLabels,
}: LeagueLineupPickerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [savePending, setSavePending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(
    initialDraft?.updated_at ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  /**
   * Transient inline notice ("Charlie B moved up from the bench")
   * shown after the picker re-arranges the lineup automatically —
   * e.g. when the coach lends out a starting field player and a
   * bench candidate slides into the empty slot. Cleared on any
   * other state change.
   */
  const [lineupNotice, setLineupNotice] = useState<string | null>(null);

  const reqs = ageGroup.vestRequirements;
  const vestRequiredFr = reqs?.fr === true;
  const vestRequiredDh = reqs?.dh === true;
  const vestsRequired = vestRequiredFr || vestRequiredDh;

  // ── Game Settings collapsible state ─────────────────────────
  const [gameSettingsOpen, setGameSettingsOpen] = useState(false);
  const [onFieldSize, setOnFieldSize] = useState(defaultOnFieldSize);
  const [lineupMode, setLineupMode] = useState<"suggested" | "manual">(() =>
    initialDraft ? "manual" : "suggested",
  );

  // ── Loaned players ──────────────────────────────────────────
  // Sport-agnostic — same `markLoan` action AFL uses. Toggling
  // dispatches a `player_loan` event; the picker optimistically
  // updates the chip set + rolls back on server error.
  const [loanedIds, setLoanedIds] = useState<Set<string>>(
    () => new Set(initialLoanedIds),
  );
  const [loanError, setLoanError] = useState<string | null>(null);
  const [loanPending, startLoanTransition] = useTransition();
  const [lendPickerOpen, setLendPickerOpen] = useState(false);

  const lentPlayers = useMemo(
    () => players.filter((p) => loanedIds.has(p.id)),
    [players, loanedIds],
  );
  const playersForLineup = useMemo(
    () => players.filter((p) => !loanedIds.has(p.id)),
    [players, loanedIds],
  );

  // ── Initial suggestion ──────────────────────────────────────
  const initialSuggestion = useMemo(
    () =>
      suggestLeagueLineup({
        players: playersForLineup,
        defaultOnFieldSize,
        forwardCount: ageGroup.forwardCount,
        seasonEvents,
        requiredUnbrokenPeriods: ageGroup.minUnbrokenPeriods ?? 0,
        vestRequirements: reqs,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Per-player season vest tallies — drives the "FR 3 · DH 1"
  // hint under each candidate in the rotation plan picker.
  const seasonVestCounts = useMemo(
    () => seasonVestCountsByPlayer(seasonEvents),
    [seasonEvents],
  );

  // Two on-field buckets — forwards above, backs below. The picker
  // tracks them separately so the coach can override a player's
  // position for THIS game without touching their chip (which is
  // the season-long default). Renders as two stacked cards on the
  // page; the union `fieldIds` derived below feeds legacy code
  // paths (FR/DH vest plan validation, capacity checks).
  const [forwardIds, setForwardIds] = useState<string[]>(
    () => initialDraft?.lineup.forwards ?? initialSuggestion.lineup.forwards,
  );
  const [backIds, setBackIds] = useState<string[]>(
    () => initialDraft?.lineup.backs ?? initialSuggestion.lineup.backs,
  );
  const [benchIds, setBenchIds] = useState<string[]>(
    () => initialDraft?.lineup.bench ?? initialSuggestion.lineup.bench,
  );

  // ── Derived bucket helpers ──────────────────────────────────
  // Most call sites care about "is this player on the field?" or
  // "how many players are on the field?". They don't need to know
  // which zone, so a derived union keeps the existing logic
  // readable. Use these instead of touching forwardIds/backIds
  // directly when a zone-agnostic answer is fine.
  const fieldIds = useMemo(
    () => [...forwardIds, ...backIds],
    [forwardIds, backIds],
  );
  const zoneOf = (id: string): LeagueZone | null => {
    if (forwardIds.includes(id)) return "forward";
    if (backIds.includes(id)) return "back";
    return null;
  };
  // ── Vest rotation plan ──────────────────────────────────────
  // FR + DH wearers planned for EVERY period, not just period 1.
  // Coaches want to tell kids ahead of time ("you're DH in half 2")
  // and the rotation rule ("one vest worn once per game") only
  // verifies legal when seen across the whole game. The initial
  // suggestion runs through `suggestVestRotation` so each period's
  // pick respects the no-twice rule against earlier periods.
  const initialVestRotation = useMemo(
    () => {
      const initialOnField
        = initialDraft
          ? [
              ...initialDraft.lineup.forwards,
              ...initialDraft.lineup.backs,
            ]
          : [
              ...initialSuggestion.lineup.forwards,
              ...initialSuggestion.lineup.backs,
            ];
      return suggestVestRotation({
        onFieldIds: initialOnField,
        players: playersForLineup,
        seasonEvents,
        requiredUnbrokenPeriods: ageGroup.minUnbrokenPeriods ?? 0,
        vestRequirements: reqs,
        periodCount: ageGroup.periodCount,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [frByPeriod, setFrByPeriod] = useState<(string | null)[]>(() =>
    initialDraft
      ? Array(ageGroup.periodCount).fill(null)
      : initialVestRotation.fr,
  );
  const [dhByPeriod, setDhByPeriod] = useState<(string | null)[]>(() =>
    initialDraft
      ? Array(ageGroup.periodCount).fill(null)
      : initialVestRotation.dh,
  );
  // Aliases for period-1 — the field rows still tag FR / DH against
  // period 1 since that's who runs out at kickoff.
  const frId = frByPeriod[0] ?? null;
  const dhId = dhByPeriod[0] ?? null;
  const setFrId = (id: string | null) =>
    setFrByPeriod((prev) => [id, ...prev.slice(1)]);
  const setDhId = (id: string | null) =>
    setDhByPeriod((prev) => [id, ...prev.slice(1)]);
  /** Open inline picker for the rotation plan — `{ vest, period }` or null. */
  const [vestPlanEdit, setVestPlanEdit] = useState<{
    vest: "fr" | "dh";
    period: number;
  } | null>(null);

  // ── Sub interval ────────────────────────────────────────────
  const gameMinutes
    = (ageGroup.periodSeconds * ageGroup.periodCount) / 60;
  // Each player's locked unbroken-stint pool. Pulled from the age
  // group's `minUnbrokenPeriods` requirement (RL §6: U6–U9 = 2
  // quarters; U10–U12 = 1 half). Multiplied by one period length so
  // the result is minutes the coach can't rotate during, per player.
  const periodMinutes = ageGroup.periodSeconds / 60;
  const unbrokenLockedMinutes
    = (ageGroup.minUnbrokenPeriods ?? 0) * periodMinutes;
  const benchCountForSuggest = Math.max(
    0,
    players.length - defaultOnFieldSize,
  );
  const suggestedSubMin = suggestedSubMinutes(
    benchCountForSuggest,
    players.length,
    gameMinutes,
    unbrokenLockedMinutes,
  );
  const [subMinInput, setSubMinInput] = useState<string>(
    String(suggestedSubMin),
  );
  const subIntervalSeconds = Math.round(
    Math.min(10, Math.max(1, parseFloat(subMinInput) || suggestedSubMin))
      * 60,
  );

  const playerById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players],
  );

  // Sorted dropdown options. The default size is marked recommended.
  const sizeOptions = useMemo(() => {
    const out: { value: number; label: string }[] = [];
    for (let s = minOnFieldSize; s <= maxOnFieldSize; s++) {
      const tag
        = s === defaultOnFieldSize
          ? " — recommended"
          : s === defaultOnFieldSize - 1
          ? " — 1 empty position"
          : s < defaultOnFieldSize
          ? ` — ${defaultOnFieldSize - s} empty positions`
          : ` — ${s - defaultOnFieldSize} extra`;
      out.push({ value: s, label: `${s} on field${tag}` });
    }
    return out;
  }, [defaultOnFieldSize, minOnFieldSize, maxOnFieldSize]);

  // ── Action sheet (FR / DH / Swap / Bench) ───────────────────
  const [actionPlayerId, setActionPlayerId] = useState<string | null>(null);
  const [awaitingSwapPick, setAwaitingSwapPick] = useState(false);

  function moveFieldToBench(playerId: string) {
    setForwardIds((prev) => prev.filter((id) => id !== playerId));
    setBackIds((prev) => prev.filter((id) => id !== playerId));
    setBenchIds((prev) =>
      prev.includes(playerId) ? prev : [...prev, playerId],
    );
    if (frId === playerId) setFrId(null);
    if (dhId === playerId) setDhId(null);
  }
  /**
   * Pull a bench player onto the field. Routes to forwards or backs
   * by the player's chip — Forward-chipped players land in forwards;
   * Back-chipped land in backs; unchipped fall through to whichever
   * zone has room (forwards first). Coach can then move them via
   * "Make Forward" / "Make Back" in the action sheet if the
   * auto-routing put them in the wrong row.
   */
  function moveBenchToField(playerId: string, preferred?: LeagueZone) {
    const player = playerById.get(playerId);
    const chipPref = chipZone(player?.chip);
    const target: LeagueZone = preferred ?? chipPref ?? "forward";
    setBenchIds((prev) => prev.filter((id) => id !== playerId));
    if (target === "forward") {
      setForwardIds((prev) =>
        prev.includes(playerId) ? prev : [...prev, playerId],
      );
      setBackIds((prev) => prev.filter((id) => id !== playerId));
    } else {
      setBackIds((prev) =>
        prev.includes(playerId) ? prev : [...prev, playerId],
      );
      setForwardIds((prev) => prev.filter((id) => id !== playerId));
    }
  }
  /** Toggle a player between forwards and backs without leaving the field. */
  function moveBetweenZones(playerId: string, toZone: LeagueZone) {
    if (toZone === "forward") {
      setBackIds((prev) => prev.filter((id) => id !== playerId));
      setForwardIds((prev) =>
        prev.includes(playerId) ? prev : [...prev, playerId],
      );
    } else {
      setForwardIds((prev) => prev.filter((id) => id !== playerId));
      setBackIds((prev) =>
        prev.includes(playerId) ? prev : [...prev, playerId],
      );
    }
  }

  function handleRowTap(playerId: string, onField: boolean) {
    setError(null);
    // Swap completion path: an on-field player has been picked
    // and the coach taps a second row — atomic swap. The on-coming
    // player joins the zone the off-going one vacated, preserving
    // the forward-back ratio without needing manual zone toggling.
    if (awaitingSwapPick && actionPlayerId && actionPlayerId !== playerId) {
      const source = actionPlayerId;
      const sourceOnField = fieldIds.includes(source);
      if (sourceOnField && onField) {
        // Both on field — pass the vest, no field/bench shuffle.
        if (frId === source) setFrId(playerId);
        if (dhId === source) setDhId(playerId);
      } else if (sourceOnField && !onField) {
        // Field → bench swap. Slot the on-coming bench player into
        // whichever zone the source vacated.
        const sourceZone = zoneOf(source) ?? "forward";
        moveFieldToBench(source);
        moveBenchToField(playerId, sourceZone);
      } else if (!sourceOnField && onField) {
        const targetZone = zoneOf(playerId) ?? "forward";
        moveFieldToBench(playerId);
        moveBenchToField(source, targetZone);
      } else {
        // Both on bench — no-op (shouldn't happen via UI gates).
      }
      setLineupMode("manual");
      setActionPlayerId(null);
      setAwaitingSwapPick(false);
      return;
    }
    // Open action sheet (or close if tapping the same row again).
    setAwaitingSwapPick(false);
    setActionPlayerId((prev) => (prev === playerId ? null : playerId));
  }

  function handleMakeForward() {
    if (!actionPlayerId) return;
    setLineupMode("manual");
    if (zoneOf(actionPlayerId) === "back") {
      moveBetweenZones(actionPlayerId, "forward");
    } else if (!fieldIds.includes(actionPlayerId)) {
      // Action sheet on a bench player → promote them as a forward.
      if (fieldIds.length >= onFieldSize) {
        setError(
          `Already at ${onFieldSize} on field — bench someone first.`,
        );
        setActionPlayerId(null);
        return;
      }
      moveBenchToField(actionPlayerId, "forward");
    }
    setActionPlayerId(null);
  }
  function handleMakeBack() {
    if (!actionPlayerId) return;
    setLineupMode("manual");
    if (zoneOf(actionPlayerId) === "forward") {
      moveBetweenZones(actionPlayerId, "back");
    } else if (!fieldIds.includes(actionPlayerId)) {
      if (fieldIds.length >= onFieldSize) {
        setError(
          `Already at ${onFieldSize} on field — bench someone first.`,
        );
        setActionPlayerId(null);
        return;
      }
      moveBenchToField(actionPlayerId, "back");
    }
    setActionPlayerId(null);
  }

  function handleMakeFr() {
    if (!actionPlayerId) return;
    setLineupMode("manual");
    if (frId === actionPlayerId) {
      setFrId(null);
    } else {
      setFrId(actionPlayerId);
      if (dhId === actionPlayerId) setDhId(null);
    }
    setActionPlayerId(null);
  }
  function handleMakeDh() {
    if (!actionPlayerId) return;
    setLineupMode("manual");
    if (dhId === actionPlayerId) {
      setDhId(null);
    } else {
      setDhId(actionPlayerId);
      if (frId === actionPlayerId) setFrId(null);
    }
    setActionPlayerId(null);
  }
  function handleEnterSwap() {
    setAwaitingSwapPick(true);
  }
  function handleBench() {
    if (!actionPlayerId) return;
    setLineupMode("manual");
    if (fieldIds.includes(actionPlayerId)) {
      moveFieldToBench(actionPlayerId);
    } else if (benchIds.includes(actionPlayerId)) {
      if (fieldIds.length >= onFieldSize) {
        setError(
          `Already at ${onFieldSize} on field — bench someone first.`,
        );
        setActionPlayerId(null);
        return;
      }
      moveBenchToField(actionPlayerId);
    }
    setActionPlayerId(null);
  }
  function handleCancelAction() {
    setActionPlayerId(null);
    setAwaitingSwapPick(false);
  }

  // ── Mode + size handlers ────────────────────────────────────
  function applyRotationFromField(fieldIdsForSuggest: string[]) {
    const rotation = suggestVestRotation({
      onFieldIds: fieldIdsForSuggest,
      players: playersForLineup,
      seasonEvents,
      requiredUnbrokenPeriods: ageGroup.minUnbrokenPeriods ?? 0,
      vestRequirements: reqs,
      periodCount: ageGroup.periodCount,
    });
    setFrByPeriod(rotation.fr);
    setDhByPeriod(rotation.dh);
  }
  function handleModeChange(next: "suggested" | "manual") {
    if (next === lineupMode) return;
    setLineupMode(next);
    if (next === "suggested") {
      const r = suggestLeagueLineup({
        players: playersForLineup,
        defaultOnFieldSize: onFieldSize,
        forwardCount: ageGroup.forwardCount,
        seasonEvents,
        requiredUnbrokenPeriods: ageGroup.minUnbrokenPeriods ?? 0,
        vestRequirements: reqs,
      });
      setForwardIds(r.lineup.forwards);
      setBackIds(r.lineup.backs);
      setBenchIds(r.lineup.bench);
      applyRotationFromField([...r.lineup.forwards, ...r.lineup.backs]);
    } else {
      // Manual: everyone on bench so the coach builds from scratch.
      setForwardIds([]);
      setBackIds([]);
      setBenchIds(playersForLineup.map((p) => p.id));
      setFrByPeriod(Array(ageGroup.periodCount).fill(null));
      setDhByPeriod(Array(ageGroup.periodCount).fill(null));
    }
  }
  function handleSizeChange(next: number) {
    setOnFieldSize(next);
    if (lineupMode === "suggested") {
      const r = suggestLeagueLineup({
        players: playersForLineup,
        defaultOnFieldSize: next,
        forwardCount: ageGroup.forwardCount,
        seasonEvents,
        requiredUnbrokenPeriods: ageGroup.minUnbrokenPeriods ?? 0,
        vestRequirements: reqs,
      });
      setForwardIds(r.lineup.forwards);
      setBackIds(r.lineup.backs);
      setBenchIds(r.lineup.bench);
      applyRotationFromField([...r.lineup.forwards, ...r.lineup.backs]);
    }
  }

  // ── Lend handlers ───────────────────────────────────────────
  function handleLendToggle(playerId: string, nextLoaned: boolean) {
    setLoanError(null);
    setLineupNotice(null);
    setLoanedIds((prev) => {
      const next = new Set(prev);
      if (nextLoaned) next.add(playerId);
      else next.delete(playerId);
      return next;
    });
    if (nextLoaned) {
      // Drop the lent player out of both buckets, AND if they were
      // a starting field player auto-promote the first non-lent
      // bench player into the empty slot. Without this, lending a
      // starter silently drops the field below the on-field target
      // (Steve 2026-05-18: "it was not made clear that his spot had
      // to be filled by a player on the bench").
      const lentZone = zoneOf(playerId);
      const wasOnField = lentZone !== null;
      let nextForwards = forwardIds.filter((id) => id !== playerId);
      let nextBacks = backIds.filter((id) => id !== playerId);
      let nextBench = benchIds.filter((id) => id !== playerId);
      if (wasOnField) {
        // Promote a non-lent bench player. Prefer one whose chip
        // matches the vacated zone so the position ratio holds.
        const targetChip = lentZone === "forward" ? "a" : "b";
        const chipMatch = nextBench.find(
          (id) =>
            !loanedIds.has(id) &&
            id !== playerId &&
            (playerById.get(id)?.chip ?? null) === targetChip,
        );
        const promote
          = chipMatch
          ?? nextBench.find(
            (id) => !loanedIds.has(id) && id !== playerId,
          );
        if (promote) {
          if (lentZone === "forward") nextForwards = [...nextForwards, promote];
          else nextBacks = [...nextBacks, promote];
          nextBench = nextBench.filter((id) => id !== promote);
          const promoteName
            = playerById.get(promote)?.full_name ?? "A bench player";
          const lentName
            = playerById.get(playerId)?.full_name ?? "the lent player";
          setLineupNotice(
            `${promoteName} moved up from the bench to fill ${lentName}'s spot.`,
          );
        } else {
          setLineupNotice(
            "Nobody on the bench to fill the empty starting spot — drop the on-field count or bring someone back.",
          );
        }
      }
      setForwardIds(nextForwards);
      setBackIds(nextBacks);
      setBenchIds(nextBench);
      // Clear the lent player from EVERY period of the rotation
      // plan — they're not coming back this game. Same for DH.
      setFrByPeriod((prev) =>
        prev.map((id) => (id === playerId ? null : id)),
      );
      setDhByPeriod((prev) =>
        prev.map((id) => (id === playerId ? null : id)),
      );
    } else {
      // Returning: park on bench.
      setBenchIds((prev) =>
        prev.includes(playerId) ? prev : [...prev, playerId],
      );
    }
    startLoanTransition(async () => {
      const result = await markLoan(auth, gameId, {
        player_id: playerId,
        loaned: nextLoaned,
        quarter: 1,
        elapsed_ms: 0,
      });
      if (!result.success) {
        setLoanedIds((prev) => {
          const next = new Set(prev);
          if (nextLoaned) next.delete(playerId);
          else next.add(playerId);
          return next;
        });
        setLoanError(result.error ?? "Couldn't update loan.");
      }
    });
  }

  // ── Reset selection when player set churns ──────────────────
  // Lending a player or swapping them off can leave a stale
  // actionPlayerId pointing at someone no longer relevant.
  useEffect(() => {
    if (actionPlayerId && loanedIds.has(actionPlayerId)) {
      setActionPlayerId(null);
      setAwaitingSwapPick(false);
    }
  }, [loanedIds, actionPlayerId]);

  const lineup: LeagueLineup = useMemo(
    () => ({ forwards: forwardIds, backs: backIds, bench: benchIds }),
    [forwardIds, backIds, benchIds],
  );

  // ── Save plan / start game ──────────────────────────────────
  async function handleSavePlan() {
    setSavePending(true);
    setError(null);
    const result = await saveLeagueLineupDraft(auth, gameId, lineup);
    setSavePending(false);
    if (!result.success) {
      setError(result.error ?? "Couldn't save your plan.");
      return;
    }
    setSavedAt(new Date().toISOString());
    if (auth.kind === "team") {
      router.push(`/teams/${auth.teamId}/games/${gameId}`);
    }
  }

  function handleStartGame() {
    if (fieldIds.length === 0) {
      setError("Pick at least one player for the field.");
      return;
    }
    if (vestRequiredFr && !frId) {
      setError(`Pick a First Receiver — required at ${ageGroup.label}.`);
      return;
    }
    if (vestRequiredDh && !dhId) {
      setError(`Pick a Dummy Half — required at ${ageGroup.label}.`);
      return;
    }
    if (fieldIds.length < minOnFieldSize) {
      const proceed = window.confirm(
        `Only ${fieldIds.length} players on the field — recommended minimum for ${ageGroup.label} is ${minOnFieldSize}. Proceed anyway?`,
      );
      if (!proceed) return;
    }
    setError(null);
    startTransition(async () => {
      const result = await startLeagueGame(
        auth,
        gameId,
        lineup,
        fieldIds.length,
        true,
        { fr: frByPeriod, dh: dhByPeriod },
        subIntervalSeconds,
      );
      if (!result.success) {
        setError(result.error ?? "Couldn't start the game.");
      }
    });
  }

  // ── Vest rotation plan edits ────────────────────────────────
  /**
   * Override one period's FR or DH assignment. Enforces the same
   * "one vest worn once per game" rule in-memory by clearing any
   * other period that has this player wearing the same vest (a
   * player can't be assigned twice). Mutual exclusion within a
   * period (FR != DH) is also enforced.
   */
  function setVestPlanEntry(
    vest: "fr" | "dh",
    period: number,
    playerId: string | null,
  ) {
    // Combined any-vest exclusion: setting playerId for one period
    // clears them from ANY vest in any OTHER period (so a player
    // wearing FR in H1 can't also be DH in H2 — once they've worn
    // any vest, they're locked out of any vest for the rest of the
    // game). Mutual exclusion within the same period (FR != DH)
    // still applies.
    setFrByPeriod((prev) => {
      const next = prev.slice();
      if (vest === "fr") next[period] = playerId;
      // Clear THIS player from every OTHER period of FR.
      if (playerId) {
        for (let i = 0; i < next.length; i++) {
          if (vest === "fr" && i === period) continue;
          if (next[i] === playerId) next[i] = null;
        }
      }
      return next;
    });
    setDhByPeriod((prev) => {
      const next = prev.slice();
      if (vest === "dh") next[period] = playerId;
      // Clear THIS player from every OTHER period of DH (covers
      // the "FR in H1 → blocked from DH in H2" case).
      if (playerId) {
        for (let i = 0; i < next.length; i++) {
          if (vest === "dh" && i === period) continue;
          if (next[i] === playerId) next[i] = null;
        }
      }
      return next;
    });
  }

  // ── Ordered field rows: Forwards (FR-first) then Backs (DH-first) ──
  // The two zones render as separate sections under one "Starting
  // field" header so the coach can see the F/B split at a glance.
  // Vest wearers float to the top of each zone — FR usually sits in
  // forwards (front-rower), DH in forwards (hooker / dummy-half), but
  // the coach can override the zone independently, so we just lift
  // whichever vest sits in whichever zone.
  const orderedForwardIds = useMemo(() => {
    const rest = forwardIds.filter((id) => id !== frId && id !== dhId);
    const head: string[] = [];
    if (frId && forwardIds.includes(frId)) head.push(frId);
    if (dhId && forwardIds.includes(dhId)) head.push(dhId);
    return [...head, ...rest];
  }, [forwardIds, frId, dhId]);
  const orderedBackIds = useMemo(() => {
    const rest = backIds.filter((id) => id !== frId && id !== dhId);
    const head: string[] = [];
    if (frId && backIds.includes(frId)) head.push(frId);
    if (dhId && backIds.includes(dhId)) head.push(dhId);
    return [...head, ...rest];
  }, [backIds, frId, dhId]);

  // ── Inline action sheet renderer ────────────────────────────
  // Rendered directly under the tapped row (field or bench) so the
  // controls feel attached to the player rather than floating at the
  // bottom of the screen. Hidden entirely when in swap-pick mode —
  // the row already shows the "Swapping…" label, and the next tap
  // lands on the partner row.
  function renderInlineActionSheet(playerId: string, onField: boolean) {
    if (actionPlayerId !== playerId) return null;
    const isFr = frId === playerId;
    const isDh = dhId === playerId;
    return (
      <div className="border-t border-hairline bg-surface-alt/60 px-4 py-3">
        {awaitingSwapPick ? (
          <div className="flex items-center justify-between gap-2 text-xs text-ink-mute">
            <span>
              Tap another player to swap.{" "}
              <span className="text-ink-dim">
                On-field ↔ on-field swaps vests; field ↔ bench swaps positions.
              </span>
            </span>
            <button
              type="button"
              onClick={handleCancelAction}
              className="font-medium text-ink-dim underline-offset-2 hover:text-ink hover:underline"
              disabled={isPending}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {vestRequiredFr && onField && (
              <SFButton
                size="sm"
                variant={isFr ? "primary" : "subtle"}
                onClick={handleMakeFr}
                disabled={isPending}
                full
              >
                {isFr ? "Remove FR" : "Make FR"}
              </SFButton>
            )}
            {vestRequiredDh && onField && (
              <SFButton
                size="sm"
                variant={isDh ? "primary" : "subtle"}
                onClick={handleMakeDh}
                disabled={isPending}
                full
              >
                {isDh ? "Remove DH" : "Make DH"}
              </SFButton>
            )}
            {/* Forward / Back toggle — only shown when player is on
                field AND not already in that zone. Coach can override
                the chip-default position for this game only. */}
            {onField && zoneOf(playerId) !== "forward" && (
              <SFButton
                size="sm"
                variant="subtle"
                onClick={handleMakeForward}
                disabled={isPending}
                full
              >
                Make Forward
              </SFButton>
            )}
            {onField && zoneOf(playerId) !== "back" && (
              <SFButton
                size="sm"
                variant="subtle"
                onClick={handleMakeBack}
                disabled={isPending}
                full
              >
                Make Back
              </SFButton>
            )}
            <SFButton
              size="sm"
              variant="subtle"
              onClick={handleEnterSwap}
              disabled={isPending}
              full
            >
              Swap
            </SFButton>
            <SFButton
              size="sm"
              variant="ghost"
              onClick={handleBench}
              disabled={isPending}
              full
            >
              {onField ? "Bench" : "Add to field"}
            </SFButton>
          </div>
        )}
      </div>
    );
  }

  const confirmDisabled
    = fieldIds.length === 0
    || (vestRequiredFr && !frId)
    || (vestRequiredDh && !dhId)
    || isPending;

  // ── Game-Settings summary line (closed-state) ───────────────
  const settingsSummary = (() => {
    const bits: string[] = [];
    bits.push(
      lineupMode === "suggested" ? "Auto-suggested" : "Manual lineup",
    );
    if (onFieldSize !== defaultOnFieldSize) bits.push(`${onFieldSize} on field`);
    bits.push(
      lentPlayers.length > 0 ? `${lentPlayers.length} lent` : "No lent",
    );
    return bits.join(" · ");
  })();

  return (
    <div className="space-y-4 pb-32">
      <LineupPickerBreadcrumb backHref={backHref ?? undefined} />

      <header className="space-y-1 px-1">
        <h1 className="text-xl font-bold text-ink">
          {ageGroup.label} starting lineup
        </h1>
        <p className="text-xs text-ink-mute">
          {onFieldSize} on the field. Tap a player for actions: make FR,
          make DH, swap, or bench.
        </p>
      </header>

      {error && <InlineAlert kind="danger">{error}</InlineAlert>}

      {/* ── Game settings (collapsible) ──────────────────────── */}
      <div className="rounded-md border border-hairline bg-surface shadow-card">
        <button
          type="button"
          onClick={() => setGameSettingsOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-alt"
          aria-expanded={gameSettingsOpen}
          aria-controls="lineup-game-settings"
        >
          <span className="flex flex-1 items-center gap-3 text-sm">
            <span className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
              Game settings
            </span>
            <span className="text-xs text-ink-mute">{settingsSummary}</span>
          </span>
          <span aria-hidden className="text-ink-mute">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              className={`transition-transform duration-fast ease-out-quart ${
                gameSettingsOpen ? "rotate-180" : ""
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

        {gameSettingsOpen && (
          <div
            id="lineup-game-settings"
            className="space-y-4 border-t border-hairline px-4 py-4"
          >
            {/* Rotation mode */}
            <div>
              <p className="text-xs font-semibold text-ink">Rotation</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <SFButton
                  variant={lineupMode === "suggested" ? "primary" : "subtle"}
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleModeChange("suggested")}
                >
                  {lineupMode === "suggested" ? "✓ Suggested" : "Suggested"}
                </SFButton>
                <SFButton
                  variant={lineupMode === "manual" ? "primary" : "subtle"}
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleModeChange("manual")}
                >
                  {lineupMode === "manual" ? "✓ Set manually" : "Set manually"}
                </SFButton>
              </div>
              <p className="mt-1.5 text-xs text-ink-mute">
                {lineupMode === "suggested"
                  ? "Auto-rotates — players with less season time get the start, FR and DH biased to least-worn."
                  : "Blank field at kickoff. Build the lineup manually from the bench."}
              </p>
            </div>

            {/* Players on field */}
            <div>
              <Label
                htmlFor="rl-on-field-size"
                className="!mb-1 block text-xs font-semibold text-ink"
              >
                Players on field
              </Label>
              <select
                id="rl-on-field-size"
                value={onFieldSize}
                disabled={isPending}
                onChange={(e) =>
                  handleSizeChange(parseInt(e.target.value, 10))
                }
                className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm font-medium text-ink shadow-card focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:bg-surface-alt disabled:text-ink-mute"
              >
                {sizeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-ink-mute">
                Drop the count if you&apos;re short a player or two — the
                game can run below the recommended minimum at local-league
                discretion.
              </p>
            </div>

            {/* Lend a player */}
            <div>
              <p className="text-xs font-semibold text-ink">Lend a player</p>
              <p className="mt-0.5 text-xs text-ink-mute">
                Lent players sit out for the rest of the game until you
                bring them back.
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
                      onClick={() => handleLendToggle(p.id, false)}
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
          </div>
        )}
      </div>

      {/* ── Starting field — row list ─────────────────────────── */}
      {/* Lineup auto-rearrangement notice (e.g. bench player
          promoted after a lend). Cleared on the next user action.
          Uses warn-soft to draw the eye without reading as an error
          — the picker did something on the coach's behalf and they
          should know what changed. */}
      {lineupNotice && (
        <div
          role="status"
          className="rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-xs text-warn"
        >
          {lineupNotice}
        </div>
      )}

      <SFCard pad={0} className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
          <span
            aria-hidden="true"
            className="block h-5 w-1 rounded-sm bg-brand-600"
          />
          <div className="min-w-0 flex-1">
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink">
              Starting field
            </h3>
          </div>
          {/* Prominent count pill — colour-coded by status. With 11
              positionless players (no zone groupings to anchor on),
              a discrete `9 / 11` label is hard to read at a glance,
              so we give the count a pill background that turns warn
              when short and brand when at target. */}
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-xs font-bold tabular-nums ${
              fieldIds.length === onFieldSize
                ? "bg-brand-600/15 text-brand-700"
                : fieldIds.length < onFieldSize
                  ? "bg-warn/15 text-warn"
                  : "bg-alarm/15 text-alarm"
            }`}
            aria-label={`${fieldIds.length} of ${onFieldSize} players on field`}
          >
            {fieldIds.length} / {onFieldSize}
          </span>
        </div>
        {/* Inline shortfall banner — same colour as the pill, says
            exactly what's missing so the coach doesn't have to do
            mental math. Mirrors the "Need 2 more" affordances AFL
            shows below short zones. */}
        {fieldIds.length < onFieldSize && (
          <div className="border-b border-hairline bg-warn-soft px-4 py-2 text-xs text-warn">
            Need{" "}
            <strong className="font-mono tabular-nums">
              {onFieldSize - fieldIds.length}
            </strong>{" "}
            more on the field — tap a bench player below to add them.
          </div>
        )}
        {fieldIds.length === 0 ? (
          <p className="px-4 py-4 text-xs text-ink-mute">
            Nobody on the field — tap a bench player below to start
            building the lineup.
          </p>
        ) : (
          (() => {
            // Render forwards then backs as two visually-distinct
            // sections within the single Starting-field card. Each
            // section has its own count chip; numbering restarts at
            // 1 inside each zone so the coach reads "Forwards 1–4"
            // and "Backs 1–5" naturally.
            const renderRow = (id: string, idx: number) => {
              const p = playerById.get(id);
              if (!p) return null;
              const isFr = frId === id;
              const isDh = dhId === id;
              const isSelected = actionPlayerId === id;
              const isAwaitingFor = awaitingSwapPick && actionPlayerId === id;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => handleRowTap(id, true)}
                    disabled={isPending}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors duration-fast ease-out-quart ${
                      isSelected
                        ? "bg-brand-50 ring-2 ring-inset ring-brand-500"
                        : "hover:bg-surface-alt"
                    }`}
                  >
                    <span
                      aria-hidden
                      className="w-5 flex-shrink-0 text-center font-mono text-xs font-semibold tabular-nums text-ink-mute"
                    >
                      {idx + 1}
                    </span>
                    <Guernsey num="" size={32} />
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">
                      {p.full_name}
                    </span>
                    {isFr && (
                      <span className="rounded-sm bg-warn/15 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-micro text-warn">
                        FR
                      </span>
                    )}
                    {isDh && (
                      <span className="rounded-sm bg-brand-600/15 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-micro text-brand-700">
                        DH
                      </span>
                    )}
                    {isAwaitingFor ? (
                      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-alarm">
                        Swapping…
                      </span>
                    ) : (
                      <span className="text-ink-mute opacity-60">
                        <SFIcon.swap />
                      </span>
                    )}
                  </button>
                  {renderInlineActionSheet(id, true)}
                </li>
              );
            };
            const targetForwards
              = ageGroup.forwardCount !== undefined
                ? ageGroup.forwardCount
                : Math.floor(onFieldSize / 2);
            const targetBacks = Math.max(0, onFieldSize - targetForwards);
            const fwdLabel = (chipLabels?.a ?? null) || "Forwards";
            const backLabel = (chipLabels?.b ?? null) || "Backs";
            return (
              <div>
                <div className="flex items-center gap-2 border-b border-hairline bg-surface-alt/60 px-4 py-1.5">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-micro text-ink-mute">
                    {fwdLabel}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums ${
                      orderedForwardIds.length === targetForwards
                        ? "bg-brand-600/15 text-brand-700"
                        : orderedForwardIds.length < targetForwards
                          ? "bg-warn/15 text-warn"
                          : "bg-alarm/15 text-alarm"
                    }`}
                  >
                    {orderedForwardIds.length} / {targetForwards}
                  </span>
                </div>
                {orderedForwardIds.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-ink-mute">
                    No forwards yet — tap a bench player and pick
                    &quot;Make Forward&quot; (or swap one in).
                  </p>
                ) : (
                  <ul className="divide-y divide-hairline">
                    {orderedForwardIds.map((id, idx) => renderRow(id, idx))}
                  </ul>
                )}
                <div className="flex items-center gap-2 border-t border-b border-hairline bg-surface-alt/60 px-4 py-1.5">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-micro text-ink-mute">
                    {backLabel}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums ${
                      orderedBackIds.length === targetBacks
                        ? "bg-brand-600/15 text-brand-700"
                        : orderedBackIds.length < targetBacks
                          ? "bg-warn/15 text-warn"
                          : "bg-alarm/15 text-alarm"
                    }`}
                  >
                    {orderedBackIds.length} / {targetBacks}
                  </span>
                </div>
                {orderedBackIds.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-ink-mute">
                    No backs yet — tap a bench player and pick
                    &quot;Make Back&quot;.
                  </p>
                ) : (
                  <ul className="divide-y divide-hairline">
                    {orderedBackIds.map((id, idx) => renderRow(id, idx))}
                  </ul>
                )}
              </div>
            );
          })()
        )}
      </SFCard>

      {/* ── Bench — row list ──────────────────────────────────── */}
      <SFCard pad={0} className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
          <span
            aria-hidden="true"
            className="block h-5 w-1 rounded-sm bg-ink-mute"
          />
          <div className="min-w-0 flex-1">
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink">
              Bench
            </h3>
          </div>
          <span className="inline-flex items-center rounded-full bg-surface-alt px-2.5 py-0.5 font-mono text-xs font-bold tabular-nums text-ink-dim">
            {benchIds.length}
          </span>
        </div>
        {benchIds.length === 0 ? (
          <p className="px-4 py-4 text-xs text-ink-mute">
            Everyone&apos;s on the field.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {benchIds.map((id, idx) => {
              const p = playerById.get(id);
              if (!p) return null;
              const isSelected = actionPlayerId === id;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => handleRowTap(id, false)}
                    disabled={isPending}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors duration-fast ease-out-quart ${
                      isSelected
                        ? "bg-brand-50 ring-2 ring-inset ring-brand-500"
                        : "hover:bg-surface-alt"
                    }`}
                  >
                    <span
                      aria-hidden
                      className="w-5 flex-shrink-0 text-center font-mono text-xs font-semibold tabular-nums text-ink-mute"
                    >
                      {idx + 1}
                    </span>
                    <Guernsey num="" size={32} color="#7E867E" />
                    <span className="min-w-0 flex-1 truncate font-medium text-ink-dim">
                      {p.full_name}
                    </span>
                    <span className="text-ink-mute opacity-60">
                      <SFIcon.swap />
                    </span>
                  </button>
                  {renderInlineActionSheet(id, false)}
                </li>
              );
            })}
          </ul>
        )}
      </SFCard>

      {/* ── Vest rotation plan ───────────────────────────────── */}
      {/* Pre-game plan for FR / DH across every period. Auto-
          suggested from season fairness, biased to least-worn-this-
          season, with the "one vest worn once per game" rule
          enforced automatically (the suggester walks period-by-
          period excluding earlier assignments). Each row is
          tappable to override; the half-time card still lets the
          coach replace on the day. */}
      {vestsRequired && (
        <SFCard pad={0} className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
            <span
              aria-hidden="true"
              className="block h-5 w-1 rounded-sm bg-warn"
            />
            <div className="min-w-0 flex-1">
              <h3 className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink">
                Vest rotation plan
              </h3>
              <p className="text-[11px] text-ink-mute">
                Auto-picked from fairness — tap a name to swap. No
                player wears the same vest twice.
              </p>
            </div>
          </div>
          <ul className="divide-y divide-hairline">
            {Array.from({ length: ageGroup.periodCount }).map((_, periodIdx) => {
              const periodLabel = ageGroup.periodLabel ?? "period";
              const periodLabelCap
                = periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1);
              const frPickId = frByPeriod[periodIdx] ?? null;
              const dhPickId = dhByPeriod[periodIdx] ?? null;
              return (
                <li key={periodIdx} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-12 flex-shrink-0 font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
                      {periodLabelCap} {periodIdx + 1}
                    </span>
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                      {vestRequiredFr && (
                        <VestPlanPill
                          vest="fr"
                          label="FR"
                          playerName={
                            frPickId
                              ? playerById.get(frPickId)?.full_name ?? "?"
                              : null
                          }
                          isEditing={
                            vestPlanEdit?.vest === "fr"
                            && vestPlanEdit?.period === periodIdx
                          }
                          onToggle={() =>
                            setVestPlanEdit((prev) =>
                              prev?.vest === "fr" && prev?.period === periodIdx
                                ? null
                                : { vest: "fr", period: periodIdx },
                            )
                          }
                        />
                      )}
                      {vestRequiredDh && (
                        <VestPlanPill
                          vest="dh"
                          label="DH"
                          playerName={
                            dhPickId
                              ? playerById.get(dhPickId)?.full_name ?? "?"
                              : null
                          }
                          isEditing={
                            vestPlanEdit?.vest === "dh"
                            && vestPlanEdit?.period === periodIdx
                          }
                          onToggle={() =>
                            setVestPlanEdit((prev) =>
                              prev?.vest === "dh" && prev?.period === periodIdx
                                ? null
                                : { vest: "dh", period: periodIdx },
                            )
                          }
                        />
                      )}
                    </div>
                  </div>
                  {vestPlanEdit?.period === periodIdx && (
                    <VestPlanCandidatePicker
                      vest={vestPlanEdit.vest}
                      currentPickId={
                        vestPlanEdit.vest === "fr" ? frPickId : dhPickId
                      }
                      fieldIds={fieldIds}
                      playerById={playerById}
                      seasonVestCounts={seasonVestCounts}
                      excludeIds={
                        // Exclude players already wearing ANY vest
                        // in another period (combined fr+dh — once
                        // a player has worn one vest they're out of
                        // both vests for the rest of the game),
                        // plus the OTHER vest's wearer for this
                        // same period so FR != DH simultaneously.
                        new Set([
                          ...frByPeriod
                            .map((id, i) =>
                              i !== periodIdx && id ? id : null,
                            )
                            .filter((id): id is string => Boolean(id)),
                          ...dhByPeriod
                            .map((id, i) =>
                              i !== periodIdx && id ? id : null,
                            )
                            .filter((id): id is string => Boolean(id)),
                          ...(vestPlanEdit.vest === "fr" && dhByPeriod[periodIdx]
                            ? [dhByPeriod[periodIdx] as string]
                            : []),
                          ...(vestPlanEdit.vest === "dh" && frByPeriod[periodIdx]
                            ? [frByPeriod[periodIdx] as string]
                            : []),
                        ])
                      }
                      onPick={(playerId) => {
                        setVestPlanEntry(
                          vestPlanEdit.vest,
                          periodIdx,
                          playerId,
                        );
                        setVestPlanEdit(null);
                      }}
                      onClear={() => {
                        setVestPlanEntry(vestPlanEdit.vest, periodIdx, null);
                        setVestPlanEdit(null);
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </SFCard>
      )}

      {/* ── Sub interval ─────────────────────────────────────── */}
      <SFCard>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Label htmlFor="rl-sub-minutes" className="mb-1">
              Sub interval
            </Label>
            <p className="text-xs text-ink-mute">
              Suggested {suggestedSubMin} min — {benchIds.length} on bench,{" "}
              {players.length} total, ≈{restsPerPlayer(benchIds.length)} rest
              {restsPerPlayer(benchIds.length) === 1 ? "" : "s"} each over{" "}
              {gameMinutes} min.
              {unbrokenLockedMinutes > 0 && (
                <>
                  {" "}Adjusted for Junior Law §6: each player needs{" "}
                  {ageGroup.minUnbrokenPeriods === 1
                    ? "one unbroken half"
                    : `${ageGroup.minUnbrokenPeriods} unbroken quarters`}{" "}
                  ({unbrokenLockedMinutes} min locked per player), so
                  rotations only happen across the remaining{" "}
                  {Math.max(0, gameMinutes - unbrokenLockedMinutes)} min.
                </>
              )}
            </p>
          </div>
          <div className="w-full sm:w-24">
            <Input
              id="rl-sub-minutes"
              type="number"
              min={1}
              max={10}
              step={0.5}
              value={subMinInput}
              onChange={(e) => setSubMinInput(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>
      </SFCard>

      <LineupPickerFooter
        onFieldCount={fieldIds.length}
        benchCount={benchIds.length}
        onFieldLabel="on field"
        onSavePlan={auth.kind === "team" ? handleSavePlan : undefined}
        savePending={savePending}
        savedAt={savedAt}
        savePlanDisabled={fieldIds.length === 0 || isPending}
        onConfirm={handleStartGame}
        confirmLabel={
          ageGroup.periodCount === 2 ? "Ready for kickoff" : "Ready for Q1"
        }
        confirmDisabled={confirmDisabled}
        confirmLoading={isPending}
      />

      {/* Lend-player picker modal */}
      {lendPickerOpen && (
        <LendPickerSheet
          candidates={players.filter((p) => !loanedIds.has(p.id))}
          onCancel={() => setLendPickerOpen(false)}
          onPick={(pid) => {
            setLendPickerOpen(false);
            handleLendToggle(pid, true);
          }}
          pending={loanPending}
        />
      )}
    </div>
  );
}

// ─── Lend-picker sheet ───────────────────────────────────────
// Lightweight modal listing every squad player who isn't already
// lent. AFL uses the shared `SlotFillSheet`; for RL we keep it
// inline to avoid a heavy import — the surface is small enough.
interface LendPickerSheetProps {
  candidates: Player[];
  onPick: (playerId: string) => void;
  onCancel: () => void;
  pending: boolean;
}
function LendPickerSheet({
  candidates,
  onPick,
  onCancel,
  pending,
}: LendPickerSheetProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-label="Lend a player"
        className="w-full max-w-md rounded-t-2xl bg-surface p-4 shadow-modal sm:rounded-2xl"
      >
        <header className="mb-2 flex items-start justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-dim">
              Lend a player
            </h2>
            <p className="text-xs text-ink-mute">
              Pick a player to lend to the opposition for the rest of the
              game.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-2 py-1 text-sm text-ink-mute hover:bg-surface-alt"
          >
            Cancel
          </button>
        </header>
        {candidates.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-ink-mute">
            Everyone is already lent.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {candidates.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onPick(p.id)}
                  disabled={pending}
                  className="flex w-full items-center gap-3 px-2 py-2.5 text-left text-sm transition-colors hover:bg-surface-alt disabled:opacity-60"
                >
                  <Guernsey num="" size={28} />
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">
                    {p.full_name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// VestPlanPill + VestPlanCandidatePicker now live in
// `./VestPlanRow` so the formation picker can reuse them.
// Steve 2026-05-19.
