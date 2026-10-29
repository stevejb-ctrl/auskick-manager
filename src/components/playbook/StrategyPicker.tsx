"use client";

import type { StrategyDef } from "@/lib/playbook/types";
import { useRadioGroup } from "@/components/ui/useRadioGroup";

interface StrategyPickerProps {
  strategies: StrategyDef[];
  value: string;
  /** The age group's suggested strategy, marked ★. */
  recommendedId: string;
  /** "U12" — shown on the suggested card. */
  ageLabel: string;
  disabled?: boolean;
  onChange: (id: string) => void;
}

/**
 * How kids rotate (UX plan §7.8): one card per strategy the sport and
 * age policy offer, the age group's suggestion marked. Shared by wizard
 * step 2 and Team › How we play, for every sport.
 */
export function StrategyPicker({
  strategies,
  value,
  recommendedId,
  ageLabel,
  disabled = false,
  onChange,
}: StrategyPickerProps) {
  const { radioProps } = useRadioGroup({ values: strategies.map((s) => s.id), value, onChange, disabled });
  return (
    <div role="radiogroup" aria-label="How kids rotate" className="space-y-2">
      {strategies.map((s) => {
        const active = s.id === value;
        return (
          <button
            key={s.id}
            {...radioProps(s.id)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => !active && onChange(s.id)}
            className={`flex w-full min-h-[44px] items-start gap-3 rounded-lg border p-4 text-left transition-colors duration-fast ease-out-quart active:bg-surface-alt disabled:cursor-not-allowed ${
              active
                ? "border-brand-600 bg-brand-50 shadow-card"
                : "border-hairline bg-surface hover:border-ink-mute"
            }`}
          >
            <span
              aria-hidden
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                active ? "border-brand-600" : "border-ink-mute"
              }`}
            >
              {active && <span className="h-2 w-2 rounded-full bg-brand-600" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2">
                <span className="text-sm font-semibold text-ink">{s.label}</span>
                {s.id === recommendedId && (
                  <span className="rounded-full bg-surface-alt px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
                    ★ Suggested for {ageLabel}
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-xs text-ink-dim">{s.blurb}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
