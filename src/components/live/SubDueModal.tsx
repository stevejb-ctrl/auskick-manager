"use client";

import type { Player } from "@/lib/types";
import type { SwapSuggestion } from "@/lib/fairness";

const ZONE_LABELS: Record<string, string> = {
  back: "Back",
  hback: "HBack",
  mid: "Mid",
  hfwd: "HFwd",
  fwd: "Fwd",
};

function first(name: string): string {
  return name.split(" ")[0];
}

interface SubDueModalProps {
  suggestions: SwapSuggestion[];
  playersById: Map<string, Player>;
  onApply: () => void;
  onAcknowledge: () => void;
  onSnooze: () => void;
  pending?: boolean;
}

export function SubDueModal({
  suggestions,
  playersById,
  onApply,
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sub-due-title"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
        <h2
          id="sub-due-title"
          className="mb-4 text-lg font-bold text-amber-800"
        >
          Sub due now!
        </h2>

        {valid.length > 0 ? (
          <>
            <ul className="mb-4 space-y-2">
              {valid.map(({ s, off, on }) => (
                <li
                  key={s.on_player_id}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                >
                  <span className="flex-1 tabular-nums">
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                      <span className="text-[11px]">↑</span>
                      {first(on.full_name)} #{on.jersey_number}
                    </span>
                    <span className="mx-1 text-gray-400">→</span>
                    <span className="text-gray-600">{ZONE_LABELS[s.zone] ?? s.zone}</span>
                  </span>
                  <span className="text-gray-300">|</span>
                  <span className="flex-1 tabular-nums text-right">
                    <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                      <span className="text-[11px]">↓</span>
                      {first(off.full_name)} #{off.jersey_number}
                    </span>
                    <span className="ml-1 text-gray-500">bench</span>
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => { onApply(); onAcknowledge(); }}
                disabled={pending}
                className="w-full rounded-lg bg-amber-500 py-3 text-base font-bold text-white transition-colors hover:bg-amber-600 active:bg-amber-700 disabled:opacity-60"
              >
                {pending ? "Applying…" : `Apply ${valid.length > 1 ? "all " : ""}${valid.length} sub${valid.length > 1 ? "s" : ""}`}
              </button>
              <button
                type="button"
                onClick={onAcknowledge}
                className="w-full rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={onSnooze}
                className="w-full rounded-lg py-2 text-sm text-gray-400 transition-colors hover:text-gray-600"
              >
                Remind me in 30s
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-gray-500">
              No fit bench players available.
            </p>
            <button
              type="button"
              onClick={onAcknowledge}
              className="w-full rounded-lg bg-amber-500 py-3 text-base font-bold text-white transition-colors hover:bg-amber-600"
            >
              Got it
            </button>
          </>
        )}
      </div>
    </div>
  );
}
