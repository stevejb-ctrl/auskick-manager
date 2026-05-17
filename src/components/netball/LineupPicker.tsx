"use client";

// ─── Netball Lineup Picker ────────────────────────────────────
// Pre-game initial lineup builder. Opens with the suggester's
// output already in place (auto-suggested), then the coach taps
// any two players to swap them between positions or bench. Same
// two-tap-to-swap pattern as the AFL pre-game LineupPicker and
// netball's NetballQuarterBreak so the design language stays
// consistent across surfaces.
//
// (NetballQuarterBreak is the equivalent for in-game breaks —
// this component is only used for the very first lineup.)

import { useEffect, useMemo, useState, useTransition } from "react";
import type { LiveAuth, Player } from "@/lib/types";
import { markLoan } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import { Court } from "@/components/netball/Court";
import { PositionToken } from "@/components/netball/PositionToken";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { SlotFillSheet } from "@/components/ui/SlotFillSheet";
import { SFButton } from "@/components/sf";
import { LineupPickerFooter } from "@/components/lineup/LineupPickerFooter";
import { LineupPickerBreadcrumb } from "@/components/lineup/LineupPickerBreadcrumb";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { NetballStartQuarterModal } from "@/components/netball/NetballStartQuarterModal";
import { netballSport, primaryThirdFor } from "@/lib/sports/netball";
import type { AgeGroupConfig } from "@/lib/sports/types";
import {
  type GenericLineup,
  emptyGenericLineup,
  suggestNetballLineup,
  seasonPositionCounts,
  gamePositionCounts,
  lastQuarterThirds,
  lastQuarterTeammatesInThird,
} from "@/lib/sports/netball/fairness";
import type { GameEvent } from "@/lib/types";

interface LineupPickerProps {
  ageGroup: AgeGroupConfig;
  squad: Player[];
  availableIds: string[];
  initialLineup?: GenericLineup | null;
  /** Events from this game so far (for diversity bonus this-game vs season). */
  thisGameEvents?: GameEvent[];
  /** Season events across all this team's games (for the "owed" heuristic). */
  seasonEvents?: GameEvent[];
  /**
   * Default quarter length (in seconds) for the per-game override
   * input. Resolved by the parent from the team's effective quarter
   * length. When provided alongside `onChangeQuarterLengthSeconds`
   * the picker renders a small "Quarter length" card mirroring AFL's
   * pre-game sub-interval card — coach can override for this match.
   * When `defaultQuarterSeconds` is omitted (e.g. Q-break flow which
   * doesn't change quarter length mid-game), the card is hidden.
   */
  defaultQuarterSeconds?: number;
  /**
   * Confirmation handler. When the picker has a quarter-length card,
   * the second arg carries the chosen override in seconds (or null
   * if the coach left it at the default). Q-break callers can ignore
   * the second arg.
   */
  onConfirm: (
    lineup: GenericLineup,
    quarterLengthSeconds?: number | null,
  ) => void | Promise<void>;
  confirmLabel?: string;
  disabled?: boolean;
  /**
   * Optional href for a "Back to availability" breadcrumb above the
   * picker. Mirrors AFL's LineupPicker affordance — lets the coach
   * pop back to the game-detail page (with the AvailabilityList +
   * fill-in form) without losing context. Omit to hide the link
   * (e.g. Q-break flow where we're not in a "I picked the wrong
   * starting roster" recovery scenario).
   */
  backHref?: string;
  /**
   * Optional draft-save callback — when provided, the sticky footer
   * grows to a two-row layout with a "Save plan & exit" ghost button
   * on top and the primary "Confirm lineup" CTA below. Mirrors the
   * AFL pre-game LineupPicker affordance so a netball coach can
   * stash a draft and leave the same way (Steve 2026-05-13
   * sport-parity fix). The callback is invoked with the current
   * lineup; the caller is expected to persist it + navigate back.
   * Omit on surfaces where stashing-and-leaving doesn't make sense
   * (token-share runner, Q-break flow).
   */
  onSavePlan?: (lineup: GenericLineup) => Promise<void>;
  /**
   * ISO timestamp of the most recent save — when present, the
   * "Save plan & exit" button label flips to "Update plan & exit"
   * and a "Plan saved" badge appears next to the counts. Initial
   * value (if any) comes from the parent reading game_lineup_drafts.
   */
  initialSavedAt?: string | null;
  /**
   * Steve 2026-05-16: AFL-parity Lend a player support. The
   * picker writes `player_loan` events via `markLoan` to mark
   * (or un-mark) players as lent to the opposition; the suggester
   * pool + bench grid exclude lent players. When `auth` + `gameId`
   * are both provided, the "Lend a player" section renders inside
   * the Game settings collapse. When either is omitted (e.g. a
   * surface that doesn't have the loan concept), the section is
   * hidden and no chips render — matches existing behaviour for
   * call sites pre-dating this prop.
   */
  auth?: LiveAuth;
  gameId?: string;
  /**
   * Pre-game loaned-player IDs hydrated by the parent from prior
   * `player_loan` events in this game. Lets a reload or re-entry
   * mid-pre-game preserve the loan state instead of dropping it.
   * Default empty.
   */
  initialLoanedIds?: string[];
}

