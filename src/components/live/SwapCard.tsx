"use client";

import { useEffect, useRef, useState } from "react";
import type { Player, Zone } from "@/lib/types";
import type { SwapSuggestion } from "@/lib/fairness";
import { useLiveGame } from "@/lib/stores/liveGameStore";

interface SwapCardProps {
  suggestions: SwapSuggestion[];
  playersById: Map<string, Player>;
  onApply: () => void;
  onApplyOne?: (s: SwapSuggestion) => void;
  pending: boolean;
  subState: "idle" | "soft" | "due";
  /** When true, start expanded — used when a sub is due so the detail is immediately visible. */
  forceOpen?: boolean;
  /** Ms until next sub is due. null when the timer isn't running (pre-game / quarter break). */
  msUntilDue?: number | null;
  /** Full sub interval in ms — used to size the progress ring. */
  subIntervalMs?: number;
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
  playersById,
  onApply,
  onApplyOne,
  pending,
  subState,
  forceOpen,
  msUntilDue,
  subIntervalMs,
}: SwapCardProps) {
  const [open, setOpen] = useState(forceOpen ?? false);
  const swapCount = useLiveGame((s) => s.swapCount);
  const prevSwapCountRef = useRef(swapCount);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  useEffect(() => {
    if (swapCount !== prevSwapCountRef.current) {
      prevSwapCountRef.current = swapCount;
      setOpen(false);
    }
  }, [swapCount]);

  const valid = suggestions
    .map((s) => {
      const off = playersById.get(s.off_player_id);
      const on = playersById.get(s.on_player_id);
      return off && on ? { s, off, on } : null;
    })
    .filter((x): x is { s: SwapSuggestion; off: Player; on: Player } => x !== null);

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
          <ul className="space-y-1.5 px-3 pb-3">
            {valid.map(({ s, off, on }) => (
              <li
                key={s.on_player_id}
                className="flex items-center gap-2 rounded-sm bg-white/5 px-2.5 py-2"
              >
                <span
                  className={`w-[52px] font-mono text-[9px] font-bold uppercase tracking-micro ${
                    ZONE_COLOR[s.zone] ?? "text-warm/70"
                  }`}
                >
                  {ZONE_LABELS[s.zone] ?? s.zone}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/10 font-mono text-[8px] font-bold text-warm/70">
                    {initials(off.full_name)}
                  </span>
                  <span className="truncate text-xs font-semibold text-warm/70">
                    {first(off.full_name)}
                  </span>
                  <span className="text-warm/40">→</span>
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-600/40 font-mono text-[8px] font-bold text-brand-200">
                    {initials(on.full_name)}
                  </span>
                  <span className="truncate text-xs font-bold text-brand-300">
                    {first(on.full_name)}
                  </span>
                </span>
                {onApplyOne && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={(e) => {
                      e.stopPropagation();
                      onApplyOne(s);
                    }}
                    className="flex-shrink-0 rounded-sm bg-brand-600 px-2.5 py-1 font-mono text-[11px] font-bold text-white transition-colors duration-fast ease-out-quart hover:bg-brand-500 disabled:opacity-60"
                  >
                    Do
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="border-t border-white/10 bg-white/[0.03] px-3 py-3">
            <button
              type="button"
              onClick={onApply}
              disabled={pending}
              className="flex w-full items-center justify-center gap-2 rounded-sm bg-brand-600 py-2.5 text-sm font-bold text-white transition-colors duration-fast ease-out-quart hover:bg-brand-500 disabled:opacity-60"
            >
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
              {pending
                ? "Applying…"
                : `Do all ${valid.length} swap${valid.length > 1 ? "s" : ""}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
