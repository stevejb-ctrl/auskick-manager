"use client";

import { useEffect, useRef, useState } from "react";
import type { Lineup, Player, Zone } from "@/lib/types";
import type { SwapSuggestion } from "@/lib/fairness";
import {
  applyInlineSwapOverride,
  eligibleOffReplacements,
  eligibleOnReplacements,
  isPairEdited,
} from "@/lib/game-plan";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import { PulseDot } from "@/components/ui/PulseDot";

interface SwapCardProps {
  suggestions: SwapSuggestion[];
  /**
   * The engine's auto pick for this sub-due moment, ignoring any pin.
   * Drives the per-pair "Edited" badge and the revert-to-auto action.
   */
  autoSuggestions: SwapSuggestion[];
  playersById: Map<string, Player>;
  /** Live lineup (on-field zones + bench) — feeds the inline override pickers. */
  lineup: Lineup;
  /** Players currently injured (excluded from the override pickers). */
  injuredIds: readonly string[];
  /** Players currently loaned out (excluded from the override pickers). */
  loanedIds: readonly string[];
  /** Players locked to their spot (excluded from the override pickers). */
  lockedIds: readonly string[];
  onApply: () => void;
  onApplyOne?: (s: SwapSuggestion) => void;
  /**
   * Commit an inline override. Receives the FULL edited swap array; the
   * live game pins it (or clears the pin when it matches the auto pick)
   * via the SAME plannedRotation slice the Plan-Ahead planner writes.
   */
  onOverride?: (nextSwaps: SwapSuggestion[]) => void;
  pending: boolean;
  subState: "idle" | "soft" | "due";
  /** When true, start expanded — used when a sub is due so the detail is immediately visible. */
  forceOpen?: boolean;
  /** Ms until next sub is due. null when the timer isn't running (pre-game / quarter break). */
  msUntilDue?: number | null;
  /** Full sub interval in ms — used to size the progress ring. */
  subIntervalMs?: number;
  /**
   * The next sub falls past the hooter but a pin is active — the card
   * stays visible so the coach can apply it now or let it carry to the
   * break. Drives the carry hint.
   */
  pastHooterCarry?: boolean;
}

function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/** Small ring + countdown badge — merged from the old NextSubBar. */
function TimerRing({ msUntilDue, subIntervalMs }: { msUntilDue: number; subIntervalMs: number }) {
  const due = msUntilDue <= 0;
  const progress = Math.max(0, Math.min(1, 1 - msUntilDue / subIntervalMs));
  const r = 12;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - progress);
  const ringColor = due ? "#FFB366" : "#7CAA7D";
  return (
    <span className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center" aria-hidden>
      <svg width="32" height="32" viewBox="0 0 32 32" className="absolute inset-0">
        <circle cx="16" cy="16" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" />
        <circle
          cx="16"
          cy="16"
          r={r}
          fill="none"
          stroke={ringColor}
          strokeWidth="2.5"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 16 16)"
          style={{ transition: "stroke-dashoffset 400ms linear" }}
        />
      </svg>
      <span
        className={`nums font-mono text-[9px] font-bold leading-none ${
          due ? "animate-pulse text-warn" : "text-warm"
        }`}
      >
        {due ? "NOW" : formatCountdown(msUntilDue)}
      </span>
    </span>
  );
}

const ZONE_LABELS: Record<string, string> = {
  back: "BACK",
  hback: "H-BACK",
  mid: "CENTRE",
  hfwd: "H-FWD",
  fwd: "FORWARD",
};

const ZONE_COLOR: Record<Zone, string> = {
  back: "text-zone-b",
  hback: "text-zone-b",
  mid: "text-zone-c",
  hfwd: "text-zone-f",
  fwd: "text-zone-f",
};

