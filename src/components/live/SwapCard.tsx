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
import { hapticSuccess } from "@/lib/haptics";

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

/**
 * Countdown ring. Counting down: a mint arc on a faint track. Due: a
 * full amber circle around "NOW" — the card's alarm colour, the same
 * amber as the field's OFF chips.
 */
function TimerRing({ msUntilDue, subIntervalMs }: { msUntilDue: number; subIntervalMs: number }) {
  const due = msUntilDue <= 0;
  const progress = Math.max(0, Math.min(1, 1 - msUntilDue / subIntervalMs));
  const r = 17;
  const circ = 2 * Math.PI * r;
  const offset = due ? 0 : circ * (1 - progress);
  return (
    <span className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center" aria-hidden>
      <svg width="40" height="40" viewBox="0 0 40 40" className="absolute inset-0">
        <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="3" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke={due ? "#F2A65A" : "#9ACC9B"}
          strokeWidth="3"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 20 20)"
          style={{ transition: "stroke-dashoffset 400ms linear" }}
        />
      </svg>
      <span
        className={`font-mono font-bold leading-none tabular-nums ${
          due ? "text-[10px] tracking-[0.08em] text-due-dark" : "text-[11px] text-warm"
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

// The swap row's own label: the field tiles' short words, so a 375 px
// phone has room for the names.
const ZONE_ROW_LABELS: Record<string, string> = {
  back: "BCK",
  hback: "H-BCK",
  mid: "CEN",
  hfwd: "H-FWD",
  fwd: "FWD",
};

// Zone labels on the dark card, ≥4.5:1 on ink.
const ZONE_COLOR: Record<Zone, string> = {
  back: "text-zone-b-dark",
  hback: "text-zone-b-dark",
  mid: "text-zone-c-dark",
  hfwd: "text-zone-f-dark",
  fwd: "text-zone-f-dark",
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

// The numbered chip that ties a card row to its tile's "OFF n" chip.
const PAIR_CHIP = "inline-flex flex-shrink-0 items-center justify-center rounded-xs bg-due font-mono font-bold text-white";

/**
 * The sub suggestion card — one event, one voice (design session 17 Oct
 * 2026). The card says WHAT (swap count, countdown, the rows); the field
 * tiles' "OFF n" chips say WHO, numbered to match. When the sub falls
 * due the card itself is the alert: an amber ring, a SUB DUE eyebrow
 * and role="alert" (the separate banner is gone). Collapsed it's one
 * big tap target; open, the header carries a 44pt Collapse button.
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
  // A made swap folds the open card away over 240ms (it used to snap
  // shut) — the card easing back to its counting state.
  const [closing, setClosing] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  useEffect(() => {
    if (swapCount !== prevSwapCountRef.current) {
      prevSwapCountRef.current = swapCount;
      if (openRef.current) {
        setClosing(true);
        const t = window.setTimeout(() => setClosing(false), 240);
        setOpen(false);
        setEditing(null);
        return () => window.clearTimeout(t);
      }
      setOpen(false);
      setEditing(null);
    }
  }, [swapCount]);

  // A committed swap: the success haptic (the tiles hand over on the
  // field).
  function applyAll() {
    void hapticSuccess();
    onApply();
  }

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

  const countLabel = `${valid.length} ${valid.length === 1 ? "swap" : "swaps"}`;

  // Header content shared by both states: ring, eyebrow, sub-line.
  const headerBody = (
    <>
      {timerActive ? (
        <TimerRing msUntilDue={msUntilDue as number} subIntervalMs={subIntervalMs as number} />
      ) : (
        <span
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-sm bg-brand-600 text-white"
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
      <span className="min-w-0 flex-1">
        {isDue ? (
          <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase leading-4 tracking-micro text-due-dark">
            <span
              aria-hidden
              className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-due-dark shadow-[0_0_0_3px_rgba(242,166,90,0.25)]"
            />
            Sub due — {countLabel}
          </span>
        ) : (
          <span className="block font-mono text-[10px] font-bold uppercase leading-4 tracking-micro text-warm/[0.64]">
            Suggested — {countLabel}
          </span>
        )}
        {isDue ? (
          // The banner's copy moved into the card; the list below already
          // names who, so the summary line doesn't repeat it.
          <span className="block text-sm font-medium leading-5 text-warm/[0.92]">
            Rotate a player off
          </span>
        ) : (
          <span className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-sm font-medium leading-5 text-warm/[0.92]">
            {valid.map(({ off, on, index }, i) => (
              <span key={index} className={`flex items-center gap-1.5 ${i > 0 ? "ml-1.5" : ""}`}>
                <span className={`${PAIR_CHIP} h-4 w-4 text-[10px] leading-4`}>{index + 1}</span>
                {first(off.full_name)} → {first(on.full_name)}
              </span>
            ))}
          </span>
        )}
      </span>
    </>
  );

  const chevron = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className={`flex-shrink-0 text-warm/[0.64] transition-transform duration-fast ease-out-quart ${
        open ? "rotate-180" : ""
      }`}
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const rootClass = `overflow-hidden rounded-md bg-ink text-warm transition-shadow duration-fast ease-out-quart ${
    isDue
      ? "shadow-[0_0_0_2px_#A8590F,0_8px_24px_rgba(26,30,26,0.18)]"
      : "shadow-[0_4px_12px_rgba(26,30,26,0.12)]"
  }`;

  const body = (
    <>
      {open ? (
        // Open: the header is a row with its own 44pt Collapse button.
        <div className="flex min-h-14 items-center gap-3 py-2 pl-2 pr-1">
          {headerBody}
          <button
            type="button"
            onClick={() => setOpen(false)}
            data-testid="swapcard-toggle"
            aria-expanded
            aria-label="Collapse"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-sm transition-colors duration-fast ease-out-quart hover:bg-white/[0.06]"
          >
            {chevron}
          </button>
        </div>
      ) : (
        // Collapsed: the whole card is the tap target.
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="swapcard-toggle"
          aria-expanded={false}
          className="flex min-h-14 w-full items-center gap-3 py-2 pl-2 pr-3 text-left transition-colors duration-fast ease-out-quart hover:bg-white/[0.03]"
        >
          {headerBody}
          {chevron}
        </button>
      )}

      {(open || closing) && (
        <div
          className={closing ? "overflow-hidden motion-safe:animate-collapse-y motion-reduce:hidden" : undefined}
          aria-hidden={closing || undefined}
        >
          {pastHooterCarry && (
            <p
              data-testid="swapcard-carry-hint"
              className="px-3 pb-2 font-mono text-[10px] font-semibold uppercase leading-4 tracking-micro text-due-dark"
            >
              Quarter ending — apply now or it carries to the break
            </p>
          )}
          {onOverride && (
            <p className="px-3 pb-2 text-xs leading-4 text-warm/[0.66]">
              Tap a name to change who
            </p>
          )}
          <ul className="flex flex-col gap-1 px-2 pb-2">
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
                  className="rounded-sm bg-white/[0.06]"
                >
                  <div className="flex min-h-14 flex-wrap items-center gap-x-1.5 pl-2.5 pr-1">
                    <span aria-hidden className={`${PAIR_CHIP} h-5 w-5 text-[11px] leading-5`}>
                      {index + 1}
                    </span>
                    <span
                      className={`w-8 flex-shrink-0 font-mono text-[10px] font-bold uppercase tracking-micro ${
                        ZONE_COLOR[s.zone] ?? "text-warm/70"
                      }`}
                    >
                      {ZONE_ROW_LABELS[s.zone] ?? s.zone}
                    </span>
                    {/* Outgoing name — tap to pick a different same-zone field player. */}
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
                      aria-label={`Change who comes off: ${off.full_name}`}
                      className={`min-h-11 rounded-sm px-1 text-[15px] font-medium text-warm/80 ${
                        canOverride ? "underline decoration-warm/40 decoration-dashed underline-offset-[5px]" : ""
                      } ${editingThis("off") ? "bg-white/15" : canOverride ? "hover:bg-white/10" : ""}`}
                    >
                      {first(off.full_name)}
                      {canOverride && " ⌄"}
                    </button>
                    <span aria-hidden className="text-warm/50">→</span>
                    {/* Incoming name — tap to pick a different bench player. */}
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
                      aria-label={`Change who goes on: ${on.full_name}`}
                      className={`min-h-11 rounded-sm px-1 text-[15px] font-semibold text-mint ${
                        canOverride ? "underline decoration-mint/50 decoration-dashed underline-offset-[5px]" : ""
                      } ${editingThis("on") ? "bg-white/15" : canOverride ? "hover:bg-white/10" : ""}`}
                    >
                      {first(on.full_name)}
                      {canOverride && " ⌄"}
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
                        className="flex flex-shrink-0 items-center gap-0.5 rounded-full bg-mint/15 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-micro text-mint transition-colors duration-fast ease-out-quart hover:bg-mint/25 motion-safe:active:scale-[0.97]"
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
                    <span className="flex-1" />
                    {/* Per-row Make swap only earns its place with 2+ swaps
                        (with one it duplicated the footer). A ghost button —
                        the footer is the card's one green action. */}
                    {onApplyOne && valid.length > 1 && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={(e) => {
                          e.stopPropagation();
                          void hapticSuccess();
                          onApplyOne(s);
                        }}
                        className="min-h-11 flex-shrink-0 whitespace-nowrap rounded-sm bg-white/10 px-3 font-mono text-[11px] font-bold text-warm transition-colors duration-fast ease-out-quart hover:bg-white/15 disabled:opacity-60"
                      >
                        {pending ? "…" : "Make swap"}
                      </button>
                    )}
                  </div>

                  {/* Inline override picker — opens under the tapped name. */}
                  {editing?.index === index && (
                    <div className="border-t border-white/10 px-2.5 py-2">
                      <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-micro text-warm/[0.66]">
                        {editing.side === "on"
                          ? "Bring on instead"
                          : `Take off instead (${ZONE_LABELS[s.zone] ?? s.zone})`}
                      </p>
                      {options.length === 0 ? (
                        <p className="text-xs text-warm/[0.66]">No other option.</p>
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
                                className={`flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors duration-fast ease-out-quart ${
                                  selected
                                    ? "bg-brand-600 text-white"
                                    : "bg-white/10 text-warm/80 hover:bg-white/20"
                                } motion-safe:active:scale-[0.97]`}
                              >
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/20 font-mono text-[8px] font-bold">
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
          <div className="border-t border-white/[0.08] p-2">
            <button
              type="button"
              onClick={applyAll}
              disabled={pending}
              data-testid="swapcard-apply-all"
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-sm bg-brand-600 text-[15px] font-bold text-white transition-colors duration-fast ease-out-quart hover:bg-brand-500 disabled:opacity-60"
            >
              {pending ? (
                <PulseDot size="sm" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
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
                  : `Make all ${valid.length} swaps`}
            </button>
          </div>
        </div>
      )}
    </>
  );

  // Due: the card IS the alert (the banner it replaces carried
  // role="alert"), so there's exactly one on screen.
  return isDue ? (
    <section role="alert" aria-label="Sub due" className={rootClass}>
      {body}
    </section>
  ) : (
    <div className={rootClass}>{body}</div>
  );
}
