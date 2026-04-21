"use client";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}

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
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-base ease-out-quart",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-brand-600" : "bg-surface-alt",
      ].join(" ")}
    >
      <span
        className={[
          "absolute h-4 w-4 rounded-full bg-surface shadow-card transition-all duration-base ease-out-quart",
          checked ? "left-6" : "left-1",
        ].join(" ")}
      />
    </button>
  );
}