export function NetballLineupPicker({
  ageGroup,
  squad,
  availableIds,
  initialLineup,
  thisGameEvents = [],
  seasonEvents = [],
  defaultQuarterSeconds,
  onConfirm,
  confirmLabel = "Confirm lineup",
  disabled,
  backHref,
  onSavePlan,
  initialSavedAt = null,
  auth,
  gameId,
  initialLoanedIds = [],
}: LineupPickerProps) {
  // Lend-a-player support (AFL parity, Steve 2026-05-16). When
  // `auth + gameId` are wired, the picker renders a "Lend a player"
  // section inside the Game settings collapse. Optimistic-with-
  // rollback like AFL's same handler.
  const [loanedIds, setLoanedIds] = useState<Set<string>>(
    () => new Set(initialLoanedIds),
  );
  const [lendPickerOpen, setLendPickerOpen] = useState(false);
  const [loanError, setLoanError] = useState<string | null>(null);
  const [loanPending, startLoanTransition] = useTransition();
  const lendingEnabled = !!auth && !!gameId;

  const lentPlayers = useMemo(
    () => squad.filter((p) => loanedIds.has(p.id)),
    [squad, loanedIds],
  );
  // Lineup-build mode. "suggested" runs the fairness suggester to
  // pre-fill the court (the legacy default). "manual" leaves every
  // position empty and parks the whole squad on the bench so the
  // coach can build the lineup themselves position-by-position.
  // Either mode is fully editable via tap-tap below; the toggle
  // just decides the starting point.
  const [lineupMode, setLineupMode] = useState<"suggested" | "manual">("suggested");
  // Steve 2026-05-16: AFL parity — the rotation toggle + the
  // mode-aware callout + the quarter-length card all sit behind a
  // single "Game settings" collapse now (mirrors the AFL pre-game
  // picker pattern + the Q-break match-adjustments collapse). The
  // closed header shows a one-line summary of any non-defaults so
  // the coach knows something IS set without having to expand.
  const [gameSettingsOpen, setGameSettingsOpen] = useState(false);

  // Build a lineup for the chosen mode. Suggested → run the
  // fairness suggester. Manual → empty positions, all available
  // players on bench. When the parent supplies an explicit
  // initialLineup (Q-break seed, restored draft) we use it as-is
  // and the toggle is irrelevant on first render.
  const buildLineup = (mode: "suggested" | "manual"): GenericLineup => {
    // Lent players never appear in the suggester pool or on the
    // bench — they're sitting this game out for the opposition.
    // Steve 2026-05-16 (AFL parity).
    const eligibleIds = availableIds.filter((id) => !loanedIds.has(id));
    if (mode === "manual" || eligibleIds.length === 0) {
      return {
        ...emptyGenericLineup(ageGroup.positions),
        bench: [...eligibleIds],
      };
    }
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
    return suggestNetballLineup({
      playerIds: eligibleIds,
      positions: ageGroup.positions,
      season,
      thisGame,
      isAllowed: (_pid, posId) => ageGroup.positions.includes(posId),
      seed: 0,
      thirdOf: thirdLookup,
      lastQuarterThird: lastThirds,
      previousTeammates: prevTeammates,
    });
  };

  const [lineup, setLineup] = useState<GenericLineup>(() => {
    if (initialLineup) return initialLineup;
    return buildLineup("suggested");
  });

  function handleModeChange(next: "suggested" | "manual") {
    if (next === lineupMode) return;
    setLineupMode(next);
    setLineup(buildLineup(next));
    setSelected(null);
  }

  // Lend / un-lend a player. Optimistic local update — chips
  // reflect immediately, lineup ejects the lent player from any
  // court position or bench slot. Rolls back on server error.
  // Mirrors AFL's handleLendToggle pattern in LineupPicker.tsx
  // (Steve 2026-05-16).
  function handleLendToggle(playerId: string, nextLoaned: boolean) {
    if (!lendingEnabled || !auth || !gameId) return;
    setLoanError(null);
    setLoanedIds((prev) => {
      const next = new Set(prev);
      if (nextLoaned) next.add(playerId);
      else next.delete(playerId);
      return next;
    });
    if (nextLoaned) {
      // Yank the player out of any court position + bench so the
      // grid matches the chip set the suggester sees.
      setLineup((prev) => {
        const nextPositions: Record<string, string[]> = {};
        for (const [posId, ids] of Object.entries(prev.positions)) {
          nextPositions[posId] = ids.filter((id) => id !== playerId);
        }
        return {
          positions: nextPositions,
          bench: prev.bench.filter((id) => id !== playerId),
        };
      });
    } else {
      // Returning a player → drop them on the bench so the coach
      // can slot them in. Suggester will reconsider on next mode
      // switch / availability flip.
      setLineup((prev) => ({
        ...prev,
        bench: prev.bench.includes(playerId)
          ? prev.bench
          : [...prev.bench, playerId],
      }));
    }
    startLoanTransition(async () => {
      // Loan applies from kickoff (Q1). elapsed_ms=0 because the
      // event predates quarter_start; replayNetballGame treats it
      // as "loaned from kickoff".
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
        setLoanError(result.error);
      }
    });
  }

  // Re-derive lineup when more players become available AFTER mount.
  // The runner-token netball flow lets a parent mark players Available
  // while the LineupPicker is mounted (the availability section sits
  // ABOVE the picker on the same page). Without this, the picker
  // state stays frozen at its initial empty-bench state — Stagehand
  // 2026-05-09 game-day-flow showed the agent marking players
  // Available, then tapping "Suggested rotation" expecting it to
  // populate, getting nothing because the toggle is a no-op when
  // already in suggested mode.
  //
  // Trigger: re-run the suggester whenever there are AVAILABLE
  // players NOT YET represented in the lineup (court or bench),
  // and we're in suggested mode (so a coach in manual mode keeps
  // their work). This handles incremental availability flips —
  // mark 1 player available, suggester runs once with 1 player;
  // mark a 2nd, suggester re-runs with 2; etc. — without needing
  // an explicit "regenerate" tap.
  useEffect(() => {
    if (lineupMode !== "suggested") return;
    if (initialLineup) return;
    const placedIds = new Set<string>([
      ...Object.values(lineup.positions).flat(),
      ...lineup.bench,
    ]);
    // A LENT player isn't "unplaced" — they're sitting this game
    // out, so don't re-derive the lineup just because they're
    // missing from positions/bench. Without this, every Lend tap
    // would immediately re-run the suggester and the coach's
    // manual placements would get wiped.
    const unplaced = availableIds.filter(
      (id) => !placedIds.has(id) && !loanedIds.has(id),
    );
    if (unplaced.length > 0) {
      setLineup(buildLineup("suggested"));
    }
    // buildLineup closes over availableIds + loanedIds via the
    // suggester so it always reads the latest list. Excluded from
    // deps so the effect runs on availability/loan changes only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableIds, lineupMode, loanedIds]);
  // Two-tap-to-swap selection: tap a player → highlighted; tap another
  // player (or an empty position / bench) → swap. Mirrors the
  // NetballQuarterBreak interaction so the pre-game and Q-break
  // pickers behave identically, and matches the AFL pattern.
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Save plan & exit state — only used when the parent provides
  // an `onSavePlan` callback. Mirrors AFL's LineupPicker:
  // savePending toggles the button loading state; savedAt drives
  // the "Plan saved" badge + flips the label to "Update plan & exit".
  const [savePending, setSavePending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(initialSavedAt);
  // Inline validation error. Replaces native window.alert() — Stagehand
  // exploration (2026-05-09) found that alert() on the runner-token URL
  // (where availability is skipped, so the lineup starts empty and
  // validation always fails) blocked the entire page until the user
  // dismissed it, making it impossible to navigate back. A real coach
  // hits the same wall on mobile where the alert dialog can be hard to
  // dismiss with one tap. Inline error keeps the page interactive.
  const [error, setError] = useState<string | null>(null);
  // Position the coach is filling via the SlotFillSheet. Set when
  // they tap an empty position with no player pre-selected; cleared
  // on pick or cancel.
  const [fillTargetPosition, setFillTargetPosition] = useState<string | null>(
    null,
  );

  // Per-game quarter-length override input. Stored as a free-text
  // string (rather than a number) so the user can clear the field
  // without it snapping back to 0 — mirrors AFL's sub-minute input.
  // Empty/unchanged → null override → game falls back to team default.
  const defaultQuarterMin =
    defaultQuarterSeconds != null ? Math.round(defaultQuarterSeconds / 60) : null;
  const [quarterMinInput, setQuarterMinInput] = useState<string>(
    defaultQuarterMin != null ? String(defaultQuarterMin) : "",
  );

  const squadById = useMemo(
    () => new Map(squad.map((p) => [p.id, p])),
    [squad],
  );

  // Which player is currently in which position/bench. Used to find
  // where the selected player lives so a swap can put the displaced
  // player back into the original slot.
  const playerSlot = useMemo(() => {
    const m = new Map<string, string>();
    for (const [pos, ids] of Object.entries(lineup.positions)) {
      for (const pid of ids) m.set(pid, pos);
    }
    for (const pid of lineup.bench) m.set(pid, "bench");
    return m;
  }, [lineup]);

  // Tap on a player — court or bench. With nothing selected, marks
  // them as selected. With another player already selected, swaps the
  // two. Tapping the same player again deselects.
  const handleTapPlayer = (pid: string) => {
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
    setLineup((prev) => {
      const aSlot = playerSlot.get(a);
      const bSlot = playerSlot.get(b);
      if (!aSlot || !bSlot) return prev;
      const next: GenericLineup = {
        positions: Object.fromEntries(
          Object.entries(prev.positions).map(([k, v]) => [k, [...v]]),
        ),
        bench: [...prev.bench],
      };
      const replaceInPos = (posId: string, x: string, y: string) => {
        next.positions[posId] = (next.positions[posId] ?? []).map((p) =>
          p === x ? y : p,
        );
      };
      const replaceInBench = (x: string, y: string) => {
        next.bench = next.bench.map((p) => (p === x ? y : p));
      };
      const swap = (slot: string, x: string, y: string) => {
        if (slot === "bench") replaceInBench(x, y);
        else replaceInPos(slot, x, y);
      };
      swap(aSlot, a, b);
      swap(bSlot, b, a);
      return next;
    });
    setSelected(null);
  };

  // Place a specific player into a specific position — pulls them
  // out of their current slot (zone or bench) so we don't double-
  // book. Shared between the legacy "tap player + tap empty" flow
  // and the SlotFillSheet pick handler.
  const placeInPosition = (pid: string, positionId: string) => {
    setLineup((prev) => {
      const next: GenericLineup = {
        positions: Object.fromEntries(
          Object.entries(prev.positions).map(([k, v]) => [
            k,
            v.filter((p) => p !== pid),
          ]),
        ),
        bench: prev.bench.filter((p) => p !== pid),
      };
      next.positions[positionId] = [...(next.positions[positionId] ?? []), pid];
      return next;
    });
  };

  // Tap on an empty position (no player there). No selection → open
  // the SlotFillSheet so the coach can pick a bench player in one
  // tap (faster than the legacy two-tap path). Selection → fall
  // through to the legacy "move selected player into empty slot"
  // behaviour for coaches who already started swapping.
  const handleTapEmpty = (positionId: string) => {
    if (!selected) {
      setFillTargetPosition(positionId);
      return;
    }
    placeInPosition(selected, positionId);
    setSelected(null);
  };

  const handleFillPick = (playerId: string) => {
    if (!fillTargetPosition) return;
    placeInPosition(playerId, fillTargetPosition);
    setFillTargetPosition(null);
    setSelected(null);
  };

  // Steve 2026-05-15 two-step kickoff parity: tapping the picker
  // CTA used to call `onConfirm` directly which committed
  // `lineup_set` server-side and dropped the page into an
  // intermediate "lineup locked, ready the kickoff" state with a
  // separate inline "Ready for Q1" button. That divergence from
  // AFL (which hosts its StartQuarterModal IN the picker and
  // commits both events atomically) was the parity gap.
  //
  // New flow: tapping the picker CTA validates locally and opens
  // NetballStartQuarterModal in-place. The modal's "Start Q1"
  // tap fires `onConfirm`, which the parent now passes through to
  // `startNetballGame(..., startQuarterToo=true)` so both
  // `lineup_set` and `quarter_start` write atomically. "Back to
  // lineup" closes the modal — zero server writes, picker is
  // still editable in the background.
  const [startModalOpen, setStartModalOpen] = useState(false);

  // Validate inputs + open the modal. Doesn't commit anything yet.
  const handleOpenStartModal = () => {
    if (disabled || saving) return;
    setError(null);
    const validation = netballSport.validateLineup?.(lineup, ageGroup);
    if (validation && !validation.ok) {
      setError(validation.issues[0]?.message ?? "Lineup is not valid.");
      return;
    }
    // Pre-validate the quarter-length override here too so an
    // invalid number can't slip past the picker tap and surface
    // only at the modal's commit — fail fast keeps the modal
    // experience clean.
    if (defaultQuarterSeconds != null) {
      const parsed = Number(quarterMinInput);
      if (
        !Number.isFinite(parsed) ||
        !Number.isInteger(parsed) ||
        parsed < 1 ||
        parsed > 30
      ) {
        setError(
          "Quarter length must be a whole number between 1 and 30 minutes.",
        );
        return;
      }
    }
    setStartModalOpen(true);
  };

  // Resolve the quarter-length override + fire onConfirm. The
  // parent is expected to commit both `lineup_set` and
  // `quarter_start` atomically via
  // `startNetballGame(..., startQuarterToo=true)`.
  const handleConfirmStart = async () => {
    if (disabled || saving) return;
    let quarterOverrideSeconds: number | null = null;
    if (defaultQuarterSeconds != null) {
      const parsed = Number(quarterMinInput);
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 30) {
        const seconds = parsed * 60;
        if (seconds !== defaultQuarterSeconds) {
          quarterOverrideSeconds = seconds;
        }
      }
    }
    setSaving(true);
    try {
      await onConfirm(lineup, quarterOverrideSeconds);
    } finally {
      setSaving(false);
      setStartModalOpen(false);
    }
  };

  // Save the current draft + exit back to the previous page.
  // Parent owns the persistence + redirect; we just flag pending
  // state and surface any error inline. Mirrors AFL LineupPicker's
  // handleSavePlan (Steve 2026-05-13 sport-parity fix).
  async function handleSavePlan() {
    if (!onSavePlan) return;
    setError(null);
    setSavePending(true);
    try {
      await onSavePlan(lineup);
      setSavedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSavePending(false);
    }
  }

  // Position-keyed horizontal alignment — alternating zigzag down the
  // court so adjacent positions sit on OPPOSITE sides (GA opposite WA,
  // WD opposite GD), matching real-court geography. Same layout as the
  // live court so the lineup the coach builds matches what they'll see
  // during play.
  const ALIGN: Record<string, string> = {
    gs: "justify-start pl-4",
    ga: "justify-end pr-4",
    wa: "justify-start pl-4",
    c: "justify-center",
    wd: "justify-end pr-4",
    gd: "justify-start pl-4",
    gk: "justify-end pr-4",
  };

  const renderTokenAt = (positionId: string) => {
    const occupantId = lineup.positions[positionId]?.[0];
    const occupantName = occupantId ? squadById.get(occupantId)?.full_name ?? null : null;
    return (
      <div
        key={positionId}
        className={`relative z-10 flex w-full ${ALIGN[positionId] ?? "justify-center"}`}
      >
        <PositionToken
          positionId={positionId}
          playerName={occupantName}
          selected={!!occupantId && selected === occupantId}
          onTap={() => {
            if (occupantId) handleTapPlayer(occupantId);
            else handleTapEmpty(positionId);
          }}
        />
      </div>
    );
  };

  const byThird = (third: "attack-third" | "centre-third" | "defence-third") =>
    ageGroup.positions.filter((id) => primaryThirdFor(id) === third);

  return (
    <div className="flex flex-col gap-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <LineupPickerBreadcrumb backHref={backHref} />

      {/* ── Game settings (collapsible) ──────────────────────────
          Steve 2026-05-16: parity with the AFL pre-game picker —
          rotation mode + the mode-aware callout + the per-game
          quarter-length override all live behind a single
          collapsible header. Most games run on defaults, so the
          rotation buttons were adding noise at the top of the
          screen on every kickoff. The closed header summarises
          any non-defaults so the coach can scan-and-tap without
          expanding. Quarter-length card moves UP here so coaches
          who do want to fiddle find both knobs in one place. */}
      <div className="rounded-md border border-hairline bg-surface shadow-card">
        <button
          type="button"
          onClick={() => setGameSettingsOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-alt"
          aria-expanded={gameSettingsOpen}
          aria-controls="netball-lineup-game-settings"
        >
          <span className="flex flex-1 items-center gap-3 text-sm">
            <span className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
              Game settings
            </span>
            <span className="text-xs text-ink-mute">
              {(() => {
                const bits: string[] = [];
                bits.push(
                  lineupMode === "suggested" ? "Auto-suggested" : "Manual lineup",
                );
                // Quarter length only surfaces in the summary when it
                // differs from the team's default (defaultQuarterSeconds
                // is the team setting; quarterMinInput is the per-game
                // override). Mirrors AFL's "only show non-defaults"
                // pattern in the collapse header.
                if (defaultQuarterSeconds != null && defaultQuarterMin != null) {
                  const parsed = Number(quarterMinInput);
                  if (Number.isFinite(parsed) && parsed > 0 && parsed !== defaultQuarterMin) {
                    bits.push(`${parsed}-min Q`);
                  }
                }
                // Lent count surfaces ONLY when lending is enabled +
                // there's at least one lent player. The "No lent" /
                // "0 lent" framing AFL uses doesn't fit netball
                // where most games have nobody lent — too noisy.
                if (lendingEnabled && lentPlayers.length > 0) {
                  bits.push(`${lentPlayers.length} lent`);
                }
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
            id="netball-lineup-game-settings"
            className="space-y-4 border-t border-hairline px-4 py-4"
          >
            {/* Rotation mode */}
            <div>
              <p className="text-xs font-semibold text-ink">Rotation</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <SFButton
                  variant={lineupMode === "suggested" ? "primary" : "subtle"}
                  size="sm"
                  disabled={disabled || saving}
                  onClick={() => handleModeChange("suggested")}
                >
                  {lineupMode === "suggested" ? "✓ Suggested rotation" : "Suggested rotation"}
                </SFButton>
                <SFButton
                  variant={lineupMode === "manual" ? "primary" : "subtle"}
                  size="sm"
                  disabled={disabled || saving}
                  onClick={() => handleModeChange("manual")}
                >
                  {lineupMode === "manual" ? "✓ Set manually" : "Set manually"}
                </SFButton>
              </div>
              <p className="mt-1.5 text-xs text-ink-mute">
                {lineupMode === "suggested"
                  ? "Players who've had less zone time across the season get priority — fairer rotations, fewer kids stuck on the bench. Tap any two players to swap them; tap a player and then an empty position to move them."
                  : "Every position starts open and the whole squad sits on the bench. Tap a player, then an empty position to place them. Switch back to Suggested any time to reset."}
              </p>
            </div>

            {/* Per-game quarter-length override (moved up from below
                so all pre-game knobs sit in one collapse). */}
            {defaultQuarterSeconds != null && (
              <div>
                <Label
                  htmlFor="quarter-minutes"
                  className="!mb-1 block text-xs font-semibold text-ink"
                >
                  Quarter length
                </Label>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <p className="text-xs text-ink-mute">
                      Defaults to your team setting ({defaultQuarterMin} min).
                      Override here for this game only — useful for finals,
                      double-headers, or weather-shortened matches.
                    </p>
                  </div>
                  <div className="w-24">
                    <Input
                      id="quarter-minutes"
                      type="number"
                      min={1}
                      max={30}
                      step={1}
                      value={quarterMinInput}
                      onChange={(e) => setQuarterMinInput(e.target.value)}
                      disabled={disabled || saving}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Lend a player — AFL-parity affordance for when a team
                has too many available and is lending one or more
                kids to the short-handed opposition. Lent players
                drop out of the suggester pool + bench grid; the
                chip set here is the live source of truth. Same
                visual treatment as AFL's pre-game Lend section. */}
            {lendingEnabled && (
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
            )}
          </div>
        )}
      </div>

      <Court
        attackThird={byThird("attack-third").map(renderTokenAt)}
        centreThird={byThird("centre-third").map(renderTokenAt)}
        defenceThird={byThird("defence-third").map(renderTokenAt)}
      />

      <BenchStrip
        bench={lineup.bench}
        onCourtIds={Array.from(playerSlot.entries())
          .filter(([, slot]) => slot !== "bench")
          .map(([pid]) => pid)}
        squadById={squadById}
        availableIds={availableIds}
        selectedId={selected}
        onTapPlayer={handleTapPlayer}
      />

      {/* Per-game quarter-length override moved UP into the
          "Game settings" collapse (Steve 2026-05-16) so all pre-
          game knobs live in one place. Empty here intentionally —
          keeping the spot for grep so a future audit doesn't
          re-introduce the card. */}

      {error && <InlineAlert>{error}</InlineAlert>}

      {/* Sticky kickoff CTA — chrome owned by the shared
          LineupPickerFooter (P3a, netball-parity extraction). The
          two-row layout (counts + Save-plan + primary CTA) renders
          when onSavePlan is provided; otherwise collapses to the
          single-row primary CTA. Mirrors AFL's identical pattern. */}
      {(() => {
        const onCourtCount = Object.values(lineup.positions).reduce(
          (sum, ids) => sum + ids.length,
          0,
        );
        const benchCount = lineup.bench.length;
        return (
          <LineupPickerFooter
            onFieldCount={onCourtCount}
            benchCount={benchCount}
            onFieldLabel="on court"
            onSavePlan={onSavePlan ? handleSavePlan : undefined}
            savePending={savePending}
            savedAt={savedAt}
            savePlanDisabled={onCourtCount === 0 || saving}
            onConfirm={handleOpenStartModal}
            confirmLabel={confirmLabel}
            confirmDisabled={disabled || saving}
            confirmLoading={false}
          />
        );
      })()}

      {/* Await-kickoff modal — owned by the picker (parity with AFL
          LineupPicker, Steve 2026-05-15). Renders only after the
          coach has confirmed their lineup with "Ready for Q1". The
          modal's "Start Q1" handler runs the atomic server commit
          (lineup_set + quarter_start via startNetballGame's
          startQuarterToo=true flag). "Back to lineup" just closes
          the modal — zero server writes, the picker is still
          editable in the background. */}
      {startModalOpen && (
        <NetballStartQuarterModal
          quarter={1}
          loading={saving}
          onStart={handleConfirmStart}
          onCancel={() => setStartModalOpen(false)}
        />
      )}

      {/* Empty-position picker sheet — opens when the coach taps an
          unfilled court position with no player pre-selected. Lists
          every bench / unassigned player so they can place someone
          in one tap. */}
      {fillTargetPosition && (() => {
        const onCourtSet = new Set(
          Array.from(playerSlot.entries())
            .filter(([, slot]) => slot !== "bench")
            .map(([pid]) => pid),
        );
        const candidatePool = [
          ...lineup.bench,
          ...availableIds.filter(
            (pid) => !onCourtSet.has(pid) && !lineup.bench.includes(pid),
          ),
        ];
        const pos = netballSport.allPositions.find(
          (p) => p.id === fillTargetPosition,
        );
        const slotLabel = pos?.shortLabel ?? fillTargetPosition.toUpperCase();
        return (
          <SlotFillSheet
            slotLabel={slotLabel}
            candidates={candidatePool
              .map((pid) => squadById.get(pid))
              .filter((p): p is Player => !!p)
              .map((p) => ({ id: p.id, name: p.full_name }))}
            onPick={handleFillPick}
            onCancel={() => setFillTargetPosition(null)}
          />
        );
      })()}

      {/* Lend-player picker — opens from "+ Lend a player" inside
          the Game settings collapse. Lists every available squad
          player not already lent (and not currently on the court).
          AFL parity. */}
      {lendPickerOpen && (
        <SlotFillSheet
          slotLabel="player"
          titleVerb="Lend"
          subtitle="Pick a player to lend to the opposition for the rest of the game. Tap their chip to bring them back."
          emptyMessage="Everyone is already lent."
          candidates={squad
            .filter((p) => !loanedIds.has(p.id))
            .map((p) => ({ id: p.id, name: p.full_name }))}
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

// ─── Bench strip ─────────────────────────────────────────────
function BenchStrip({
  bench,
  onCourtIds,
  squadById,
  availableIds,
  selectedId,
  onTapPlayer,
}: {
  bench: string[];
  onCourtIds: string[];
  squadById: Map<string, Player>;
  availableIds: string[];
  /** Currently-selected player id (highlighted to confirm the tap). */
  selectedId: string | null;
  onTapPlayer: (playerId: string) => void;
}) {
  // "Bench + unassigned" = available players who aren't currently in a
  // position. That's the explicit bench list plus anyone in availableIds
  // who hasn't been placed anywhere yet. Showing both lets the coach
  // tap-to-assign without remembering who's left.
  const onCourtSet = new Set(onCourtIds);
  const benchSet = new Set(bench);
  const unassigned = availableIds.filter(
    (pid) => !onCourtSet.has(pid) && !benchSet.has(pid),
  );
  const all = [...bench, ...unassigned];

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-dim">Bench + unassigned</h3>
        <span className="text-xs text-ink-mute">{bench.length} benched</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {all.length === 0 ? (
          <span className="text-xs italic text-ink-mute">
            Everyone available is placed.
          </span>
        ) : (
          all.map((pid) => {
            const player = squadById.get(pid);
            if (!player) return null;
            const isSelected = selectedId === pid;
            return (
              <button
                key={pid}
                type="button"
                onClick={() => onTapPlayer(pid)}
                className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                  isSelected
                    ? "border-brand-500 bg-brand-50 text-brand-800 ring-2 ring-brand-400"
                    : "border-hairline bg-surface-alt text-ink hover:bg-hairline"
                }`}
              >
                {player.full_name}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
