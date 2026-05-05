"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { saveLineupDraft, startGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import { CHIP_COLORS, type ChipKey } from "@/lib/chips";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { SlotFillSheet } from "@/components/ui/SlotFillSheet";
import {
  Eyebrow,
  Guernsey,
  SFButton,
  SFCard,
  SFIcon,
} from "@/components/sf";
import type { Lineup, Player, PositionModel, Zone } from "@/lib/types";
import {
  suggestStartingLineup,
  zoneCapsFor,
  type PlayerZoneMinutes,
} from "@/lib/fairness";
import { positionsFor, ZONE_SHORT_LABELS } from "@/lib/ageGroups";

// Rotations each player gets to sit on the bench over the whole game.
// Bigger benches → more rotations per player (shorter stints each).
function restsPerPlayer(benchSize: number): number {
  return Math.max(1, Math.ceil(benchSize / 2));
}

// Target sub interval (minutes), rounded to the nearest 0.5 min, clamped [1, 10].
function suggestedSubMinutes(
  benchSize: number,
  totalPlayers: number,
  gameMinutes: number,
): number {
  if (benchSize <= 0 || totalPlayers <= 0) return 3;
  const R = restsPerPlayer(benchSize);
  const raw = (benchSize * gameMinutes) / (totalPlayers * R);
  const rounded = Math.round(raw * 2) / 2;
  return Math.min(10, Math.max(1, rounded));
}

interface LineupPickerProps {
  auth: import("@/lib/types").LiveAuth;
  gameId: string;
  players: Player[];
  season: PlayerZoneMinutes;
  defaultOnFieldSize: number;
  minOnFieldSize: number;
  maxOnFieldSize: number;
  positionModel: PositionModel;
  /** Full-game length in minutes (4 × quarter length). */
  gameMinutes: number;
  /** Optional href for the Back button shown above the picker. */
  backHref?: string;
  /**
   * Pre-game saved lineup. When present, the picker pre-populates
   * with the saved lineup + size + sub-interval instead of running
   * the fairness suggester. Coach can still adjust before kickoff.
   * Cleared at startGame() — the lineup_set event takes over.
   */
  initialDraft?: import("@/lib/types").LineupDraft | null;
  /**
   * Per-chip behaviour (split / group). Drives the suggester so a
   * chip configured as "group" funnels its mates into the same zone
   * (e.g. a player who needs to stay paired with specific teammates),
   * while "split" (default) spreads them across zones.
   */
  chipModeByKey?: Partial<Record<"a" | "b" | "c", "split" | "group">>;
}

type Slot = Zone | "bench";

/**
 * Selection model — either a real player by id, or an empty slot
 * targeted by zone. Empty slots within the same zone are
 * interchangeable, so the empty selection is just keyed on the
 * zone, not a specific index.
 */
type Selection =
  | { kind: "player"; id: string }
  | { kind: "empty"; zone: Zone };

/**
 * Lineup picker — coach assigns available players to zones + bench
 * before kick-off. Tap two players to swap them; tap a player and
 * then an empty slot to move that player into a zone.
 *
 * The on-field grid always renders the *default* formation (e.g. for
 * U10 that's 12 slots = 4-4-4 across FWD/CEN/BACK). When the coach
 * lowers "Players on field", some zones run short of their default
 * cap — those slots render as dashed `OPEN` placeholders. Initial
 * placement is fairness-driven via `suggestStartingLineup`, so the
 * empty slots start in zones where the data says you've over-played
 * recently. The coach can then move the empties around by tapping
 * a player followed by the empty slot they want.
 */
