"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";

interface LoginFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  /** Mono-uppercase label rendered above the field. */
  label: string;
  /** Optional right-aligned hint slot (e.g. "Forgot?" link). */
  hint?: ReactNode;
  /** Controlled value. */
  value: string;
  /** Receives the new string value. */
  onChange: (next: string) => void;
  /** Shown under the field, in danger red, and read with it. */
  error?: string | null;
}

/**
 * Login screen input — labelled, surface-fill, focus ring.
 *
 * Mirrors the prototype's `<LoginField>` from
 * `login_handoff/prototype/sf/login.jsx`:
 *   - Mono / uppercase / tracked label above
 *   - 44 px height, 14 px font, ink text on surface white
 *   - Focus state: ink-coloured 1 px border + 3 px ink/10% halo ring
 *
 * Uses inline style for the focus ring so the colour resolves
 * cleanly to the brand ink without needing an extra Tailwind
 * shadow utility.
 */
export function LoginField({
  label,
  hint,
  value,
  onChange,
  error,
  ...inputProps
}: LoginFieldProps) {
  const [focused, setFocused] = useState(false);
  const errorId = useId();
  // The error sits outside the label so it isn't part of the field's name.
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1.5">
        <span className="flex items-baseline justify-between font-mono text-nano font-bold uppercase tracking-[0.12em] text-ink-mute">
          <span>{label}</span>
          {hint}
        </span>
        <input
          {...inputProps}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          className={`h-11 rounded-md border bg-surface px-3.5 text-sm font-medium text-ink outline-none transition-[border-color,box-shadow] duration-fast ease-out-quart placeholder:text-ink-mute/70 ${
            error ? "border-danger" : focused ? "border-ink" : "border-hairline"
          }`}
          style={{
            boxShadow: focused ? "0 0 0 3px rgba(26,30,26,0.10)" : "none",
          }}
        />
      </label>
      {error && (
        <span id={errorId} role="alert" className="text-xs text-danger motion-safe:animate-fade-in">
          {error}
        </span>
      )}
    </div>
  );
}
