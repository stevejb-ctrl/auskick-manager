"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  markLoan,
  saveLineupDraft,
  startGame,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
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
import { useLiveGame } from "@/lib/stores/liveGameStore";
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
  /**
   * Players already flagged as lent in the pre-game flow. Derived
   * from prior `player_loan` events in this game's event log so the
   * chip survives a page reload. Empty by default for a fresh game.
   * Steve 2026-05-13: "There's no way to set players as lent in the
   * initial team picker." This prop + the Lend panel below address
   * that — toggling here writes the loan event with quarter=1 so it
   * lights up at kickoff.
   */
  initialLoanedIds?: string[];
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
  initialLoanedIds = [],
}: LineupPickerProps) {
  const router = useRouter();
  // Pre-game loaned-player set. Hydrated from any player_loan events
  // already in the game (e.g. a reload after the coach flagged a
  // loan on a previous visit). Toggle handler below writes the
  // event optimistically.
  const [loanedIds, setLoanedIds] = useState<Set<string>>(
    () => new Set(initialLoanedIds),
  );
  const [lendPickerOpen, setLendPickerOpen] = useState(false);
  const [loanError, setLoanError] = useState<string | null>(null);
  const [loanPending, startLoanTransition] = useTransition();

  // Lineup-facing player list — excludes anyone currently flagged as
  // lent so the suggester won't place them and the bench grid won't
  // show them. `players` (the raw prop) is still used for lookups
  // via playersById below.
  const playersForLineup = useMemo(
    () => players.filter((p) => !loanedIds.has(p.id)),
    [players, loanedIds],
  );
  const lentPlayers = useMemo(
    () => players.filter((p) => loanedIds.has(p.id)),
    [players, loanedIds],
  );

  function handleLendToggle(playerId: string, nextLoaned: boolean) {
    setLoanError(null);
    // Optimistic local update — picker chips reflect the change
    // instantly. Roll back on server error.
    setLoanedIds((prev) => {
      const next = new Set(prev);
      if (nextLoaned) next.add(playerId);
      else next.delete(playerId);
      return next;
    });
    // Also yank the player out of any zone/bench so the lineup grid
    // is consistent with the chip set the suggester sees.
    if (nextLoaned) {
      setLineup((prev) => {
        const next: Lineup = {
          back: prev.back.filter((id) => id !== playerId),
          hback: prev.hback.filter((id) => id !== playerId),
          mid: prev.mid.filter((id) => id !== playerId),
          hfwd: prev.hfwd.filter((id) => id !== playerId),
          fwd: prev.fwd.filter((id) => id !== playerId),
          bench: prev.bench.filter((id) => id !== playerId),
        };
        return next;
      });
    } else {
      // Returning a player → put them back on the bench so the coach
      // can slot them in. Suggester will pick them up next mode-switch.
      setLineup((prev) => ({
        ...prev,
        bench: prev.bench.includes(playerId)
          ? prev.bench
          : [...prev.bench, playerId],
      }));
    }
    startLoanTransition(async () => {
      // Loan applies from the start of Q1. elapsed_ms=0 because the
      // game hasn't started — the event predates quarter_start, and
      // replayGame treats it as "loaned from kickoff".
      const result = await markLoan(auth, gameId, {
        player_id: playerId,
        loaned: nextLoaned,
        quarter: 1,
        elapsed_ms: 0,
      });
      if (!result.success) {
        // Roll back the optimistic update.
        setLoanedIds((prev) => {
          const next = new Set(prev);
          if (nextLoaned) next.delete(playerId);
          else next.add(playerId);
          return next;
        });
        setLoanError(result.error);
      }
    });
  }
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

  // Mirror the local choice into the live store so QuarterBreak
  // picks it up as its default for every subsequent break. Steve's
  // request 2026-05-13: "Change from suggested rotation to manually
  // set (this default would persist across the whole game)."
  const setRotationMode = useLiveGame((s) => s.setRotationMode);

  // Game-settings collapse. Steve 2026-05-13 (follow-up): always
  // start closed. The collapsed-header summary now spells out the
  // active state in plain English ("Auto-suggested · No lent" or
  // "Manual lineup · 1 lent") which makes the discoverability
  // auto-expand was solving unnecessary.
  const [gameSettingsOpen, setGameSettingsOpen] = useState(false);

  // displayZoneCaps — always the default formation, used to render the
  // structural grid. Empty slots = displayCap - actual placements.
  const displayZoneCaps = useMemo(
    () => zoneCapsFor(defaultOnFieldSize, positionModel),
    [defaultOnFieldSize, positionModel],
  );

  // Build a lineup for a given mode + on-field size. Suggested →
  // run the fairness suggester. Manual → all players on bench.
  // Uses `playersForLineup` (excludes loaned players) so a lent
  // player won't get auto-placed or appear on the bench grid.
  const buildLineup = (mode: "suggested" | "manual", size: number): Lineup => {
    if (mode === "manual") {
      return {
        back: [],
        hback: [],
        mid: [],
        hfwd: [],
        fwd: [],
        bench: playersForLineup.map((p) => p.id),
      };
    }
    // Build chip-by-id map from the available players list — picked
    // up by the suggester's chip-spread / chip-group penalty (Phase D).
    const chipByPlayerId: Record<string, "a" | "b" | "c" | null | undefined> = {};
    for (const p of playersForLineup) chipByPlayerId[p.id] = p.chip;
    return suggestStartingLineup(
      playersForLineup,
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
    setRotationMode(next);
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
  //
  // Steve 2026-05-13: also navigate back to the previous page
  // (backHref) after a successful save. The pre-kickoff sticky
  // bar promotes Save plan to a "save + exit" affordance so the
  // primary "Ready for Q1" CTA can dominate the bar. If no
  // backHref is configured, stay on the page (token-auth runner
  // path).
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
      if (backHref) router.push(backHref);
    });
  }

  const playingShortHanded = onFieldSize < defaultOnFieldSize;

  return (
    // pb sized for the two-row sticky footer (stats + Save plan row
    // ~32px, big primary "Ready for Q1" ~52px, container py + gap
    // ~22px). 8rem clears it with breathing room over the iPhone
    // home indicator (Steve 2026-05-13).
    <div className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))]">
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:text-ink"
        >
          <SFIcon.chevronLeft />
          Back to availability
        </Link>
      )}

      {/* ── Game settings (collapsible) ──────────────────────────────────
          Steve 2026-05-13: the three pre-game controls (rotation
          mode, on-field size, lend a player) used to each occupy
          their own row at the top of the picker, but for most games
          they all sit at their defaults. Group them behind a single
          collapsible "Game settings" header so the noise drops away
          when nothing's been changed. The collapsed header shows a
          one-line summary of any non-defaults so the coach knows
          something IS set without having to expand. Mirrors the
          Match-adjustments collapse on QuarterBreak. */}
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
            <span className="text-xs text-ink-mute">
              {(() => {
                // Summary line — always show rotation mode AND a
                // lent chip ("1 lent" / "No lent") so the closed
                // header doubles as a discovery hint for what's
                // inside the collapse. Size still only surfaces
                // when non-default (numeric value, "No" framing
                // doesn't fit). Mirrors the QB collapse. No
                // injured concept pre-game — the squad hasn't
                // hit the field yet.
                const bits: string[] = [];
                bits.push(
                  lineupMode === "suggested" ? "Auto-suggested" : "Manual lineup",
                );
                if (onFieldSize !== defaultOnFieldSize)
                  bits.push(`${onFieldSize} on field`);
                bits.push(
                  lentPlayers.length > 0
                    ? `${lentPlayers.length} lent`
                    : "No lent",
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
                  ? "Auto-rotates each quarter — players with less season zone time start."
                  : "Blank field at kickoff. This choice persists through the whole game; QuarterBreak respects it too."}
              </p>
            </div>

            {/* Players on field */}
            <div>
              <Label
                htmlFor="on-field-size"
                className="!mb-1 block text-xs font-semibold text-ink"
              >
                Players on field
              </Label>
              <select
                id="on-field-size"
                value={onFieldSize}
                disabled={isPending}
                onChange={(e) => handleSizeChange(parseInt(e.target.value, 10))}
                className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm font-medium text-ink shadow-card focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:bg-surface-alt disabled:text-ink-mute"
              >
                {sizeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {playingShortHanded && (
                <p className="mt-1.5 text-xs text-ink-mute">
                  Empty positions show as dashed slots in each zone — tap an
                  empty slot first to choose where you&apos;re short.
                </p>
              )}
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
                    {p.jersey_number != null && (
                      <span className="tabular-nums font-semibold">
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

      {/* Short on-field hint (always visible — it's a kickoff-day
          consideration the coach needs to see regardless of whether
          Game settings is open). */}
      {onFieldCount < effectiveOnFieldTarget && (
        <p className="text-xs leading-relaxed text-ink-dim">
          Only {onFieldCount} on field — add late arrivals after kick-off.
        </p>
      )}

      {/* Lend-player picker modal — opens from "+ Lend a player". Lists
          every available squad player not already lent. */}
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

      {/* ── Sticky pre-game footer ──────────────────────────────────────
          Steve 2026-05-13 redesigned: was a single cramped row
          with the stats, Save-plan, and Ready CTAs all jostling
          for space. Now stacks the secondary stuff (counts +
          "Save plan & exit") on top of a full-width primary
          "Ready for Q1" CTA — mirrors the Q-break Ready button
          treatment. Save plan now also navigates back to the
          previous page after a successful save (see
          handleSavePlan) so the eyebrow row reads as a clear
          "stash the draft and leave" action distinct from the
          primary "let's kick off". */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface px-4 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(26,30,26,0.04)] sm:px-7 sm:pt-3">
        <div className="mx-auto flex max-w-4xl flex-col gap-2">
          {/* Top row — counts + "Save plan & exit" — only renders for
              team-auth coaches. Token-auth parent-runners get a
              single-row footer with just the Ready CTA because
              (a) they have no "page to exit to" — there's no
              game-detail page in the runner-token flow, and (b)
              the "exit" word next to "Ready" freezes them
              ("will Exit delete the game?"). Steve 2026-05-13
              usability test (Lisa B4) — matches the existing
              netball NetballLineupPicker's onSavePlan opt-out. */}
          {auth.kind === "team" && (
            <div className="flex items-center justify-between gap-3">
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
                {savedAt && (
                  <span
                    className="hidden text-[11px] text-ink-mute sm:inline"
                    title={`Plan saved ${new Date(savedAt).toLocaleString()}`}
                  >
                    · Plan saved
                  </span>
                )}
              </div>
              <SFButton
                onClick={handleSavePlan}
                loading={savePending}
                disabled={onFieldCount === 0 || isPending}
                variant="ghost"
                size="sm"
              >
                {savePending
                  ? "Saving…"
                  : savedAt
                  ? "Update plan & exit"
                  : "Save plan & exit"}
              </SFButton>
            </div>
          )}
          <SFButton
            onClick={handleStart}
            loading={isPending}
            disabled={onFieldCount === 0}
            variant="accent"
            size="lg"
            full
            iconAfter={isPending ? undefined : <SFIcon.chevronRight color="currentColor" />}
          >
            {isPending ? "Starting…" : "Ready for Q1"}
          </SFButton>
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
