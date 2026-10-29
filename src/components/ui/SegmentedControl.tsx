"use client";

// One segmented control for choosing between a few options (UX plan
// Phase 6: 44 pt targets, radio semantics). SegTabs stays for tab-like
// navigation; this is for settings ("Off · Light · Balanced · Strong").

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Accessible name for the group. */
  label: string;
  disabled?: boolean;
  className?: string;
  /**
   * Tight padding and no wrapping, for four options on a 375px phone
   * (the period break's Suggested / Rotate / Repeat / Manual).
   */
  compact?: boolean;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled = false,
  className = "",
  compact = false,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`flex w-full gap-0.5 rounded-full bg-surface-alt p-[3px] ${className}`}
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => !active && onChange(opt.id)}
            className={`min-h-[44px] min-w-0 flex-1 rounded-full ${compact ? "whitespace-nowrap px-1" : "px-3"} text-[0.8125rem] font-semibold transition-all duration-base ease-out-quart active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${
              active ? "bg-surface text-ink shadow-card" : "text-ink-dim hover:text-ink"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
