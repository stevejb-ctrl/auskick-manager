"use client";

import { useEffect, useState } from "react";
import type { Player, Zone } from "@/lib/types";
import type { SwapSuggestion } from "@/lib/fairness";

interface SwapCardProps {
  suggestions: SwapSuggestion[];
  playersById: Map<string, Player>;
  onApply: () => void;
  onApplyOne?: (s: SwapSuggestion) => void;
  pending: boolean;
  subState: "idle" | "soft" | "due";
  /** When true, start expanded — used when a sub is due so the detail is immediately visible. */
  forceOpen?: boolean;
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
}: SwapCardProps) {
  const [open, setOpen] = useState(forceOpen ?? false);

  // Re-open automatically when a sub becomes due.
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  const valid = suggestions
    .map((s) => {
      const off = playersById.get(s.off_player_id);
      const on = playersById.get(s.on_player_id);
      return off && on ? { s, off, on } : null;
    })
    .filter((x): x is { s: SwapSuggestion; off: Player; on: Player } => x !== null);

  if (valid.length === 0) return null;

  const isDue = subState === "due";

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
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] font-bold uppercase tracking-micro text-warm/60">
            {isDue ? "Sub due — " : "Suggested — "}
            {valid.length} {valid.length === 1 ? "swap" : "swaps"}
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
