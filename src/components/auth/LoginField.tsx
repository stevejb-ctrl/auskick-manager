"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";

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
  ...inputProps
}: LoginFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-ink-mute">
        <span>{label}</span>
        {hint}
      </span>
      <input
        {...inputProps}
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
          focused ? "border-ink" : "border-hairline"
        }`}
        style={{
          boxShadow: focused ? "0 0 0 3px rgba(26,30,26,0.10)" : "none",
        }}
      />
    </label>
  );
}