function first(name: string): string {
  return name.split(" ")[0];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

/**
 * Collapsible engine-suggestion card. Sits inline in the page, above the Field.
 * Collapsed → sparkle icon + swap summary.
 * Expanded  → per-pair rows with avatars, one-pair "Do" buttons, and a full
 * "Do all N swaps" primary action.
 */
export function SwapCard({
  suggestions,
  autoSuggestions,
  playersById,
  lineup,
  injuredIds,
  loanedIds,
  lockedIds,
  onApply,
  onApplyOne,
  onOverride,
  pending,
  subState,
  forceOpen,
  msUntilDue,
  subIntervalMs,
  pastHooterCarry,
}: SwapCardProps) {
  const [open, setOpen] = useState(forceOpen ?? false);
  // Which chip's inline override picker is open. null = none.
  const [editing, setEditing] = useState<{ index: number; side: "on" | "off" } | null>(
    null,
  );
  const swapCount = useLiveGame((s) => s.swapCount);
  const prevSwapCountRef = useRef(swapCount);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  useEffect(() => {
    if (swapCount !== prevSwapCountRef.current) {
      prevSwapCountRef.current = swapCount;
      setOpen(false);
      setEditing(null);
    }
  }, [swapCount]);

  // Override one chip of pair `index` to `playerId`, then close the
  // picker. The full edited array goes to the live game, which pins it
  // (or clears the pin when it matches the engine pick).
  function commitOverride(index: number, side: "on" | "off", playerId: string) {
    setEditing(null);
    if (!onOverride) return;
    const current = suggestions[index];
    if (!current) return;
    const isNoop =
      side === "on"
        ? current.on_player_id === playerId
        : current.off_player_id === playerId;
    if (isNoop) return;
    onOverride(
      applyInlineSwapOverride(suggestions, index, { [side]: playerId }),
    );
  }

  // Revert pair `index` back to the engine's auto pick. When every pair
  // then matches auto, the live game clears the pin entirely.
  function revertPair(index: number) {
    setEditing(null);
    if (!onOverride) return;
    const auto = autoSuggestions[index];
    if (!auto) return;
    onOverride(
      applyInlineSwapOverride(suggestions, index, {
        off: auto.off_player_id,
        on: auto.on_player_id,
      }),
    );
  }

  // Keep the ORIGINAL suggestions index on each valid row so inline
  // overrides edit the right pair even when an unrenderable pair is
  // filtered out.
  const valid = suggestions
    .map((s, index) => {
      const off = playersById.get(s.off_player_id);
      const on = playersById.get(s.on_player_id);
      return off && on ? { s, off, on, index } : null;
    })
    .filter(
      (x): x is { s: SwapSuggestion; off: Player; on: Player; index: number } =>
        x !== null,
    );

  const timerActive = msUntilDue !== null && msUntilDue !== undefined && subIntervalMs && subIntervalMs > 0;
  const isDue = subState === "due";

  // Only render when there are actual sub suggestions — an idle countdown
  // without any suggested swaps isn't worth the screen real estate.
  if (valid.length === 0) return null;

  return (
    <div
      className={`overflow-hidden rounded-md bg-ink text-warm shadow-card transition-shadow duration-fast ease-out-quart ${
        isDue ? "ring-2 ring-warn" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="swapcard-toggle"
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-fast ease-out-quart hover:bg-white/[0.03]"
        aria-expanded={open}
      >
        {timerActive ? (
          <TimerRing msUntilDue={msUntilDue as number} subIntervalMs={subIntervalMs as number} />
        ) : (
          <span
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm bg-brand-600 text-white"
            aria-hidden
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 3l2.09 6.26L20 11l-5.91 1.74L12 19l-2.09-6.26L4 11l5.91-1.74L12 3z"
                fill="currentColor"
              />
            </svg>
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] font-bold uppercase tracking-micro text-warm/60">
            {isDue ? "Sub due" : "Suggested"} — {valid.length} {valid.length === 1 ? "swap" : "swaps"}
          </p>
          <p className="truncate text-xs font-medium text-warm/90">
            {valid
              .map(({ off, on }) => `${first(off.full_name)}→${first(on.full_name)}`)
              .join(" · ")}
          </p>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          className={`flex-shrink-0 text-warm/60 transition-transform duration-fast ease-out-quart ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <>
          {pastHooterCarry && (
            <p
              data-testid="swapcard-carry-hint"
              className="px-3 pt-2 font-mono text-[10px] font-semibold uppercase tracking-micro text-warn/90"
            >
              Quarter ending — apply now or it carries to the break
            </p>
          )}
          {onOverride && (
            <p className="px-3 pt-2 text-[10px] text-warm/50">
              Tap a name to change who
            </p>
          )}
          <ul className="space-y-1.5 px-3 pb-3 pt-2">
            {valid.map(({ s, off, on, index }) => {
              const edited = isPairEdited(s, autoSuggestions);
              const canOverride = !!onOverride;
              const editingThis = (side: "on" | "off") =>
                editing?.index === index && editing.side === side;
              const options =
                editing?.index === index
                  ? (editing.side === "on"
                      ? eligibleOnReplacements({
                          swaps: suggestions,
                          pairIndex: index,
                          lineup,
                          injuredIds,
                          loanedIds,
                          lockedIds,
                        })
                      : eligibleOffReplacements({
                          swaps: suggestions,
                          pairIndex: index,
                          lineup,
                          injuredIds,
                          loanedIds,
                          lockedIds,
                        }))
                  : [];
              return (
                <li
                  key={`${s.zone}-${s.off_player_id}-${index}`}
                  className="rounded-sm bg-white/5"
                >
                  <div className="flex items-center gap-2 px-2.5 py-2">
                    <span
                      aria-hidden
                      className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-white/10 font-mono text-[9px] font-bold tabular-nums text-warm/70"
                    >
                      {index + 1}
                    </span>
                    <span
                      className={`w-[48px] font-mono text-[9px] font-bold uppercase tracking-micro ${
                        ZONE_COLOR[s.zone] ?? "text-warm/70"
                      }`}
                    >
                      {ZONE_LABELS[s.zone] ?? s.zone}
                    </span>
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      {/* Outgoing chip — tap to pick a different same-zone field player. */}
                      <button
                        type="button"
                        data-testid={`swap-pair-${index}-off`}
                        disabled={!canOverride}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing((cur) =>
                            cur?.index === index && cur.side === "off"
                              ? null
                              : { index, side: "off" },
                          );
                        }}
                        className={`flex min-w-0 items-center gap-1.5 rounded-sm px-1 py-0.5 transition-colors duration-fast ease-out-quart ${
                          editingThis("off")
                            ? "bg-white/15 ring-1 ring-inset ring-warm/40"
                            : canOverride
                              ? "hover:bg-white/10"
                              : ""
                        }`}
                      >
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/10 font-mono text-[8px] font-bold text-warm/70">
                          {initials(off.full_name)}
                        </span>
                        {/* Dashed underline + chevron = "this is editable".
                            The chips were secretly tappable but rendered as
                            static labels (UX review #6, Steve 2026-07-08). */}
                        <span
                          className={`truncate text-xs font-semibold text-warm/70 ${
                            canOverride
                              ? "border-b border-dashed border-warm/40 pb-px"
                              : ""
                          }`}
                        >
                          {first(off.full_name)}
                        </span>
                        {canOverride && (
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" aria-hidden className="flex-shrink-0 text-warm/50">
                            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                      <span className="text-warm/40">→</span>
                      {/* Incoming chip — tap to pick a different bench player. */}
                      <button
                        type="button"
                        data-testid={`swap-pair-${index}-on`}
                        disabled={!canOverride}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing((cur) =>
                            cur?.index === index && cur.side === "on"
                              ? null
                              : { index, side: "on" },
                          );
                        }}
                        className={`flex min-w-0 items-center gap-1.5 rounded-sm px-1 py-0.5 transition-colors duration-fast ease-out-quart ${
                          editingThis("on")
                            ? "bg-white/15 ring-1 ring-inset ring-brand-300/50"
                            : canOverride
                              ? "hover:bg-white/10"
                              : ""
                        }`}
                      >
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-600/40 font-mono text-[8px] font-bold text-brand-200">
                          {initials(on.full_name)}
                        </span>
                        <span
                          className={`truncate text-xs font-bold text-brand-300 ${
                            canOverride
                              ? "border-b border-dashed border-brand-300/50 pb-px"
                              : ""
                          }`}
                        >
                          {first(on.full_name)}
                        </span>
                        {canOverride && (
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" aria-hidden className="flex-shrink-0 text-brand-300/70">
                            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                      {edited && (
                        <button
                          type="button"
                          data-testid={`swap-pair-${index}-edited`}
                          onClick={(e) => {
                            e.stopPropagation();
                            revertPair(index);
                          }}
                          title="You set this — tap to revert to the auto pick"
                          className="flex flex-shrink-0 items-center gap-0.5 rounded-full bg-brand-300/15 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-micro text-brand-200 transition-colors duration-fast ease-out-quart hover:bg-brand-300/25"
                        >
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path
                              d="M12 2a5 5 0 00-5 5v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-1V7a5 5 0 00-5-5z"
                              fill="currentColor"
                            />
                          </svg>
                          Edited
                        </button>
                      )}
                    </span>
                    {/* Per-row "Do" only earns its place with 2+ swaps —
                        with a single swap it duplicated the footer button
                        (UX review #6, Steve 2026-07-08). */}
                    {onApplyOne && valid.length > 1 && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={(e) => {
                          e.stopPropagation();
                          onApplyOne(s);
                        }}
                        className="flex-shrink-0 rounded-sm bg-brand-600 px-2.5 py-1 font-mono text-[11px] font-bold text-white transition-colors duration-fast ease-out-quart hover:bg-brand-500 disabled:opacity-60"
                      >
                        {pending ? "…" : "Do"}
                      </button>
                    )}
                  </div>

                  {/* Inline override picker — opens under the tapped chip. */}
                  {editing?.index === index && (
                    <div className="border-t border-white/10 px-2.5 py-2">
                      <p className="mb-1.5 font-mono text-[9px] font-bold uppercase tracking-micro text-warm/50">
                        {editing.side === "on"
                          ? "Bring on instead"
                          : `Take off instead (${ZONE_LABELS[s.zone] ?? s.zone})`}
                      </p>
                      {options.length === 0 ? (
                        <p className="text-[11px] text-warm/40">No other option.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {options.map((pid) => {
                            const p = playersById.get(pid);
                            const selected =
                              editing.side === "on"
                                ? s.on_player_id === pid
                                : s.off_player_id === pid;
                            return (
                              <button
                                key={pid}
                                type="button"
                                data-testid={`swap-option-${pid}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  commitOverride(index, editing.side, pid);
                                }}
                                className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold transition-colors duration-fast ease-out-quart ${
                                  selected
                                    ? "bg-brand-600 text-white"
                                    : "bg-white/10 text-warm/80 hover:bg-white/20"
                                }`}
                              >
                                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-black/20 font-mono text-[7px] font-bold">
                                  {p ? initials(p.full_name) : "?"}
                                </span>
                                {p ? first(p.full_name) : pid}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="border-t border-white/10 bg-white/[0.03] px-3 py-3">
            <button
              type="button"
              onClick={onApply}
              disabled={pending}
              data-testid="swapcard-apply-all"
              className="flex w-full items-center justify-center gap-2 rounded-sm bg-brand-600 py-2.5 text-sm font-bold text-white transition-colors duration-fast ease-out-quart hover:bg-brand-500 disabled:opacity-60"
            >
              {pending ? (
                <PulseDot size="sm" />
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M7 16l-4-4 4-4M17 8l4 4-4 4M3 12h18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {pending
                ? "Applying…"
                : valid.length === 1
                  ? "Make this swap"
                  : `Do all ${valid.length} swaps`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
