"use client";

import type { Player } from "@/lib/types";
import type { SwapSuggestion } from "@/lib/fairness";
import { Button } from "@/components/ui/Button";

interface SwapCardProps {
  suggestions: SwapSuggestion[];
  playersById: Map<string, Player>;
  onApply: () => void;
  pending: boolean;
  subState: "idle" | "soft" | "due";
  msUntilDue: number | null;
}

const ZONE_LABELS: Record<string, string> = {
  back: "Back",
  mid: "Mid",
  fwd: "Fwd",
};

function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function first(name: string): string {
  return name.split(" ")[0];
}

export function SwapCard({
  suggestions,
  playersById,
  onApply,
  pending,
  subState,
  msUntilDue,
}: SwapCardProps) {
  const frame =
    subState === "due"
      ? "border-amber-400 bg-amber-100 ring-2 ring-amber-300 animate-pulse"
      : subState === "soft"
      ? "border-amber-200 bg-amber-50"
      : "border-brand-200 bg-brand-50";

  const timerLabel =
    msUntilDue === null
      ? null
      : subState === "due"
      ? "Sub due now"
      : `Next sub in ${formatCountdown(msUntilDue)}`;

  if (suggestions.length === 0) {
    return (
      <div className={`rounded-lg border px-4 py-3 text-center text-xs shadow-sm ${frame}`}>
        {timerLabel && <p className="mb-1 font-semibold text-gray-700">{timerLabel}</p>}
        <p className="text-gray-500">No fit bench players — nothing to sub.</p>
      </div>
    );
  }

  const valid = suggestions
    .map((s) => {
      const off = playersById.get(s.off_player_id);
      const on = playersById.get(s.on_player_id);
      return off && on ? { s, off, on } : null;
    })
    .filter((x): x is { s: SwapSuggestion; off: Player; on: Player } => x !== null);

  if (valid.length === 0) return null;

  const headerColor =
    subState === "due"
      ? "text-amber-800"
      : subState === "soft"
      ? "text-amber-700"
      : "text-brand-700";

  return (
    <div className={`rounded-lg border p-3 shadow-sm ${frame}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          {timerLabel && (
            <p className={`text-xs font-semibold ${headerColor}`}>{timerLabel}</p>
          )}
          <p className="text-sm font-semibold text-brand-800">
            Sub {valid.length} {valid.length === 1 ? "player" : "players"}
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-brand-800">
            {valid.map(({ s, off, on }) => (
              <li key={s.on_player_id} className="tabular-nums">
                <span className="font-semibold">
                  {first(on.full_name)} #{on.jersey_number}
                </span>{" "}
                → {ZONE_LABELS[s.zone]},{" "}
                <span className="font-semibold">
                  {first(off.full_name)} #{off.jersey_number}
                </span>{" "}
                → bench
              </li>
            ))}
          </ul>
        </div>
        <Button size="sm" onClick={onApply} loading={pending}>
          Apply {valid.length > 1 ? "all" : ""}
        </Button>
      </div>
    </div>
  );
}
