"use client";

import type { Player } from "@/lib/types";
import type { SwapSuggestion } from "@/lib/fairness";

const ZONE_LABELS: Record<string, string> = {
  back: "Back",
  mid: "Mid",
  fwd: "Fwd",
};

function first(name: string): string {
  return name.split(" ")[0];
}

interface SubDueModalProps {
  suggestions: SwapSuggestion[];
  playersById: Map<string, Player>;
  onAcknowledge: () => void;
  onSnooze: () => void;
}

export function SubDueModal({
  suggestions,
  playersById,
  onAcknowledge,
  onSnooze,
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
          className="mb-3 text-lg font-bold text-amber-800"
        >
          Sub due now!
        </h2>

        {valid.length > 0 ? (
          <ul className="mb-4 space-y-1 text-sm text-gray-800">
            {valid.map(({ s, off, on }) => (
              <li key={s.on_player_id} className="tabular-nums">
                <span className="font-semibold">
                  {first(on.full_name)} #{on.jersey_number}
                </span>{" "}
                → {ZONE_LABELS[s.zone] ?? s.zone},{" "}
                <span className="font-semibold">
                  {first(off.full_name)} #{off.jersey_number}
                </span>{" "}
                → bench
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-gray-500">
            No fit bench players available.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onAcknowledge}
            className="w-full rounded-lg bg-amber-500 py-3 text-base font-bold text-white transition-colors hover:bg-amber-600 active:bg-amber-700"
          >
            Got it
          </button>
          <button
            type="button"
            onClick={onSnooze}
            className="w-full rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Remind me in 30s
          </button>
        </div>
      </div>
    </div>
  );
}
