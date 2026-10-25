"use client";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}

// The 44 × 24 track sits in a 44 × 44 target; negative margins keep the
// row it sits in the height it was (UX round 3, e4: 44 × 24 was the
// whole target).
export function Toggle({ checked, onChange, disabled, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "group -my-[10px] inline-flex h-11 w-11 shrink-0 items-center justify-center",
        "focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
      ].join(" ")}
    >
      <span
        aria-hidden
        className={[
          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-base ease-out-quart",
          "group-focus-visible:ring-2 group-focus-visible:ring-brand-600 group-focus-visible:ring-offset-2",
          // Pressed feedback (UX plan Phase 6: active states on chips).
          "motion-safe:group-active:scale-[0.97]",
          checked ? "bg-brand-600" : "bg-surface-alt",
        ].join(" ")}
      >
        <span
          className={[
            "absolute h-4 w-4 rounded-full bg-surface shadow-card transition-all duration-base ease-out-quart",
            checked ? "left-6" : "left-1",
          ].join(" ")}
        />
      </span>
    </button>
  );
}
