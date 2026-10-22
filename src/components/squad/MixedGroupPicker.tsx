"use client";

// ─── MixedGroupPicker ────────────────────────────────────────
// "For the mixed rule, counts as: Girl / Boy" — who a kid counts as
// under a touch or Oztag mixed team's boys' cap (migration 0071). One
// control wherever it's asked: adding a player, the squad row, a
// fill-in, and the lineup's prompt for a kid with no group. It's shown
// only on a mixed team, and only to the coach; the answer appears
// nowhere else (not on tiles, parent views or exports).

import type { MixedGroup } from "@/lib/types";

interface MixedGroupPickerProps {
  value: MixedGroup | null;
  onChange: (group: MixedGroup) => void;
  disabled?: boolean;
  /** The kid's name, for screen readers ("Mia counts as"). */
  playerName?: string;
  /** Hide the "For the mixed rule, counts as:" words (a row that says them once above). */
  compact?: boolean;
}

export function MixedGroupPicker({ value, onChange, disabled = false, playerName, compact = false }: MixedGroupPickerProps) {
  return (
    <span className="inline-flex items-center gap-2">
      {!compact && <span className="text-xs text-ink-dim">For the mixed rule, counts as:</span>}
      <span
        role="radiogroup"
        aria-label={playerName ? `${playerName} counts as` : "For the mixed rule, counts as"}
        className="inline-flex gap-1"
      >
        {(["girl", "boy"] as const).map((g) => (
          <button
            key={g}
            type="button"
            role="radio"
            aria-checked={value === g}
            disabled={disabled}
            onClick={() => onChange(g)}
            className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold transition-colors disabled:opacity-60 ${
              value === g ? "border-ink bg-ink text-warm" : "border-hairline bg-surface text-ink hover:bg-surface-alt"
            }`}
          >
            {g === "girl" ? "Girl" : "Boy"}
          </button>
        ))}
      </span>
    </span>
  );
}
