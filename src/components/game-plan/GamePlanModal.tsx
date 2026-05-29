"use client";

// ─── GamePlanModal ───────────────────────────────────────────
// The coach's pre-kickoff rotation planner. Auto-suggests a fair
// full-game rotation (via the same fairness engines the live
// Q-break uses), lets the coach tweak it tap-to-swap, then hands
// over copy/paste text for the team chat — the planning-time
// mirror of the post-game GameSummaryCard.
//
// Sport-agnostic by construction: the projector + formatter (see
// src/lib/game-plan) fill one neutral `GamePlan` shape, so AFL
// (zones), netball (positions) and rugby league (forwards/backs)
// all drive this single modal. Per CLAUDE.md "reuse before you
// fork" — there is one planner, not three.
//
// Shared chrome consumed verbatim: Modal, SegTabs (period tabs),
// SFCard / Guernsey / SFIcon (player rows — same idiom as the
// pre-game LineupPicker so the swap gesture feels identical), and
// CopyableTextBlock (the "Copy for group chat" affordance, shared
// with all three post-game summary cards).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { CopyableTextBlock } from "@/components/ui/CopyableTextBlock";
import { Guernsey, SegTabs, SFButton, SFCard, SFIcon } from "@/components/sf";
import { ChipIndicator } from "@/components/squad/ChipIndicator";
import {
  formatGamePlan,
  projectGamePlan,
  swapPlayersInPeriod,
  type GamePlan,
} from "@/lib/game-plan";
import type { ChipKey, ChipMode } from "@/lib/chips";
import type { AgeGroupConfig, SportId } from "@/lib/sports/types";
import type { GameEvent, PlayerChip } from "@/lib/types";

/**
 * The minimal player shape the planner needs — id for projection,
 * name + jersey for the rows and copy text, optional chip for the
 * chip-aware indicator. Deliberately narrower than `Player` so every
 * caller (the game-detail page only selects these columns; the live
 * pickers pass full rows) can hand over what it already has.
 */
export interface GamePlanPlayer {
  id: string;
  full_name: string;
  jersey_number: number | null;
  chip?: PlayerChip | null;
}

export interface GamePlanModalProps {
  sport: SportId;
  /** Resolved age-group config — drives positions, period count, minutes. */
  ageGroup: AgeGroupConfig;
  /** Available squad for this game, in display order. */
  players: GamePlanPlayer[];
  /** Players on field for this game (clamped to the age-group bounds). */
  onFieldSize: number;
  /** Coach's team name for the header + copy text. */
  teamName: string;
  /** Opponent name when known — drops the "v …" half when absent. */
  opponentName?: string | null;
  /**
   * Season events across prior games. Drives season-level fairness in
   * the AFL / netball suggesters. Omit for a fresh team — the plan
   * still rotates fairly within the game.
   */
  seasonEvents?: GameEvent[];
  /** Per-chip mode (split/group/zone) so chip-aware placement matches the lineup picker. */
  chipModeByKey?: Partial<Record<PlayerChip, ChipMode>>;
  /** Deterministic starting seed (tests pin this; "Reshuffle" bumps it). */
  initialSeed?: number;
  /** Dismiss the planner. */
  onClose: () => void;
}

/**
 * Pre-game rotation planner. Opens already populated with an
 * auto-suggested fair rotation; the coach taps two players to swap
 * them within a period, "Reshuffle" rerolls the whole suggestion,
 * and "Copy for group chat" lifts the plan as text.
 */
