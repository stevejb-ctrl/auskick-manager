"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export interface SegTabOption {
  /** Stable id used as the controlled value. */
  id: string;
  label: string;
  /** Optional small badge after the label (e.g. squad count). */
  count?: number;
  /** Optional leading icon. */
  icon?: ReactNode;
  /** When set, the tab renders as a Next.js Link instead of a button. */
  href?: string;
}

type Size = "sm" | "md" | "lg";

interface SegTabsProps {
  options: SegTabOption[];
  /** Controlled active id. */
  value: string;
  /** Called when a non-link tab is clicked. */
  onChange?: (id: string) => void;
  /** Stretches the control to fill its container. Default true. */
  full?: boolean;
  size?: Size;
  className?: string;
  /** Accessible label for the tablist. */
  ariaLabel?: string;
}

const HEIGHT: Record<Size, string> = {
  sm: "h-[32px] text-[12px]",
  md: "h-[38px] text-[13px]",
  lg: "h-11 text-sm",
};

/**
 * Pill segmented control. Replaces the project's underline tabs.
 *
 * Two modes:
 *   1. **Controlled value/onChange** — pass `options[]` with no `href`,
 *      drive `value` from parent state.
 *   2. **Routed nav** — pass `href` on each option; the active option
 *      is determined by the parent (typically via `usePathname`).
 *
 * Colour: active tab is `surface` on a `surface-alt` track, with
 * `shadow-card`. Inactive tabs are `text-ink-dim`.
 */
export function SegTabs({
  options,
  value,
  onChange,
  full = true,
  size = "md",
  className = "",
  ariaLabel,
}: SegTabsProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`
        inline-flex items-stretch gap-0.5 rounded-full bg-surface-alt p-[3px]
        ${full ? "w-full" : ""}
        ${className}
      `}
    >
      {options.map((opt) => {
        const active = value === opt.id;
        const inner = (
          <>
            {opt.icon}
            {opt.label}
            {opt.count != null && (
              <span
                className={`
                  ml-0.5 rounded-full font-mono text-[10px] font-bold
                  ${active
                    ? "bg-surface-alt px-1.5 py-px text-ink-dim"
                    : "text-ink-mute"
                  }
                `}
              >
                {opt.count}
              </span>
            )}
          </>
        );
        const tabClasses = `
          inline-flex items-center justify-center gap-1.5
          rounded-full px-3.5 font-semibold whitespace-nowrap
          transition-all duration-base ease-out-quart
          ${HEIGHT[size]}
          ${full ? "flex-1" : ""}
          ${active
            ? "bg-surface text-ink shadow-card"
            : "bg-transparent text-ink-dim hover:text-ink"
          }
        `;

        if (opt.href) {
          return (
            <Link
              key={opt.id}
              href={opt.href}
              role="tab"
              aria-selected={active}
              className={tabClasses}
            >
              {inner}
            </Link>
          );
        }

        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(opt.id)}
            className={tabClasses}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
