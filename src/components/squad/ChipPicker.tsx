"use client";

import { CHIP_COLORS, CHIP_KEYS, type ChipKey } from "@/lib/chips";

interface ChipPickerProps {
  value: ChipKey | "";
  onChange: (next: ChipKey | "") => void;
  labels: { a: string | null; b: string | null; c: string | null };
  disabled?: boolean;
}

// Three-swatch chip picker + Unset option. Used in the player
// add/edit forms when the team has at least one labeled chip.
// The colored swatches make the chip visible at a glance; the
// label sits underneath as a one-line hint.
export function ChipPicker({ value, onChange, labels, disabled }: ChipPickerProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-ink">Chip</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange("")}
          disabled={disabled}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            value === ""
              ? "border-ink/40 bg-ink/5 text-ink"
              : "border-hairline bg-surface text-ink-mute hover:bg-surface-alt"
          } disabled:opacity-60`}
          aria-pressed={value === ""}
        >
          <span
            aria-hidden
            className="inline-block h-3 w-3 rounded-full border border-dashed border-ink-mute"
          />
          Unset
        </button>
        {CHIP_KEYS.map((k) => {
          const label = labels[k];
          if (!label) return null;
          const selected = value === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onChange(k)}
              disabled={disabled}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                selected
                  ? `${CHIP_COLORS[k].selectedBorder} ${CHIP_COLORS[k].selectedBg} ${CHIP_COLORS[k].selectedText}`
                  : "border-hairline bg-surface text-ink-mute hover:bg-surface-alt"
              } disabled:opacity-60`}
              aria-pressed={selected}
            >
              <span
                aria-hidden
                className={`inline-block h-3 w-3 rounded-full ${CHIP_COLORS[k].dot}`}
              />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
