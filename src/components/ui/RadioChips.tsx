"use client";

// ─── RadioChips ──────────────────────────────────────────────
// A row of small mono chips choosing one of a few shapes: the lineup
// pickers' "Shape" (soccer, futsal, hockey), "Guards and forwards"
// (basketball) and "Lanes" (touch, Oztag). They were three copies of
// the same markup; now one, with the radio group's keyboard
// (useRadioGroup: one Tab stop, arrow keys move and select).

import { useRadioGroup } from "@/components/ui/useRadioGroup";

export interface RadioChipOption {
  id: string;
  label: string;
}

interface RadioChipsProps {
  /** Accessible name for the group. */
  label: string;
  options: readonly RadioChipOption[];
  value: string;
  onChange: (id: string) => void;
}

export function RadioChips({ label, options, value, onChange }: RadioChipsProps) {
  const { radioProps } = useRadioGroup({ values: options.map((o) => o.id), value, onChange });
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            {...radioProps(o.id)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={`rounded-full border px-3 py-1 font-mono text-xs font-semibold ${
              active ? "border-ink bg-ink text-warm" : "border-hairline bg-surface text-ink-dim hover:bg-surface-alt"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
