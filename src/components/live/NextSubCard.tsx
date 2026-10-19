"use client";

// ─── NextSubCard ─────────────────────────────────────────────
// The upcoming rotation, in every sport that subs during a period
// without AFL's SwapCard: league and union, and Football (soccer).
// Mirrors AFL `SwapCard`'s shape: dark ink card with a TimerRing and a
// collapsible per-pair list, so the coach can rotate the whole bench in
// one tap. Each sport passes its pairs with its own line label.
//
// Collapsed: timer ring + "Sub due / Suggested — N swaps" + a summary
// line (Charlie→John · Bea→Eva …). Expanded: per-pair rows with "Make
// swap" each, and a full-width "Make all N swaps".
//
// Extracted from league's LeagueNextSubCard (CLAUDE.md: reuse before
// you fork) when soccer needed the same card.

import { useEffect, useState } from "react";
import type { Player } from "@/lib/types";
import { trackSuggestedSub } from "@/lib/analytics/game-day";
import type { AnalyticsSport } from "@/lib/analytics/events";

export interface NextSubPair {
  offId: string;
  onId: string;
  /** Where the kid coming on plays, e.g. "FWD", "DEF". */
  label: string;
  /** Text colour class for the label on the dark card. */
  labelClass: string;
}

interface NextSubCardProps {
  /** For analytics (sub_made): which sport's game this is. */
  sport: AnalyticsSport;
  pairs: NextSubPair[];
  /** ms until the next sub is due. Null when the timer isn't running. */
  msUntilDue: number | null;
  /** The interval the ring counts down (sub interval, or time to the window). */
  subIntervalMs: number | null;
  /** Sub due: a warn ring, and the card opens. */
  due: boolean;
  onApplyAll: () => void;
  /** Apply one pair (a partial rotation). */
  onApplyOne?: (index: number) => void;
  pending: boolean;
  playerById: Map<string, Player>;
  /** Prefix for each pair row's test id: `${prefix}-${i}`. */
  pairTestIdPrefix: string;
}

function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function first(name: string): string {
  return name.split(" ")[0];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

function TimerRing({
  msUntilDue,
  subIntervalMs,
  due,
}: {
  msUntilDue: number;
  subIntervalMs: number;
  due: boolean;
}) {
  const progress = Math.max(0, Math.min(1, 1 - msUntilDue / subIntervalMs));
  const r = 12;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - progress);
  const ringColor = due ? "#FFB366" : "#7CAA7D";
  return (
    <span
      className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center"
      aria-hidden
    >
      <svg width="32" height="32" viewBox="0 0 32 32" className="absolute inset-0">
        <circle
          cx="16"
          cy="16"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="2.5"
        />
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

export function NextSubCard({
  sport,
  pairs,
  msUntilDue,
  subIntervalMs,
  due,
  onApplyAll,
  onApplyOne,
  pending,
  playerById,
  pairTestIdPrefix,
}: NextSubCardProps) {
  const [open, setOpen] = useState(due);
  // When the sub-due window opens, auto-expand so the coach can see
  // the full list. AFL's SwapCard does the same.
  useEffect(() => {
    if (due) setOpen(true);
  }, [due]);

  // Skip any pair with a missing player (defensive).
  const valid = pairs
    .map((s, index) => {
      const off = playerById.get(s.offId);
      const on = playerById.get(s.onId);
      return off && on ? { s, off, on, index } : null;
    })
    .filter((x): x is { s: NextSubPair; off: Player; on: Player; index: number } => x !== null);
  if (valid.length === 0) return null;

  const timerActive
    = msUntilDue !== null
    && msUntilDue !== undefined
    && subIntervalMs !== null
    && subIntervalMs > 0;
  return (
    <div
      className={`overflow-hidden rounded-md bg-ink text-warm shadow-card transition-shadow duration-fast ease-out-quart ${
        due ? "ring-2 ring-warn" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-fast ease-out-quart hover:bg-white/[0.03]"
        aria-expanded={open}
      >
        {timerActive ? (
          <TimerRing
            msUntilDue={msUntilDue as number}
            subIntervalMs={subIntervalMs as number}
            due={due}
          />
        ) : (
          <span
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm bg-brand-600 text-white"
            aria-hidden
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M7 16l-4-4 4-4M17 8l4 4-4 4M3 12h18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] font-bold uppercase tracking-micro text-warm/60">
            {due ? "Sub due" : "Suggested"} — {valid.length}{" "}
            {valid.length === 1 ? "swap" : "swaps"}
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
            {valid.map(({ s, off, on, index }, i) => (
              // As AFL's SwapCard: on a phone Make swap wraps to its own
              // line before the names are cut ("Bren… → Qu…" at 375 px),
              // and the initials show from sm up.
              <li
                key={s.onId}
                data-testid={`${pairTestIdPrefix}-${i}`}
                className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-sm bg-white/5 px-2.5 py-2"
              >
                <span
                  className={`w-12 font-mono text-[9px] font-bold uppercase tracking-micro ${s.labelClass}`}
                >
                  {s.label}
                </span>
                <span className="flex min-w-0 flex-auto items-center gap-1.5">
                  <span className="hidden h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/10 font-mono text-[8px] font-bold text-warm/70 sm:flex">
                    {initials(off.full_name)}
                  </span>
                  <span className="truncate text-xs font-semibold text-warm/70">
                    {first(off.full_name)}
                  </span>
                  <span className="text-warm/40">→</span>
                  <span className="hidden h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-600/40 font-mono text-[8px] font-bold text-brand-200 sm:flex">
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
                      trackSuggestedSub(sport, due, 1);
                      onApplyOne(index);
                      // Collapse after a single-pair commit — mirrors
                      // AFL's SwapCard which closes on any commit so
                      // the coach can see the field update immediately.
                      setOpen(false);
                    }}
                    className="ml-auto flex-shrink-0 rounded-sm bg-brand-600 px-2.5 py-1 font-mono text-[11px] font-bold text-white transition-colors duration-fast ease-out-quart hover:bg-brand-500 disabled:opacity-60"
                  >
                    {pending ? "…" : "Make swap"}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="border-t border-white/10 bg-white/[0.03] px-3 py-3">
            <button
              type="button"
              onClick={() => {
                trackSuggestedSub(sport, due, valid.length);
                onApplyAll();
                // Collapse the card so the coach sees the field
                // update straight away — mirrors AFL's SwapCard.
                setOpen(false);
              }}
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
                : valid.length === 1
                  ? "Make this swap"
                  : `Make all ${valid.length} swaps`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
