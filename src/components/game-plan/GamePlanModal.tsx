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
  /**
   * Plan-ahead seed (F1/F2). When set, the editor opens on THIS plan
   * instead of a cold from-scratch projection — the live game hands over
   * a `projectUpcomingRotation` plan anchored to the current on-field
   * reality. Reshuffle still rerolls a fresh from-scratch projection.
   */
  initialPlan?: GamePlan;
  /**
   * Period tab to open on. Pre-game callers open on period 0; the live
   * plan-ahead entry opens on the period the coach is editing.
   */
  initialPeriodIndex?: number;
  /**
   * When provided, the planner is in "plan ahead" mode: it renders a
   * primary pin button (label = `pinLabel`) that hands the edited plan
   * back to the live game and closes. The pre-game caller omits this, so
   * it keeps its copy-for-chat-only footer.
   */
  onPin?: (plan: GamePlan) => void;
  /** Label for the pin button when `onPin` is set. Defaults to "Use this plan". */
  pinLabel?: string;
  /**
   * Per-player game context shown on each row so the coach can plan the
   * next period with the same info they'd see at the break: total minutes
   * played this game + a per-zone/position breakdown (Steve 2026-06-29).
   * Caller-shaped (it owns the zone labels) so the modal stays
   * sport-agnostic. Omit to render rows without stats (pre-game).
   */
  playerStats?: Record<
    string,
    { totalMs: number; zones: { label: string; ms: number }[] }
  >;
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
  initialPlan,
  initialPeriodIndex = 0,
  onPin,
  pinLabel = "Use this plan",
  playerStats,
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
  // Seed from the handed-over plan-ahead projection when present, else a
  // fresh from-scratch projection (pre-game).
  const [plan, setPlan] = useState<GamePlan>(
    () => initialPlan ?? project(initialSeed),
  );
  const [activePeriod, setActivePeriod] = useState(initialPeriodIndex);
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
  const cadence =
    plan.rotatesWithinPeriod && plan.subIntervalSeconds
      ? ` · subs ~every ${Math.round(plan.subIntervalSeconds / 60)} min`
      : "";
  const tabs = plan.periods.map((p, i) => ({ id: String(i), label: p.label }));

  // Compact m:ss for the per-player game-context line.
  const fmtMs = (ms: number) => {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  };

  // One tappable player row — shared by the group cards and the bench
  // card. Mirrors the LineupPicker row (Guernsey + name + swap glyph)
  // so the swap gesture is the same muscle memory pre-game and here.
  const renderRow = (pid: string) => {
    const p = playerById.get(pid);
    const isSelected = selected === pid;
    const stats = playerStats?.[pid];
    return (
      <li key={pid}>
        <button
          type="button"
          onClick={() => tapPlayer(pid)}
          data-testid="game-plan-player"
          className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors duration-fast ease-out-quart ${
            isSelected
              ? "bg-brand-50 ring-2 ring-inset ring-brand-500"
              : "hover:bg-surface-alt"
          }`}
        >
          <Guernsey num={p?.jersey_number ?? ""} size={32} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium text-ink">
              {p?.chip && (
                <ChipIndicator
                  chipKey={p.chip as ChipKey}
                  mode={chipModeByKey[p.chip]}
                  className="mr-1.5 align-middle"
                />
              )}
              {p?.full_name ?? pid}
            </span>
            {/* Game context (issue: plan the next period with break-level
                info) — total minutes + per-zone breakdown this game. */}
            {stats && (
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-mute">
                <span className="font-mono font-semibold tabular-nums text-ink-dim">
                  {fmtMs(stats.totalMs)}
                </span>
                {stats.zones
                  .filter((z) => z.ms > 0)
                  .map((z) => (
                    <span key={z.label} className="tabular-nums">
                      <span className="text-ink-mute">{z.label}</span>{" "}
                      {fmtMs(z.ms)}
                    </span>
                  ))}
                {stats.totalMs === 0 && (
                  <span className="italic">no field time yet</span>
                )}
              </span>
            )}
          </span>
          {isSelected ? (
            <span className="self-start font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-alarm">
              Swapping…
            </span>
          ) : (
            <span className="self-start text-ink-mute opacity-60">
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
            {plan.periods.length} {periodNoun} · ~{mins} min each{cadence} ·
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
            {/* AFL reads top-to-bottom forward → centre → back to match
                the coach's field mental model (and the QuarterBreak
                lineup order). The projector emits zones back-first, so
                reverse for AFL; other sports keep their canonical order
                (netball positions / RL forwards→backs). Issue 7. */}
            {(sport === "afl" ? [...period.groups].reverse() : period.groups).map((g) => (
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

            {/* Bench / interchange queue */}
            <SFCard pad={0} className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
                <div className="min-w-0">
                  <h3 className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink">
                    {plan.rotatesWithinPeriod ? "Interchange" : "Bench"}
                  </h3>
                  {plan.rotatesWithinPeriod && period.bench.length > 0 && (
                    <p className="mt-0.5 text-[10px] text-ink-mute">
                      Rotates on in this order — first on top
                    </p>
                  )}
                </div>
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
                  {period.bench.map((pid) => renderRow(pid))}
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
        {onPin ? (
          // Plan-ahead mode (F1/F2): Reshuffle is suppressed — it rerolls a
          // full from-scratch projection, which would unanchor period[0]
          // from the live field and re-introduce the periods we sliced
          // away. The coach tweaks tap-to-swap instead. Left slot becomes
          // a plain Cancel so they can back out without pinning.
          <SFButton variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </SFButton>
        ) : (
          <SFButton
            variant="ghost"
            size="sm"
            onClick={handleReshuffle}
            icon={<SFIcon.swap />}
          >
            Reshuffle
          </SFButton>
        )}
        {onPin ? (
          // Pin the edited plan back to the live game, then close. Primary
          // so it reads as the commit action.
          <SFButton
            variant="primary"
            size="sm"
            data-testid="game-plan-pin"
            onClick={() => {
              onPin(plan);
              onClose();
            }}
          >
            {pinLabel}
          </SFButton>
        ) : (
          <SFButton variant="subtle" size="sm" onClick={onClose}>
            Done
          </SFButton>
        )}
      </div>
    </Modal>
  );
}
