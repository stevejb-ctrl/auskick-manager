"use client";

// ─── LeagueLineupPicker ──────────────────────────────────────
// Pre-game lineup picker: rugby pitch (forwards / backs zones,
// FR / DH slots, fullback at the back) + bench strip + LockModal
// long-press menu. Coaches think about RL lineups in terms of
// who's standing WHERE on the pitch, so this view shows the
// actual shape rather than a row-list of names.
//
// Promoted from spike (`LeagueLineupPickerFormation`) to the
// default picker (Steve 2026-05-19). The old row-list picker
// was deleted in the same commit.
//
// Interaction model (mirrors live game):
//   * Tap a player tile  → select them (yellow ring)
//   * Tap a second tile  → completes a swap. Field↔bench moves
//                          them between buckets; field↔field
//                          swaps their zone (forward ↔ back)
//                          or position within the same zone.
//   * Tap a vacant slot  → with a bench player selected, promote
//                          them into that slot's zone.
//   * Long-press a tile  → opens the shared `LockModal` with
//                          pre-game actions: Switch (enter swap
//                          mode), Make/Remove FR, Make/Remove DH,
//                          Bench, Lend.
//
// Vest rotation across later periods: rendered in the Vest
// rotation plan card under the bench. Auto-picked from season
// fairness; every period editable (period 1 stays in sync with
// the on-field long-press / action sheet flow).
//
// Lend a player: managed from the squad page. The game-settings
// collapse shows lent players (read-only chips) and a link to
// the squad page.

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LineupPickerBreadcrumb } from "@/components/lineup/LineupPickerBreadcrumb";
import { LineupPickerFooter } from "@/components/lineup/LineupPickerFooter";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { SFButton, SFCard } from "@/components/sf";
import { LockModal } from "@/components/live/LockModal";
import { SlotFillSheet } from "@/components/ui/SlotFillSheet";
import { VestPlanPill, VestPlanCandidatePicker } from "./VestPlanRow";
import { enqueueLiveAction } from "@/lib/live/registerLiveActions";
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
import { LeagueField } from "./LeagueField";
import { LeagueBenchStrip } from "./LeagueBenchStrip";

