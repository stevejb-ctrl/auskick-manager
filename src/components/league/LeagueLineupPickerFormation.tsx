"use client";

// ─── LeagueLineupPickerFormation (SPIKE) ─────────────────────
// Experimental pre-game lineup picker that swaps the row-list
// rendering of `LeagueLineupPicker` for the in-game formation
// view (rugby pitch + LeagueBenchStrip). Same state and start-
// game flow; only the middle rendering + interaction model is
// new.
//
// Why: coaches think about RL lineups in terms of who's standing
// WHERE on the pitch (forwards in the pack, backs in the line,
// fullback at the back). The row-list view forces them to
// re-translate the formation into ordered names. The formation
// view shows the actual shape so coaches can recognise (or fix)
// position imbalances at a glance.
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
//                          Move to Forwards/Backs, Bench, Lend.
//
// Vest rotation across later periods: auto-suggested silently on
// save via `suggestVestRotation`. Coach can still override
// period-1 FR / DH via the action sheet — that's the only vest
// editing surfaced in the spike. Period 2+ rotation gets
// over-written when the coach edits via the in-game half-time
// vest card. This is a deliberate scope cut to keep the spike
// focused on the formation visual.
//
// Lend a player: deferred to the squad page for the spike. The
// game-settings collapse shows lent players (read-only chips)
// and a link to the squad page. Re-adding the lend picker is a
// follow-up if the spike sticks.

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LineupPickerBreadcrumb } from "@/components/lineup/LineupPickerBreadcrumb";
import { LineupPickerFooter } from "@/components/lineup/LineupPickerFooter";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { SFButton, SFCard } from "@/components/sf";
import { LockModal } from "@/components/live/LockModal";
import {
  startLeagueGame,
  saveLeagueLineupDraft,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/league-actions";
import {
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

// Mirrors the helper from LeagueLineupPicker — kept inline so the
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

interface LeagueLineupPickerFormationProps {
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

export function LeagueLineupPickerFormation({
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
}: LeagueLineupPickerFormationProps) {
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

  // ── Loaned players (read-only in the spike) ─────────────────
  const loanedIds = useMemo(
    () => new Set(initialLoanedIds),
    [initialLoanedIds],
  );
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

  // Period-1 vest holders. Period 2+ rotation gets generated on
  // save via suggestVestRotation. Coach edits at half-time via
  // the in-game vest assignment card.
  const [frId, setFrId] = useState<string | null>(
    () => initialSuggestion.suggestedFr,
  );
  const [dhId, setDhId] = useState<string | null>(
    () => initialSuggestion.suggestedDh,
  );

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

  // Build the full per-period vest plan at save time. Period 1
  // uses the coach's manual picks; period 2+ comes from the
  // chip-aware suggester so the rotation is laws-§12-legal across
  // the whole game. Coach can still edit period 2+ via the in-
  // game half-time vest card.
  function buildVestPlan(): {
    fr: (string | null)[];
    dh: (string | null)[];
  } {
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
    // Re-enforce "no player wears the same vest twice" against
    // period 1's manual override — clear any later period that
    // duplicates the coach's pick.
    for (let i = 1; i < fr.length; i++) {
      if (fr[i] && fr[i] === frId) fr[i] = null;
    }
    for (let i = 1; i < dh.length; i++) {
      if (dh[i] && dh[i] === dhId) dh[i] = null;
    }
    return { fr, dh };
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
    const vestPlan = buildVestPlan();
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
            {lentPlayers.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Lent to opposition</Label>
                <div className="flex flex-wrap gap-1.5">
                  {lentPlayers.map((p) => (
                    <span
                      key={p.id}
                      className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn"
                    >
                      {p.full_name}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-ink-mute">
                  Manage lent players from the squad page.
                </p>
              </div>
            )}
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
              {fwdLabel} top of pitch · {backLabel} bottom · long-press
              any tile for actions.
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
          moveToLabel={
            actionIsOnField
              ? actionZone === "forward"
                ? backLabel
                : fwdLabel
              : undefined
          }
          onMovePosition={
            actionIsOnField ? handleActionMovePosition : undefined
          }
          onAssignFr={vestRequiredFr ? handleMakeFr : undefined}
          onAssignDh={vestRequiredDh ? handleMakeDh : undefined}
          isFr={frId === actionSheetPlayerId}
          isDh={dhId === actionSheetPlayerId}
          onToggleBench={handleActionToggleBench}
          isOnField={actionIsOnField}
          onClose={() => setActionSheetPlayerId(null)}
        />
      )}
    </div>
  );
}
