"use client";

// ─── LeagueNextSubCard ───────────────────────────────────────
// Mirrors AFL's `SwapCard` collapsed-row look. Sits inline above
// the field during live play to show:
//
//   * A circular timer ring with the countdown to the next sub
//     (counts down from the team's sub-interval, then pulses NOW
//     when zero).
//   * The suggested off-player → on-player pair.
//   * A "Do" button to apply the swap immediately.
//
// Notes:
//   * FR / DH vest wearers are excluded from the off-side by the
//     parent's call to `suggestNextLeagueSub` — they keep the vest
//     for the whole period (laws §12) unless replaced via the
//     forced injury-replacement modal.
//   * Hidden when there's nothing actionable (no bench, paused
//     period, finalised game) — the parent gates `suggestion`.

import type { Player } from "@/lib/types";

interface LeagueNextSubCardProps {
  /** Suggested off/on pair. */
  suggestion: {
    off: { playerId: string; msOnField: number };
    on: { playerId: string; msOnBench: number };
  } | null;
  /** ms remaining until the next sub-due moment. Null when timer not running. */
  msUntilDue: number | null;
  /** Full sub interval ms — sizes the progress ring. */
  subIntervalMs: number | null;
  /** Sub state — "due" triggers a destructive warn ring. */
  due: boolean;
  /** Apply the suggested swap. */
  onApply: () => void;
  /** Pending guard — disables Do button + dims the row. */
  pending: boolean;
  /** Player lookup. */
  playerById: Map<string, Player>;
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

export function LeagueNextSubCard({
  suggestion,
  msUntilDue,
  subIntervalMs,
  due,
  onApply,
  pending,
  playerById,
}: LeagueNextSubCardProps) {
  if (!suggestion) return null;
  const off = playerById.get(suggestion.off.playerId);
  const on = playerById.get(suggestion.on.playerId);
  if (!off || !on) return null;
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
      <div className="flex items-center gap-3 px-3 py-2.5">
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
            {due ? "Sub due" : "Next sub"}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs font-medium text-warm/90">
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/10 font-mono text-[8px] font-bold text-warm/70">
              {initials(off.full_name)}
            </span>
            <span className="truncate text-warm/70">{first(off.full_name)}</span>
            <span className="text-warm/40">→</span>
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-600/40 font-mono text-[8px] font-bold text-brand-200">
              {initials(on.full_name)}
            </span>
            <span className="truncate font-bold text-brand-300">
              {first(on.full_name)}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onApply}
          disabled={pending}
          className="flex-shrink-0 rounded-sm bg-brand-600 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-micro text-white transition-colors duration-fast ease-out-quart hover:bg-brand-500 disabled:opacity-60"
        >
          {pending ? "…" : "Do"}
        </button>
      </div>
    </div>
  );
}