// Sub-minute formula from the previous picker — kept inline so the
// spike doesn't fan-out into shared modules until we know it
// sticks. RL §6 lock minutes are subtracted from rotateable time
// so the per-bench-share interval reflects what the coach can
// actually use, not the raw game length.
function suggestedSubMinutes(
  benchSize: number,
  totalPlayers: number,
  gameMinutes: number,
  unbrokenLockedMinutes: number = 0,
): number {
  if (benchSize <= 0 || totalPlayers <= 0) return 4;
  const rests = Math.max(1, Math.ceil(benchSize / 2));
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

  const reqs = ageGroup.vestRequirements;
  const vestRequiredFr = reqs?.fr === true;
  const vestRequiredDh = reqs?.dh === true;
  const vestsRequired = vestRequiredFr || vestRequiredDh;

  // ── Loaned players ──────────────────────────────────────────
  // Same shape AFL's LineupPicker uses — optimistic local toggle
  // backed by the markLoan server action through the write queue.
  // The loanedIds set drives playersForLineup (suggester sees the
  // post-lend set), the lent-chip list in Game settings, and the
  // pull-out logic when a lend toggles ON (player gets yanked
  // from forwards / backs / bench so the formation grid stays in
  // sync with the suggester's view).
  const [loanedIds, setLoanedIds] = useState<Set<string>>(
    () => new Set(initialLoanedIds),
  );
  const [lendPickerOpen, setLendPickerOpen] = useState(false);
  const [loanError, setLoanError] = useState<string | null>(null);
  const [loanPending, startLoanTransition] = useTransition();
  const lentPlayers = useMemo(
    () => players.filter((p) => loanedIds.has(p.id)),
    [players, loanedIds],
  );
  const playersForLineup = useMemo(
    () => players.filter((p) => !loanedIds.has(p.id)),
    [players, loanedIds],
  );

  // ── Game settings collapsible state ─────────────────────────
  const [gameSettingsOpen, setGameSettingsOpen] = useState(false);
  const [onFieldSize, setOnFieldSize] = useState(defaultOnFieldSize);
  const [lineupMode, setLineupMode] = useState<"suggested" | "manual">(() =>
    initialDraft ? "manual" : "suggested",
  );

  // ── Season vest counts ──────────────────────────────────────
  // Per-player tallies of how many times each player has worn FR
  // and DH across the season so far. Surfaces under each candidate
  // in the rotation plan's picker so the coach can balance vest
  // exposure without having to memorise prior weeks.
  const seasonVestCounts = useMemo(
    () => seasonVestCountsByPlayer(seasonEvents),
    [seasonEvents],
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

  const [forwardIds, setForwardIds] = useState<string[]>(
    () => initialDraft?.lineup.forwards ?? initialSuggestion.lineup.forwards,
  );
  const [backIds, setBackIds] = useState<string[]>(
    () => initialDraft?.lineup.backs ?? initialSuggestion.lineup.backs,
  );
  const [benchIds, setBenchIds] = useState<string[]>(
    () => initialDraft?.lineup.bench ?? initialSuggestion.lineup.bench,
  );

  // Period-1 vest holders — wired to the long-press on-field flow.
  const [frId, setFrId] = useState<string | null>(
    () => initialSuggestion.suggestedFr,
  );
  const [dhId, setDhId] = useState<string | null>(
    () => initialSuggestion.suggestedDh,
  );

  // ── Period 2+ vest rotation overrides ───────────────────────
  // The full rotation plan is derived at render time from
  // `suggestVestRotation`, with per-period coach overrides layered
  // on top. Period 1 is sourced from `frId`/`dhId` (controlled by
  // the long-press flow on the on-field tile) so the rotation plan
  // card stays in sync with the formation pitch.
  //
  // `frOverrides[period]` and `dhOverrides[period]` are 1-indexed
  // keys (so the API matches "Half 2" / "Quarter 3" reading). A
  // value of `null` means "no wearer" (coach explicitly cleared);
  // a missing key means "use the suggester".
  const [frOverrides, setFrOverrides] = useState<
    Record<number, string | null>
  >({});
  const [dhOverrides, setDhOverrides] = useState<
    Record<number, string | null>
  >({});
  /** Open inline picker for the rotation plan — `{ vest, period }` or null. */
  const [vestPlanEdit, setVestPlanEdit] = useState<{
    vest: "fr" | "dh";
    period: number;
  } | null>(null);

  // ── Sub interval ────────────────────────────────────────────
  const gameMinutes
    = (ageGroup.periodSeconds * ageGroup.periodCount) / 60;
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

  // ── Derived lookups ─────────────────────────────────────────
  const fieldIds = useMemo(
    () => [...forwardIds, ...backIds],
    [forwardIds, backIds],
  );
  const fieldPlayers = useMemo(
    () =>
      fieldIds
        .map((id) => playerById.get(id))
        .filter((p): p is Player => Boolean(p)),
    [fieldIds, playerById],
  );
  const forwardPlayers = useMemo(
    () =>
      forwardIds
        .map((id) => playerById.get(id))
        .filter((p): p is Player => Boolean(p)),
    [forwardIds, playerById],
  );
  const backPlayers = useMemo(
    () =>
      backIds
        .map((id) => playerById.get(id))
        .filter((p): p is Player => Boolean(p)),
    [backIds, playerById],
  );
  const benchPlayers = useMemo(
    () =>
      benchIds
        .map((id) => playerById.get(id))
        .filter((p): p is Player => Boolean(p)),
    [benchIds, playerById],
  );
  const zoneOf = (id: string): LeagueZone | null => {
    if (forwardIds.includes(id)) return "forward";
    if (backIds.includes(id)) return "back";
    return null;
  };

  // Pre-game vest preview (no events yet — just the period-1
  // picks) so LeagueField can render the FR/DH badges.
  const vestByPlayer = useMemo<Record<string, "fr" | "dh">>(() => {
    const map: Record<string, "fr" | "dh"> = {};
    if (frId) map[frId] = "fr";
    if (dhId) map[dhId] = "dh";
    return map;
  }, [frId, dhId]);

  // ── Sizes dropdown ──────────────────────────────────────────
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

  // ── Selection / action-sheet state ──────────────────────────
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(
    null,
  );
  const [actionSheetPlayerId, setActionSheetPlayerId] = useState<string | null>(
    null,
  );

  // Clear selection if the selected player gets benched / loaned
  // away by an upstream change.
  useEffect(() => {
    if (selectedPlayerId && loanedIds.has(selectedPlayerId)) {
      setSelectedPlayerId(null);
    }
  }, [loanedIds, selectedPlayerId]);

  // ── Move primitives ─────────────────────────────────────────
  function moveToBench(playerId: string) {
    setForwardIds((prev) => prev.filter((id) => id !== playerId));
    setBackIds((prev) => prev.filter((id) => id !== playerId));
    setBenchIds((prev) =>
      prev.includes(playerId) ? prev : [...prev, playerId],
    );
    if (frId === playerId) setFrId(null);
    if (dhId === playerId) setDhId(null);
  }
  function moveToField(playerId: string, preferred?: LeagueZone) {
    const player = playerById.get(playerId);
    const target: LeagueZone
      = preferred ?? chipZone(player?.chip) ?? "forward";
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
  function moveToZone(playerId: string, toZone: LeagueZone) {
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

  // ── Lend handler ────────────────────────────────────────────
  // Mirrors AFL `LineupPicker.handleLendToggle`. Optimistic flip
  // of the loanedIds set + a markLoan write to the queue. When a
  // lend toggles ON we yank the player from forwards / backs /
  // bench (the suggester sees them filtered out via
  // playersForLineup). When a lend toggles OFF the player lands
  // back on the bench so the coach can place them. Errors roll
  // back the optimistic state.
  function handleLendToggle(playerId: string, nextLoaned: boolean) {
    setLoanError(null);
    setLoanedIds((prev) => {
      const next = new Set(prev);
      if (nextLoaned) next.add(playerId);
      else next.delete(playerId);
      return next;
    });
    if (nextLoaned) {
      setForwardIds((prev) => prev.filter((id) => id !== playerId));
      setBackIds((prev) => prev.filter((id) => id !== playerId));
      setBenchIds((prev) => prev.filter((id) => id !== playerId));
      if (frId === playerId) setFrId(null);
      if (dhId === playerId) setDhId(null);
      // Also scrub from the vest rotation overrides — a lent
      // player can't wear FR or DH in any period.
      setFrOverrides((prev) => {
        const next: typeof prev = {};
        for (const k of Object.keys(prev)) {
          next[Number(k)] = prev[Number(k)] === playerId ? null : prev[Number(k)];
        }
        return next;
      });
      setDhOverrides((prev) => {
        const next: typeof prev = {};
        for (const k of Object.keys(prev)) {
          next[Number(k)] = prev[Number(k)] === playerId ? null : prev[Number(k)];
        }
        return next;
      });
    } else {
      // Bring back — park them on the bench so the coach can
      // slot them in. Suggester will pick them up next mode-switch.
      setBenchIds((prev) =>
        prev.includes(playerId) ? prev : [...prev, playerId],
      );
    }
    startLoanTransition(() => {
      // markLoan is registered with the write queue (kind:
      // "markLoan") so we go through the queue for idempotency +
      // offline replay, same shape as AFL's call site. elapsed_ms
      // is 0 because the lend predates kickoff.
      const { flushed } = enqueueLiveAction("markLoan", [
        auth,
        gameId,
        {
          player_id: playerId,
          loaned: nextLoaned,
          quarter: 1,
          elapsed_ms: 0,
        },
      ]);
      flushed.catch(() => {
        // Permanent failure — roll back the optimistic flip.
        setLoanedIds((prev) => {
          const next = new Set(prev);
          if (nextLoaned) next.delete(playerId);
          else next.add(playerId);
          return next;
        });
        setLoanError("Couldn't update loan — try again.");
      });
    });
  }

  // ── Tap / swap state machine ────────────────────────────────
  // Mirrors the live-game tap-tap-swap UX. First tap selects.
  // Second tap on a DIFFERENT player either swaps zones (both on
  // field) or swaps field/bench membership.
  function handleTileTap(playerId: string) {
    setError(null);
    setLineupMode("manual");
    if (!selectedPlayerId) {
      setSelectedPlayerId(playerId);
      return;
    }
    if (selectedPlayerId === playerId) {
      // Tapping the same tile deselects.
      setSelectedPlayerId(null);
      return;
    }
    const sourceZone = zoneOf(selectedPlayerId);
    const targetZone = zoneOf(playerId);
    const sourceOnField = sourceZone !== null;
    const targetOnField = targetZone !== null;
    if (sourceOnField && targetOnField) {
      // Both on field → exchange zone membership (preserves the
      // ratio if they were in different zones, or just reorders
      // within the same zone).
      const sZone = sourceZone!;
      const tZone = targetZone!;
      if (sZone === tZone) {
        const arr = sZone === "forward" ? forwardIds.slice() : backIds.slice();
        const i = arr.indexOf(selectedPlayerId);
        const j = arr.indexOf(playerId);
        if (i >= 0 && j >= 0) {
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        if (sZone === "forward") setForwardIds(arr);
        else setBackIds(arr);
      } else {
        // Cross-zone — swap their bucket membership.
        const swap = (arr: string[]) =>
          arr.map((id) =>
            id === selectedPlayerId
              ? playerId
              : id === playerId
                ? selectedPlayerId
                : id,
          );
        setForwardIds((prev) => swap(prev));
        setBackIds((prev) => swap(prev));
      }
    } else if (sourceOnField && !targetOnField) {
      // Field → bench swap. Bench player joins source's zone.
      moveToBench(selectedPlayerId);
      moveToField(playerId, sourceZone!);
    } else if (!sourceOnField && targetOnField) {
      // Bench → field swap. Source joins target's zone.
      moveToBench(playerId);
      moveToField(selectedPlayerId, targetZone!);
    }
    // Both on bench: no-op.
    setSelectedPlayerId(null);
  }

  function handleTileLongPress(playerId: string) {
    setActionSheetPlayerId(playerId);
    setSelectedPlayerId(null);
  }

  function handleVacantSpotTap() {
    if (!selectedPlayerId) return;
    if (!benchIds.includes(selectedPlayerId)) return;
    if (fieldIds.length >= onFieldSize) {
      setError(
        `Already at ${onFieldSize} on field — bench someone first.`,
      );
      return;
    }
    moveToField(selectedPlayerId);
    setSelectedPlayerId(null);
  }

  // ── Action sheet handlers ───────────────────────────────────
  function handleMakeFr() {
    if (!actionSheetPlayerId) return;
    setLineupMode("manual");
    if (frId === actionSheetPlayerId) {
      setFrId(null);
    } else {
      setFrId(actionSheetPlayerId);
      if (dhId === actionSheetPlayerId) setDhId(null);
    }
    setActionSheetPlayerId(null);
  }
  function handleMakeDh() {
    if (!actionSheetPlayerId) return;
    setLineupMode("manual");
    if (dhId === actionSheetPlayerId) {
      setDhId(null);
    } else {
      setDhId(actionSheetPlayerId);
      if (frId === actionSheetPlayerId) setFrId(null);
    }
    setActionSheetPlayerId(null);
  }
  function handleActionMovePosition() {
    if (!actionSheetPlayerId) return;
    const z = zoneOf(actionSheetPlayerId);
    if (z === null) return;
    setLineupMode("manual");
    moveToZone(actionSheetPlayerId, z === "forward" ? "back" : "forward");
    setActionSheetPlayerId(null);
  }
  function handleActionToggleBench() {
    if (!actionSheetPlayerId) return;
    setLineupMode("manual");
    if (zoneOf(actionSheetPlayerId) !== null) {
      moveToBench(actionSheetPlayerId);
    } else {
      if (fieldIds.length >= onFieldSize) {
        setError(
          `Already at ${onFieldSize} on field — bench someone first.`,
        );
        setActionSheetPlayerId(null);
        return;
      }
      moveToField(actionSheetPlayerId);
    }
    setActionSheetPlayerId(null);
  }
  function handleActionSwitch() {
    if (!actionSheetPlayerId) return;
    setSelectedPlayerId(actionSheetPlayerId);
    setActionSheetPlayerId(null);
  }

  // ── Mode + size handlers ────────────────────────────────────
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
      setFrId(r.suggestedFr);
      setDhId(r.suggestedDh);
    } else {
      // Manual: everyone on bench so the coach builds from scratch.
      setForwardIds([]);
      setBackIds([]);
      setBenchIds(playersForLineup.map((p) => p.id));
      setFrId(null);
      setDhId(null);
    }
    setSelectedPlayerId(null);
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
      setFrId(r.suggestedFr);
      setDhId(r.suggestedDh);
    }
  }

  // ── Save / start ────────────────────────────────────────────
  const lineup: LeagueLineup = useMemo(
    () => ({ forwards: forwardIds, backs: backIds, bench: benchIds }),
    [forwardIds, backIds, benchIds],
  );

  // Build the full per-period vest plan. Period 1 reads from the
  // coach's manual `frId`/`dhId` picks; period 2+ defaults to the
  // chip-aware suggester so the rotation is laws-§12-legal across
  // the whole game, with `frOverrides` / `dhOverrides` applied on
  // top when the coach has manually picked a different wearer for
  // a later period. Used both as a memoized derivation (for the
  // rotation plan UI) and at save time.
  const vestPlan = useMemo<{
    fr: (string | null)[];
    dh: (string | null)[];
  }>(() => {
    const rotation = suggestVestRotation({
      onFieldIds: fieldIds,
      players: playersForLineup,
      seasonEvents,
      requiredUnbrokenPeriods: ageGroup.minUnbrokenPeriods ?? 0,
      vestRequirements: reqs,
      periodCount: ageGroup.periodCount,
    });
    const fr = rotation.fr.slice();
    const dh = rotation.dh.slice();
    if (vestRequiredFr) fr[0] = frId;
    if (vestRequiredDh) dh[0] = dhId;
    // Layer coach overrides on top of the suggester.
    for (const [periodStr, val] of Object.entries(frOverrides)) {
      const i = Number(periodStr) - 1;
      if (i >= 1 && i < fr.length) fr[i] = val;
    }
    for (const [periodStr, val] of Object.entries(dhOverrides)) {
      const i = Number(periodStr) - 1;
      if (i >= 1 && i < dh.length) dh[i] = val;
    }
    // Enforce "once a player has worn any vest, they're excluded
    // from any other vest in a later period" — earlier draft used
    // per-vest sets which let the same player wear FR in H1 then
    // DH in H2. Combined `seenAny` blocks that. Period 1 picks win
    // ties (walked first); later duplicates clear.
    const seenAny = new Set<string>();
    for (let i = 0; i < Math.max(fr.length, dh.length); i++) {
      const frId_ = fr[i] ?? null;
      const dhId_ = dh[i] ?? null;
      if (frId_) {
        if (seenAny.has(frId_)) fr[i] = null;
        else seenAny.add(frId_);
      }
      if (dhId_) {
        if (seenAny.has(dhId_)) dh[i] = null;
        else seenAny.add(dhId_);
      }
    }
    return { fr, dh };
  }, [
    fieldIds,
    playersForLineup,
    seasonEvents,
    ageGroup.minUnbrokenPeriods,
    ageGroup.periodCount,
    reqs,
    vestRequiredFr,
    vestRequiredDh,
    frId,
    dhId,
    frOverrides,
    dhOverrides,
  ]);

  /**
   * Override one period's FR or DH assignment. Enforces the
   * any-vest-once rule: clears the picked player from BOTH the
   * `fr` and `dh` overrides for every OTHER period (so a player
   * wearing FR in H1 can't also be DH in H2 — they're locked out
   * of any vest in any later period). Mutual exclusion within a
   * period (FR != DH) is also enforced.
   */
  function setVestPlanEntry(
    vest: "fr" | "dh",
    period: number,
    playerId: string | null,
  ) {
    // Period 1 is bound to `frId` / `dhId` (the long-press flow on
    // the on-field tile reads / writes the same state). When the
    // coach edits period 1 via the rotation plan card, update
    // BOTH so the two affordances stay in sync.
    if (period === 1) {
      if (vest === "fr") {
        setFrId(playerId);
        // Same-period mutual exclusion: clear DH if it was the
        // same player.
        if (playerId && dhId === playerId) setDhId(null);
      } else {
        setDhId(playerId);
        if (playerId && frId === playerId) setFrId(null);
      }
      // Period 1 change can violate "any vest worn once": if the
      // new wearer was overridden into a later period, scrub them.
      if (playerId) {
        setFrOverrides((prev) => {
          const next = { ...prev };
          for (const periodStr of Object.keys(next)) {
            if (next[Number(periodStr)] === playerId) {
              next[Number(periodStr)] = null;
            }
          }
          return next;
        });
        setDhOverrides((prev) => {
          const next = { ...prev };
          for (const periodStr of Object.keys(next)) {
            if (next[Number(periodStr)] === playerId) {
              next[Number(periodStr)] = null;
            }
          }
          return next;
        });
      }
      return;
    }
    setFrOverrides((prev) => {
      const next = { ...prev };
      if (vest === "fr") next[period] = playerId;
      // Clear THIS player from every OTHER period of FR.
      if (playerId) {
        for (let i = 1; i < vestPlan.fr.length; i++) {
          if (i + 1 === period && vest === "fr") continue;
          if (vestPlan.fr[i] === playerId) next[i + 1] = null;
        }
      }
      return next;
    });
    setDhOverrides((prev) => {
      const next = { ...prev };
      if (vest === "dh") next[period] = playerId;
      // Clear THIS player from every OTHER period of DH (covers
      // the "FR in H1 → blocked from DH in H2" case).
      if (playerId) {
        for (let i = 1; i < vestPlan.dh.length; i++) {
          if (i + 1 === period && vest === "dh") continue;
          if (vestPlan.dh[i] === playerId) next[i + 1] = null;
        }
      }
      return next;
    });
  }

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
    // vestPlan is a memoized derivation — already in scope.
    startTransition(async () => {
      const result = await startLeagueGame(
        auth,
        gameId,
        lineup,
        fieldIds.length,
        true,
        vestPlan,
        subIntervalSeconds,
      );
      if (!result.success) {
        setError(result.error ?? "Couldn't start the game.");
      }
    });
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
    bits.push(`${(subIntervalSeconds / 60).toFixed(1)} min subs`);
    if (lentPlayers.length > 0) bits.push(`${lentPlayers.length} lent`);
    return bits.join(" · ");
  })();

  // ── Action sheet derived ────────────────────────────────────
  const actionPlayer = actionSheetPlayerId
    ? playerById.get(actionSheetPlayerId) ?? null
    : null;
  const actionIsOnField
    = actionSheetPlayerId !== null && zoneOf(actionSheetPlayerId) !== null;
  const actionZone = actionSheetPlayerId ? zoneOf(actionSheetPlayerId) : null;
  const fwdLabel = chipLabels?.a || "Forwards";
  const backLabel = chipLabels?.b || "Backs";

  return (
    <div className="space-y-4 pb-32">
      <LineupPickerBreadcrumb backHref={backHref ?? undefined} />

      <header className="space-y-1 px-1">
        <h1 className="text-xl font-bold text-ink">
          {ageGroup.label} starting lineup
        </h1>
        <p className="text-xs text-ink-mute">
          Tap a player to select, tap a second to swap. Long-press for
          FR / DH / position / bench.
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
            <div className="space-y-2">
              <Label className="text-xs">Rotation mode</Label>
              <div className="inline-flex rounded-md border border-hairline bg-surface">
                <button
                  type="button"
                  onClick={() => handleModeChange("suggested")}
                  className={`px-3 py-1.5 text-xs font-medium ${
                    lineupMode === "suggested"
                      ? "bg-ink text-warm"
                      : "text-ink-dim hover:bg-surface-alt"
                  } rounded-l-md`}
                >
                  Auto-suggest
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange("manual")}
                  className={`px-3 py-1.5 text-xs font-medium ${
                    lineupMode === "manual"
                      ? "bg-ink text-warm"
                      : "text-ink-dim hover:bg-surface-alt"
                  } rounded-r-md`}
                >
                  Set manually
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="on-field-size" className="text-xs">
                Players on field
              </Label>
              <select
                id="on-field-size"
                value={onFieldSize}
                onChange={(e) => handleSizeChange(parseInt(e.target.value, 10))}
                className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
              >
                {sizeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub-interval" className="text-xs">
                Sub interval (minutes)
              </Label>
              <Input
                id="sub-interval"
                type="number"
                inputMode="decimal"
                step={0.5}
                min={1}
                max={10}
                value={subMinInput}
                onChange={(e) => setSubMinInput(e.target.value)}
                className="w-32"
              />
              <p className="text-[11px] text-ink-mute">
                Suggested: {suggestedSubMin.toFixed(1)} min (accounts for
                {" "}
                {ageGroup.minUnbrokenPeriods ?? 0} unbroken{" "}
                {ageGroup.periodLabelPlural ?? "periods"} per player).
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Lend a player</Label>
              <p className="text-[11px] text-ink-mute">
                Lent players sit out for the rest of the game until
                you bring them back.
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {lentPlayers.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 rounded-full border border-warn/50 bg-warn-soft px-2.5 py-1 text-xs font-medium text-warn"
                  >
                    {p.jersey_number != null && (
                      <span className="font-semibold tabular-nums">
                        {p.jersey_number}
                      </span>
                    )}
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

      {/* ── Selection helper banner ──────────────────────────── */}
      {selectedPlayerId && (
        <div className="rounded-md border border-brand-300 bg-brand-50 px-3 py-2 text-xs text-brand-800">
          Selected{" "}
          <strong className="font-semibold">
            {playerById.get(selectedPlayerId)?.full_name ?? "player"}
          </strong>
          . Tap another tile to swap, or tap an empty slot to move them
          there.{" "}
          <button
            type="button"
            onClick={() => setSelectedPlayerId(null)}
            className="ml-1 underline-offset-2 hover:underline"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── Field (formation) + Bench ────────────────────────── */}
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
            <p className="mt-0.5 text-[11px] text-ink-mute">
              Tap two players to switch positions. Long-press a
              player for other actions.
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-xs font-bold tabular-nums ${
              fieldIds.length === onFieldSize
                ? "bg-brand-600/15 text-brand-700"
                : fieldIds.length < onFieldSize
                  ? "bg-warn/15 text-warn"
                  : "bg-alarm/15 text-alarm"
            }`}
          >
            {fieldIds.length} / {onFieldSize}
          </span>
        </div>
        <div className="p-3">
          <LeagueField
            players={fieldPlayers}
            forwardPlayers={forwardPlayers}
            backPlayers={backPlayers}
            onFieldSize={onFieldSize}
            vestByPlayer={vestByPlayer}
            selectedPlayerId={selectedPlayerId}
            onPlayerClick={handleTileTap}
            onPlayerLongPress={handleTileLongPress}
            onVacantSpotTap={
              selectedPlayerId && benchIds.includes(selectedPlayerId)
                ? handleVacantSpotTap
                : undefined
            }
            disabled={isPending}
          />
        </div>
      </SFCard>

      <LeagueBenchStrip
        players={benchPlayers}
        vestByPlayer={vestByPlayer}
        selectedPlayerId={selectedPlayerId}
        onPlayerClick={handleTileTap}
        onPlayerLongPress={handleTileLongPress}
        disabled={isPending}
      />

      {/* ── Vest rotation plan ─────────────────────────────────
          Period 1 reflects the long-press on-field picks (read-only
          here — the source of truth is the field tile). Period 2+
          is auto-picked from season fairness via
          `suggestVestRotation` and overridable per period. Hidden
          for ages with no vest requirements (U6/U7) and for any
          age with only one period (1 period = period 1 only,
          nothing to show beyond it). */}
      {vestsRequired && ageGroup.periodCount > 1 && (
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
                Auto-picked from fairness — tap any pick to swap.
                Once a player wears a vest in one half, they&rsquo;re
                excluded from the other.
              </p>
            </div>
          </div>
          <ul className="divide-y divide-hairline">
            {Array.from({ length: ageGroup.periodCount }).map((_, periodIdx) => {
              const periodNum = periodIdx + 1;
              const periodAbbrev
                = ageGroup.periodLabel === "half" ? "H" : "Q";
              const frPickId = vestPlan.fr[periodIdx] ?? null;
              const dhPickId = vestPlan.dh[periodIdx] ?? null;
              return (
                <li key={periodIdx} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-12 flex-shrink-0 font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
                      {periodAbbrev}
                      {periodNum}
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
                            && vestPlanEdit?.period === periodNum
                          }
                          onToggle={() =>
                            setVestPlanEdit((prev) =>
                              prev?.vest === "fr" && prev?.period === periodNum
                                ? null
                                : { vest: "fr", period: periodNum },
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
                            && vestPlanEdit?.period === periodNum
                          }
                          onToggle={() =>
                            setVestPlanEdit((prev) =>
                              prev?.vest === "dh" && prev?.period === periodNum
                                ? null
                                : { vest: "dh", period: periodNum },
                            )
                          }
                        />
                      )}
                    </div>
                  </div>
                  {vestPlanEdit?.period === periodNum && (
                    <VestPlanCandidatePicker
                      vest={vestPlanEdit.vest}
                      currentPickId={
                        vestPlanEdit.vest === "fr" ? frPickId : dhPickId
                      }
                      fieldIds={fieldIds}
                      playerById={playerById}
                      seasonVestCounts={seasonVestCounts}
                      // Exclude any player already assigned ANY
                      // vest in another period (combined fr+dh —
                      // wearing FR in H1 locks the player out of
                      // BOTH vests in H2), plus the OTHER vest's
                      // wearer for the SAME period so FR != DH at
                      // any one time.
                      excludeIds={
                        new Set([
                          ...vestPlan.fr
                            .map((id, i) =>
                              i !== periodIdx && id ? id : null,
                            )
                            .filter((id): id is string => Boolean(id)),
                          ...vestPlan.dh
                            .map((id, i) =>
                              i !== periodIdx && id ? id : null,
                            )
                            .filter((id): id is string => Boolean(id)),
                          ...(vestPlanEdit.vest === "fr"
                            && vestPlan.dh[periodIdx]
                            ? [vestPlan.dh[periodIdx] as string]
                            : []),
                          ...(vestPlanEdit.vest === "dh"
                            && vestPlan.fr[periodIdx]
                            ? [vestPlan.fr[periodIdx] as string]
                            : []),
                        ])
                      }
                      onPick={(playerId) => {
                        setVestPlanEntry(
                          vestPlanEdit.vest,
                          periodNum,
                          playerId,
                        );
                        setVestPlanEdit(null);
                      }}
                      onClear={() => {
                        setVestPlanEntry(vestPlanEdit.vest, periodNum, null);
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

      <LineupPickerFooter
        onFieldCount={fieldIds.length}
        benchCount={benchIds.length}
        onSavePlan={
          auth.kind === "team" ? () => void handleSavePlan() : undefined
        }
        savePending={savePending}
        savedAt={savedAt}
        savePlanDisabled={fieldIds.length === 0 || isPending}
        onConfirm={handleStartGame}
        confirmLabel={
          ageGroup.periodLabel === "half" ? "Ready for H1" : "Ready for Q1"
        }
        confirmDisabled={confirmDisabled}
        confirmLoading={isPending}
      />

      {/* ── Long-press action sheet ──────────────────────────── */}
      {actionPlayer && (
        <LockModal
          player={actionPlayer}
          currentLock={null}
          currentZone={null}
          isInjured={false}
          isLoaned={false}
          seasonLoanMins={0}
          squadLoanMins={0}
          onUnlock={() => setActionSheetPlayerId(null)}
          onToggleInjury={() => setActionSheetPlayerId(null)}
          onToggleLoan={() => setActionSheetPlayerId(null)}
          onSwitch={handleActionSwitch}
          // "Move to {Forwards/Backs}" hidden from the long-press
          // menu (Steve 2026-05-19) — coaches handle forward/back
          // re-ratios manually via tap-to-swap. Leaving the prop
          // off in the picker keeps the LockModal's button suite
          // shorter for the most common use case.
          onAssignFr={vestRequiredFr ? handleMakeFr : undefined}
          onAssignDh={vestRequiredDh ? handleMakeDh : undefined}
          isFr={frId === actionSheetPlayerId}
          isDh={dhId === actionSheetPlayerId}
          onToggleBench={handleActionToggleBench}
          isOnField={actionIsOnField}
          onClose={() => setActionSheetPlayerId(null)}
        />
      )}

      {/* Lend-player picker modal — opens from the "+ Lend a
          player" button in Game settings. Same SlotFillSheet AFL
          uses for symmetry; candidates are every squad player
          who isn't already lent. */}
      {lendPickerOpen && (
        <SlotFillSheet
          slotLabel="player"
          titleVerb="Lend"
          subtitle="Pick a player to lend to the opposition for the rest of the game. Tap their chip to bring them back."
          emptyMessage="Everyone is already lent."
          candidates={players
            .filter((p) => !loanedIds.has(p.id))
            .map((p) => ({
              id: p.id,
              name: p.full_name,
              jerseyNumber: p.jersey_number,
            }))}
          onPick={(pid) => {
            handleLendToggle(pid, true);
            setLendPickerOpen(false);
          }}
          onCancel={() => setLendPickerOpen(false)}
        />
      )}
    </div>
  );
}
