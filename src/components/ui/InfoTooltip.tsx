"use client";

import { useEffect, useId, useRef, useState } from "react";

interface InfoTooltipProps {
  /** Accessible label for screen readers (e.g. "About fairness"). */
  label: string;
  children: React.ReactNode;
  /**
   * Which side the popover should open toward. Defaults to "bottom-right"
   * which keeps it clear of the top edge on mobile.
   */
  placement?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  className?: string;
}

const PLACEMENT_CLASSES: Record<NonNullable<InfoTooltipProps["placement"]>, string> = {
  "bottom-right": "top-full right-0 mt-2",
  "bottom-left": "top-full left-0 mt-2",
  "top-right": "bottom-full right-0 mb-2",
  "top-left": "bottom-full left-0 mb-2",
};

/**
 * Small "i" info button that toggles a popover on click. Works on
 * touch devices (no hover dependency); closes on outside click or Escape.
 */
export function InfoTooltip({
  label,
  children,
  placement = "bottom-right",
  className = "",
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <span ref={rootRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-hairline bg-surface text-[10px] font-bold text-ink-mute transition-colors duration-fast ease-out-quart hover:border-brand-300 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
      >
        i
      </button>
      {open && (
        <div
          id={popoverId}
          role="tooltip"
          className={`absolute z-50 w-64 rounded-md border border-hairline bg-surface p-3 text-xs leading-relaxed text-ink-dim shadow-pop ${PLACEMENT_CLASSES[placement]}`}
        >
          {children}
        </div>
      )}
    </span>
  );
}