export function GamePlanModal({
  sport,
  ageGroup,
  players,
  onFieldSize,
  teamName,
  opponentName,
  seasonEvents,
  chipModeByKey = {},
  initialSeed = 7,
  onClose,
}: GamePlanModalProps) {
  // Project a fresh plan for a given seed. Pure — safe to call on
  // mount and on every reshuffle.
  const project = useCallback(
    (seed: number): GamePlan =>
      projectGamePlan({
        sport,
        ageGroup,
        players,
        onFieldSize,
        seasonEvents,
        seed,
        chipModeByKey,
      }),
    [sport, ageGroup, players, onFieldSize, seasonEvents, chipModeByKey],
  );

  const [seed, setSeed] = useState(initialSeed);
  const [plan, setPlan] = useState<GamePlan>(() => project(initialSeed));
  const [activePeriod, setActivePeriod] = useState(0);
  // First-tapped player id, awaiting a second tap to swap. Null = idle.
  const [selected, setSelected] = useState<string | null>(null);

  // Escape closes the planner — parity with the app's other
  // dismissable surfaces (Modal itself doesn't bind keys).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const playerById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players],
  );

  // Copy-text name: "#7 Jack Smith" when a jersey is set, else the
  // full name. Unknown ids fall back to the id so the plan never
  // silently drops a player.
  const displayName = useCallback(
    (id: string) => {
      const p = playerById.get(id);
      if (!p) return id;
      return p.jersey_number != null
        ? `#${p.jersey_number} ${p.full_name}`
        : p.full_name;
    },
    [playerById],
  );

  const text = useMemo(
    () =>
      formatGamePlan(plan, {
        teamName,
        opponentName,
        playerName: displayName,
      }),
    [plan, teamName, opponentName, displayName],
  );

  function handleReshuffle() {
    const next = seed + 1;
    setSeed(next);
    setPlan(project(next));
    setSelected(null);
  }

  function handleTapPeriod(id: string) {
    setActivePeriod(Number(id));
    setSelected(null);
  }

  // Tap a player to arm a swap; tap a second to exchange them within
  // the active period (across zones or on/off the bench). Tapping the
  // armed player again cancels. swapPlayersInPeriod recomputes totals.
  function tapPlayer(pid: string) {
    if (selected === null) {
      setSelected(pid);
      return;
    }
    if (selected === pid) {
      setSelected(null);
      return;
    }
    setPlan((prev) => swapPlayersInPeriod(prev, activePeriod, selected, pid));
    setSelected(null);
  }

  const period = plan.periods[activePeriod];
  const mins = Math.round(plan.periodMinutes);
  const periodNoun =
    plan.periods.length === 1 ? plan.periodLabel : plan.periodLabelPlural;
  const tabs = plan.periods.map((p, i) => ({ id: String(i), label: p.label }));

  // One tappable player row — shared by the group cards and the bench
  // card. Mirrors the LineupPicker row (Guernsey + name + swap glyph)
  // so the swap gesture is the same muscle memory pre-game and here.
  const renderRow = (pid: string) => {
    const p = playerById.get(pid);
    const isSelected = selected === pid;
    return (
      <li key={pid}>
        <button
          type="button"
          onClick={() => tapPlayer(pid)}
          data-testid="game-plan-player"
          className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors duration-fast ease-out-quart ${
            isSelected
              ? "bg-brand-50 ring-2 ring-inset ring-brand-500"
              : "hover:bg-surface-alt"
          }`}
        >
          <Guernsey num={p?.jersey_number ?? ""} size={32} />
          <span className="min-w-0 flex-1 truncate font-medium text-ink">
            {p?.chip && (
              <ChipIndicator
                chipKey={p.chip as ChipKey}
                mode={chipModeByKey[p.chip]}
                className="mr-1.5 align-middle"
              />
            )}
            {p?.full_name ?? pid}
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
  };

  return (
    <Modal size="lg">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight text-ink">
            Game plan
          </h2>
          <p className="mt-0.5 text-xs text-ink-mute">
            {plan.periods.length} {periodNoun} · ~{mins} min each ·
            auto-suggested, tap to tweak
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-ink-mute transition-colors hover:bg-surface-alt hover:text-ink"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Period tabs */}
      <div className="mt-4">
        <SegTabs
          options={tabs}
          value={String(activePeriod)}
          onChange={handleTapPeriod}
          size="sm"
          ariaLabel="Period"
        />
      </div>

      {/* Scrollable body: tap-to-swap editor + the live copy block. */}
      <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto">
        <p className="text-xs leading-relaxed text-ink-dim">
          Tap a player, then tap another to swap them — across groups or
          on/off the bench.
        </p>

        {period && (
          <div className="grid grid-cols-1 gap-3">
            {period.groups.map((g) => (
              <SFCard key={g.groupId} pad={0} className="overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
                  <h3 className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink">
                    {g.groupLabel}
                  </h3>
                  <span className="font-mono text-xs font-semibold tabular-nums text-ink-mute">
                    {g.playerIds.length}
                  </span>
                </div>
                {g.playerIds.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-ink-mute">Empty</p>
                ) : (
                  <ul className="divide-y divide-hairline">
                    {g.playerIds.map(renderRow)}
                  </ul>
                )}
              </SFCard>
            ))}

            {/* Bench */}
            <SFCard pad={0} className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
                <h3 className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink">
                  Bench
                </h3>
                <span className="font-mono text-xs font-semibold tabular-nums text-ink-mute">
                  {period.bench.length}
                </span>
              </div>
              {period.bench.length === 0 ? (
                <p className="px-4 py-3 text-xs text-ink-mute">
                  No one resting this {plan.periodLabel}.
                </p>
              ) : (
                <ul className="divide-y divide-hairline">
                  {period.bench.map(renderRow)}
                </ul>
              )}
            </SFCard>
          </div>
        )}

        {/* Copy block — live-updates as the coach tweaks the rotation. */}
        <div className="border-t border-hairline pt-3">
          <CopyableTextBlock
            title="Plan for the group chat"
            text={text}
            textId="game-plan-text"
            caption="Tweaks above update this text. Tap it to select, or use the button."
          />
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-hairline pt-4">
        <SFButton
          variant="ghost"
          size="sm"
          onClick={handleReshuffle}
          icon={<SFIcon.swap />}
        >
          Reshuffle
        </SFButton>
        <SFButton variant="subtle" size="sm" onClick={onClose}>
          Done
        </SFButton>
      </div>
    </Modal>
  );
}