export function LineupPicker({
  auth,
  gameId,
  players,
  season,
  defaultOnFieldSize,
  minOnFieldSize,
  maxOnFieldSize,
  positionModel,
  gameMinutes,
  backHref,
  initialDraft,
  chipModeByKey = {},
}: LineupPickerProps) {
  // If the coach saved a plan ahead of game day, those values seed
  // the picker. Otherwise we fall back to the age-group default
  // (size) and the suggester (lineup) at first render.
  const [onFieldSize, setOnFieldSize] = useState(
    initialDraft?.on_field_size ?? defaultOnFieldSize,
  );

  // Lineup-build mode. "suggested" runs the fairness suggester to
  // pre-fill the field (the legacy default — coaches who don't
  // micromanage just accept it). "manual" leaves every position
  // empty and parks all players on the bench so the coach can
  // build the lineup themselves position-by-position. Either mode
  // is fully editable via tap-tap-to-swap; the toggle just decides
  // the starting point.
  const [lineupMode, setLineupMode] = useState<"suggested" | "manual">("suggested");

  // displayZoneCaps — always the default formation, used to render the
  // structural grid. Empty slots = displayCap - actual placements.
  const displayZoneCaps = useMemo(
    () => zoneCapsFor(defaultOnFieldSize, positionModel),
    [defaultOnFieldSize, positionModel],
  );

  // Build a lineup for a given mode + on-field size. Suggested →
  // run the fairness suggester. Manual → all players on bench.
  const buildLineup = (mode: "suggested" | "manual", size: number): Lineup => {
    if (mode === "manual") {
      return {
        back: [],
        hback: [],
        mid: [],
        hfwd: [],
        fwd: [],
        bench: players.map((p) => p.id),
      };
    }
    // Build chip-by-id map from the available players list — picked
    // up by the suggester's chip-spread / chip-group penalty (Phase D).
    const chipByPlayerId: Record<string, "a" | "b" | "c" | null | undefined> = {};
    for (const p of players) chipByPlayerId[p.id] = p.chip;
    return suggestStartingLineup(
      players,
      season,
      0,
      zoneCapsFor(size, positionModel),
      {},
      {},
      {},
      {},
      {},
      chipByPlayerId,
      chipModeByKey,
    );
  };

  // The suggester targets `onFieldSize` players via zoneCapsFor —
  // those caps sum to onFieldSize. When onFieldSize < default the
  // resulting zones come up short of displayZoneCaps, and the
  // difference is rendered as empty "OPEN" slots.
  const [lineup, setLineup] = useState<Lineup>(() =>
    initialDraft?.lineup
      ? // Defensive normalise — initialDraft.lineup comes from JSONB.
        {
          back: initialDraft.lineup.back ?? [],
          hback: initialDraft.lineup.hback ?? [],
          mid: initialDraft.lineup.mid ?? [],
          hfwd: initialDraft.lineup.hfwd ?? [],
          fwd: initialDraft.lineup.fwd ?? [],
          bench: initialDraft.lineup.bench ?? [],
        }
      : buildLineup("suggested", defaultOnFieldSize),
  );

  function handleSizeChange(next: number) {
    setOnFieldSize(next);
    setLineup(buildLineup(lineupMode, next));
  }

  function handleModeChange(next: "suggested" | "manual") {
    if (next === lineupMode) return;
    setLineupMode(next);
    setLineup(buildLineup(next, onFieldSize));
    setSelected(null);
  }

  const [selected, setSelected] = useState<Selection | null>(null);
  // When the coach taps an empty slot with no player pre-selected,
  // we open a modal sheet listing every bench player so they can
  // place someone in one tap. Null when the sheet is closed.
  const [fillTargetZone, setFillTargetZone] = useState<Zone | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [savePending, startSaveTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(
    initialDraft?.updated_at ?? null,
  );
  const [subMinInput, setSubMinInput] = useState<string | null>(
    initialDraft ? String(initialDraft.sub_interval_seconds / 60) : null,
  );

  // Sorted dropdown options. The default size is marked as recommended.
  const sizeOptions = useMemo(() => {
    const out: { value: number; label: string }[] = [];
    for (let s = minOnFieldSize; s <= maxOnFieldSize; s++) {
      const tag =
        s === defaultOnFieldSize
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

  const playerById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players],
  );

  const zones = useMemo(() => positionsFor(positionModel), [positionModel]);
  // Display order mirrors the in-game field: forwards at the top, backs
  // at the bottom. The underlying `zones` order stays unchanged (fairness
  // + data rely on it) — only the UI grid order is reversed.
  const displayZones = useMemo(() => [...zones].reverse(), [zones]);
  const slots = useMemo<Slot[]>(() => [...displayZones, "bench"], [displayZones]);
  const slotLabel = (s: Slot) =>
    s === "bench" ? "Bench" : ZONE_SHORT_LABELS[s];

  function slotOf(pid: string): Slot | null {
    for (const s of slots) if (lineup[s].includes(pid)) return s;
    return null;
  }

  /** Move a player to a different zone, filling an empty slot there.
   *  No-op if target has no empty (caller should have checked, but
   *  guard anyway). */
  function movePlayerToZone(pid: string, target: Slot) {
    const source = slotOf(pid);
    if (!source || source === target) return;
    if (target !== "bench" && lineup[target].length >= displayZoneCaps[target]) {
      return;
    }
    setLineup((prev) => ({
      back: prev.back.filter((p) => p !== pid),
      hback: prev.hback.filter((p) => p !== pid),
      mid: prev.mid.filter((p) => p !== pid),
      hfwd: prev.hfwd.filter((p) => p !== pid),
      fwd: prev.fwd.filter((p) => p !== pid),
      bench: prev.bench.filter((p) => p !== pid),
      [target]: [...prev[target], pid],
    }));
  }

  /** Existing two-player swap, lifted out so taps can call into it. */
  function swapPlayers(a: string, b: string) {
    const sa = slotOf(a);
    const sb = slotOf(b);
    if (!sa || !sb) return;
    setLineup((prev) => {
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
  }

  function tapPlayer(pid: string) {
    if (!selected) {
      setSelected({ kind: "player", id: pid });
      return;
    }
    if (selected.kind === "player") {
      if (selected.id === pid) {
        setSelected(null); // tap-same = deselect
      } else {
        swapPlayers(selected.id, pid);
        setSelected(null);
      }
      return;
    }
    // empty + player: move the player into the empty zone
    movePlayerToZone(pid, selected.zone);
    setSelected(null);
  }

  function tapEmpty(zone: Zone) {
    // No selection → open the bench-pick sheet so the coach can
    // place someone in one tap (faster than the legacy "tap empty,
    // then tap a bench player" two-step). Coaches who prefer the
    // old flow can still tap a player first; that path is handled
    // below.
    if (!selected) {
      setFillTargetZone(zone);
      return;
    }
    if (selected.kind === "empty") {
      if (selected.zone === zone) {
        setSelected(null);
      } else {
        // empty + empty: re-target the selection to the new zone (UX
        // shortcut — tapping a different empty just moves your aim).
        setSelected({ kind: "empty", zone });
      }
      return;
    }
    // player + empty: move that player into the target zone
    movePlayerToZone(selected.id, zone);
    setSelected(null);
  }

  // Pick handler for the SlotFillSheet — places the chosen player
  // into the slot the sheet was opened for, then closes the sheet.
  function handleFillPick(playerId: string) {
    if (!fillTargetZone) return;
    movePlayerToZone(playerId, fillTargetZone);
    setFillTargetZone(null);
    setSelected(null);
  }

  const onFieldCount = zones.reduce((n, z) => n + lineup[z].length, 0);
  const benchCount = lineup.bench.length;
  const totalCount = onFieldCount + benchCount;
  const suggestedMin = suggestedSubMinutes(benchCount, totalCount, gameMinutes);
  const effectiveOnFieldTarget = Math.min(onFieldSize, totalCount);
  const effectiveSubMin =
    subMinInput === null
      ? suggestedMin
      : Math.min(10, Math.max(1, parseFloat(subMinInput) || suggestedMin));

  function handleStart() {
    setServerError(null);
    const subSeconds = Math.round(effectiveSubMin * 60);
    startTransition(async () => {
      const result = await startGame(
        auth,
        gameId,
        lineup,
        subSeconds,
        onFieldSize,
      );
      if (result && !result.success) {
        setServerError(result.error);
        return;
      }
      if (auth.kind === "token") {
        window.location.assign(`/run/${auth.token}`);
      }
    });
  }

  // Save the current picker state as a pre-game draft. The game
  // stays "upcoming" — no lineup_set event is written. Re-opening
  // the picker will pre-populate from this draft.
  function handleSavePlan() {
    setServerError(null);
    const subSeconds = Math.round(effectiveSubMin * 60);
    startSaveTransition(async () => {
      const result = await saveLineupDraft(
        auth,
        gameId,
        lineup,
        subSeconds,
        onFieldSize,
      );
      if (!result.success) {
        setServerError(result.error);
        return;
      }
      setSavedAt(new Date().toISOString());
    });
  }

  const playingShortHanded = onFieldSize < defaultOnFieldSize;

  return (
    <div className="space-y-4 pb-24">
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:text-ink"
        >
          <SFIcon.chevronLeft />
          Back to availability
        </Link>
      )}

      {/* ── Build-mode toggle + banner ────────────────────────────────
          Two-button group lets the coach choose between the fairness-
          suggested rotation and a from-scratch manual lineup. Either
          mode is fully editable via tap-tap-to-swap below; this just
          picks the starting point. The banner copy adapts to the
          chosen mode. */}
      <div className="flex flex-wrap items-center gap-2">
        <SFButton
          variant={lineupMode === "suggested" ? "primary" : "subtle"}
          size="sm"
          disabled={isPending}
          onClick={() => handleModeChange("suggested")}
        >
          {lineupMode === "suggested" ? "✓ Suggested rotation" : "Suggested rotation"}
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

      <div className="flex items-start gap-3 rounded-lg border border-warn/30 bg-warn-soft p-4 sm:p-5">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warn text-white">
          <SFIcon.whistle color="white" size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight text-warn">
            {lineupMode === "suggested"
              ? "Auto-suggested starting lineup"
              : "Manual lineup — start from a blank field"}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink/85">
            {lineupMode === "suggested" ? (
              <>
                Players who&apos;ve had less zone time across the season
                get priority — fairer rotations, fewer kids stuck on
                the bench. Tap any two players to swap them; tap a
                player and then an empty slot to move them.
              </>
            ) : (
              <>
                Every position starts open and the whole squad sits on
                the bench. Tap an empty slot, then a bench player to
                place them. Switch back to{" "}
                <strong className="text-ink">Suggested rotation</strong>{" "}
                any time to reset.
              </>
            )}
            {onFieldCount < effectiveOnFieldTarget &&
              ` Only ${onFieldCount} on field — add late arrivals after kick-off.`}
          </p>
        </div>
      </div>

      {/* ── Players on field selector ────────────────────────────────────
          Inline label + dropdown. Less prominent than the pill row —
          most coaches play the recommended size; this is for the
          short-handed exception. */}
      <SFCard pad={14}>
        <div className="flex flex-wrap items-center gap-3">
          <Label htmlFor="on-field-size" className="!mb-0 shrink-0 text-sm">
            Players on field
          </Label>
          <select
            id="on-field-size"
            value={onFieldSize}
            disabled={isPending}
            onChange={(e) => handleSizeChange(parseInt(e.target.value, 10))}
            className="min-w-0 flex-1 rounded-md border border-hairline bg-surface px-3 py-2 text-sm font-medium text-ink shadow-card focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:bg-surface-alt disabled:text-ink-mute"
          >
            {sizeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {playingShortHanded && (
          <p className="mt-2 text-xs text-ink-mute">
            Empty positions show as dashed slots in each zone — drag a
            player into one, or tap an empty slot first to choose where
            you&apos;re short.
          </p>
        )}
      </SFCard>

      {/* ── Zone + bench cards ───────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2">
        {slots.map((slot) => {
          const isBench = slot === "bench";
          const cap = isBench ? null : displayZoneCaps[slot];
          const filled = lineup[slot].length;
          const emptyCount =
            isBench || cap === null ? 0 : Math.max(0, cap - filled);
          const isFull = !isBench && cap !== null && filled === cap;
          return (
            <SFCard key={slot} pad={0} className="overflow-hidden">
              <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
                <span
                  aria-hidden="true"
                  className={`block h-5 w-1 rounded-sm ${
                    isBench ? "bg-ink-mute" : zoneAccent(slot)
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <h3 className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink">
                    {slotLabel(slot)}
                  </h3>
                </div>
                <span
                  className={`font-mono text-xs font-semibold tabular-nums ${
                    isFull ? "text-ink" : "text-ink-mute"
                  }`}
                >
                  {filled}
                  {!isBench && cap !== null && ` / ${cap}`}
                </span>
              </div>
              {filled === 0 && emptyCount === 0 ? (
                <p className="px-4 py-3 text-xs text-ink-mute">Empty</p>
              ) : (
                <ul className="divide-y divide-hairline">
                  {lineup[slot].map((pid) => {
                    const p = playerById.get(pid);
                    if (!p) return null;
                    const isSelected =
                      selected?.kind === "player" && selected.id === pid;
                    return (
                      <li key={pid}>
                        <button
                          type="button"
                          onClick={() => tapPlayer(pid)}
                          className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors duration-fast ease-out-quart ${
                            isSelected
                              ? "bg-brand-50 ring-2 ring-inset ring-brand-500"
                              : "hover:bg-surface-alt"
                          }`}
                        >
                          <Guernsey num={p.jersey_number ?? ""} size={32} />
                          <span className="min-w-0 flex-1 truncate font-medium text-ink">
                            {p.chip && (
                              <span
                                aria-hidden
                                className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${
                                  CHIP_COLORS[p.chip as ChipKey].dot
                                }`}
                              />
                            )}
                            {p.full_name}
                          </span>
                          {isSelected ? (
                            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-alarm">
                              Swapping…
                            </span>
                          ) : (
                            <span className="text-ink-mute opacity-60">
                              <SFIcon.swap />
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                  {!isBench &&
                    Array.from({ length: emptyCount }).map((_, idx) => {
                      const isSelected =
                        selected?.kind === "empty" && selected.zone === slot;
                      return (
                        <li key={`__open-${idx}`}>
                          <button
                            type="button"
                            onClick={() => tapEmpty(slot)}
                            aria-label={`Empty ${slotLabel(slot)} position`}
                            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors duration-fast ease-out-quart ${
                              isSelected
                                ? "bg-warn-soft ring-2 ring-inset ring-warn"
                                : "hover:bg-surface-alt"
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-ink-mute/60 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-mute"
                            >
                              —
                            </span>
                            <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink-mute">
                              Open slot
                            </span>
                            {isSelected ? (
                              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-warn">
                                Tap a player
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                </ul>
              )}
            </SFCard>
          );
        })}
      </div>

      {/* ── Sub interval ─────────────────────────────────────────────── */}
      <SFCard>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Label htmlFor="sub-minutes" className="mb-1">
              Sub interval
            </Label>
            <p className="text-xs text-ink-mute">
              Suggested {suggestedMin} min — {benchCount} on bench,{" "}
              {totalCount} total, ≈{restsPerPlayer(benchCount)} rest
              {restsPerPlayer(benchCount) === 1 ? "" : "s"} each over{" "}
              {gameMinutes} min.
            </p>
          </div>
          <div className="w-full sm:w-24">
            <Input
              id="sub-minutes"
              type="number"
              min={1}
              max={10}
              step={0.5}
              value={subMinInput ?? String(suggestedMin)}
              onChange={(e) => setSubMinInput(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>
      </SFCard>

      {serverError && (
        <p className="text-sm text-danger" role="alert">
          {serverError}
        </p>
      )}

      {/* ── Sticky availability + Start CTA ──────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface px-4 py-3 shadow-[0_-4px_16px_rgba(26,30,26,0.04)] sm:px-7 sm:py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs sm:gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-ok" />
              <span className="font-mono font-bold tabular-nums text-ink">
                {onFieldCount}
              </span>
              <span className="text-ink-dim">on field</span>
            </span>
            <span className="h-3.5 w-px bg-hairline" aria-hidden="true" />
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-ink-mute" />
              <span className="font-mono font-bold tabular-nums text-ink">
                {benchCount}
              </span>
              <span className="text-ink-dim">bench</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {savedAt && (
              <span
                className="hidden text-[11px] text-ink-mute sm:inline"
                title={`Plan saved ${new Date(savedAt).toLocaleString()}`}
              >
                Plan saved
              </span>
            )}
            <SFButton
              onClick={handleSavePlan}
              disabled={onFieldCount === 0 || savePending || isPending}
              variant="ghost"
              size="md"
            >
              {savePending
                ? "Saving…"
                : savedAt
                ? "Update plan"
                : "Save plan"}
            </SFButton>
            <SFButton
              onClick={handleStart}
              disabled={onFieldCount === 0 || isPending}
              variant="primary"
              size="md"
              iconAfter={<SFIcon.chevronRight color="currentColor" />}
            >
              {isPending ? "Starting…" : "Start game"}
            </SFButton>
          </div>
        </div>
      </div>

      {/* Empty-slot picker sheet — opens when the coach taps an
          unfilled position with no player pre-selected. Lists every
          bench player so the coach can place someone in one tap. */}
      {fillTargetZone && (
        <SlotFillSheet
          slotLabel={ZONE_SHORT_LABELS[fillTargetZone]}
          candidates={lineup.bench
            .map((pid) => playerById.get(pid))
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

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Tailwind class for the small accent bar at the left of each zone-card
 * header. Uses our existing colourblind-tested zone tokens.
 */
function zoneAccent(zone: Zone): string {
  switch (zone) {
    case "fwd":
      return "bg-zone-f";
    case "hfwd":
      return "bg-zone-f/70";
    case "mid":
      return "bg-zone-c";
    case "hback":
      return "bg-zone-b/70";
    case "back":
      return "bg-zone-b";
  }
}
