"use client";

import type { Player, Zone } from "@/lib/types";
import type { SwapSuggestion } from "@/lib/fairness";

const ZONE_LABELS: Record<string, string> = {
  back: "Back",
  hback: "HBack",
  mid: "Mid",
  hfwd: "HFwd",
  fwd: "Fwd",
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

interface SubDueModalProps {
  suggestions: SwapSuggestion[];
  playersById: Map<string, Player>;
  onApply: () => void;
  onApplyOne: (s: SwapSuggestion) => void;
  onAcknowledge: () => void;
  onSnooze: () => void;
  pending?: boolean;
}

/**
 * Engine-suggestion modal ("suggestion card" from the design system).
 * Dark ink background with a sparkle icon, zone-coloured labels, and
 * per-pair "Do" buttons plus a "Do all N swaps" primary action.
 */
export function SubDueModal({
  suggestions,
  playersById,
  onApply,
  onApplyOne,
  onAcknowledge,
  onSnooze,
  pending,
}: SubDueModalProps) {
  const valid = suggestions
    .map((s) => {
      const off = playersById.get(s.off_player_id);
      const on = playersById.get(s.on_player_id);
      return off && on ? { s, off, on } : null;
    })
    .filter((x): x is { s: SwapSuggestion; off: Player; on: Player } => x !== null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sub-due-title"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-xl bg-ink text-warm shadow-modal">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm bg-brand-600 text-white" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 3l2.09 6.26L20 11l-5.91 1.74L12 19l-2.09-6.26L4 11l5.91-1.74L12 3z" fill="currentColor" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p
              id="sub-due-title"
              className="font-mono text-[10px] font-bold uppercase tracking-micro text-warm/60"
            >
              Suggested — {valid.length} {valid.length === 1 ? "swap" : "swaps"}
            </p>
            <p className="truncate text-xs font-medium text-warm/90">
              {valid.length > 0
                ? valid.map(({ off, on }) => `${first(off.full_name)}→${first(on.full_name)}`).join(" · ")
                : "No swaps available"}
            </p>
          </div>
        </div>

        {valid.length > 0 ? (
          <>
            {/* Per-pair rows */}
            <ul className="space-y-1.5 px-3 pb-3">
              {valid.map(({ s, off, on }) => (
                <li
                  key={s.on_player_id}
                  className="flex items-center gap-2 rounded-sm bg-white/5 px-2.5 py-2 text-sm"
                >
                  <span
                    className={`font-mono text-[9px] font-bold uppercase tracking-micro ${ZONE_COLOR[s.zone] ?? "text-warm/70"} min-w-[40px]`}
                  >
                    {ZONE_LABELS[s.zone] ?? s.zone}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="truncate text-xs font-semibold text-warm/70">
                      {first(off.full_name)}
                    </span>
                    <span className="text-warm/40">→</span>
                    <span className="truncate text-xs font-bold text-brand-300">
                      {first(on.full_name)}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onApplyOne(s)}
                    className="flex-shrink-0 rounded-sm bg-brand-600 px-2.5 py-1 font-mono text-[11px] font-bold text-white transition-colors duration-fast ease-out-quart hover:bg-brand-500 disabled:opacity-60"
                  >
                    Do
                  </button>
                </li>
              ))}
            </ul>

            {/* Primary "Do all" action */}
            <div className="space-y-1.5 border-t border-white/10 bg-white/[0.03] px-3 py-3">
              <button
                type="button"
                onClick={() => { onApply(); onAcknowledge(); }}
                disabled={pending}
                className="flex w-full items-center justify-center gap-1.5 rounded-sm bg-brand-600 py-2.5 text-sm font-bold text-white transition-colors duration-fast ease-out-quart hover:bg-brand-500 disabled:opacity-60"
              >
                {pending
                  ? "Applying…"
                  : `Do all ${valid.length} swap${valid.length > 1 ? "s" : ""}`}
              </button>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={onAcknowledge}
                  className="flex-1 rounded-sm border border-white/15 py-2 text-xs font-semibold text-warm/80 transition-colors duration-fast ease-out-quart hover:border-white/25 hover:text-warm"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={onSnooze}
                  className="flex-1 rounded-sm py-2 text-xs font-medium text-warm/50 transition-colors duration-fast ease-out-quart hover:text-warm/80"
                >
                  Remind in 30s
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-3 px-4 pb-4">
            <p className="text-sm text-warm/60">No fit bench players available.</p>
            <button
              type="button"
              onClick={onAcknowledge}
              className="w-full rounded-sm bg-brand-600 py-2.5 text-sm font-bold text-white transition-colors duration-fast ease-out-quart hover:bg-brand-500"
            >
              Got it
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
