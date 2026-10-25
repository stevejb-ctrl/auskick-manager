"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "@/components/ui/useDialogFocus";

// ─── ActionSheet ─────────────────────────────────────────────
// The one "pick an action" surface: a bottom sheet on phones (thumb
// reach), a centred card from sm+. Used for overflow menus ("More" on
// the game hub) and per-player actions, so every secondary or
// destructive action in the app is found the same way (UX plan §1,
// principle 6: one primary per screen, everything else in an overflow).
//
// Rows are ≥ 44 pt. Backdrop tap and Escape both close. The sheet
// closes itself before running an action so a follow-up confirm
// dialog never stacks on top of it. Focus starts on the first row, Tab
// stays inside, and goes back to the opener on close (useDialogFocus).

export interface ActionSheetAction {
  id: string;
  label: string;
  /** One line under the label, e.g. what a destructive action wipes. */
  description?: string;
  icon?: ReactNode;
  tone?: "default" | "danger";
  disabled?: boolean;
  onSelect: () => void;
}

interface ActionSheetProps {
  /** Accessible name and visible heading. */
  title: string;
  /** Optional line under the heading (player name, game, etc.). */
  subtitle?: ReactNode;
  actions: ActionSheetAction[];
  onClose: () => void;
}

export function ActionSheet({ title, subtitle, actions, onClose }: ActionSheetProps) {
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const idBase = useId();
  useEffect(() => setMounted(true), []);
  useDialogFocus(dialogRef, mounted, onClose);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <div
        className="absolute inset-0 z-0 bg-ink/40 motion-safe:animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 max-h-[calc(100dvh-16px)] w-full max-w-md overflow-y-auto rounded-t-lg border border-hairline bg-surface shadow-modal outline-none motion-safe:animate-sheet-up sm:m-4 sm:rounded-lg"
      >
        <div className="border-b border-hairline px-5 pb-3 pt-4">
          <p className="text-base font-semibold text-ink">{title}</p>
          {subtitle && <div className="mt-0.5 text-xs text-ink-mute">{subtitle}</div>}
        </div>
        <ul className="py-1">
          {actions.map((a, i) => (
            <li key={a.id}>
              <button
                data-autofocus={i === 0 ? "" : undefined}
                type="button"
                disabled={a.disabled}
                aria-label={a.label}
                aria-describedby={a.description ? `${idBase}-${a.id}` : undefined}
                onClick={() => {
                  onClose();
                  a.onSelect();
                }}
                className={[
                  "flex min-h-[48px] w-full items-center gap-3 px-5 py-2.5 text-left transition-colors duration-fast ease-out-quart",
                  "hover:bg-surface-alt active:bg-hairline disabled:opacity-50",
                  "focus-visible:outline-none focus-visible:bg-surface-alt",
                  a.tone === "danger" ? "text-danger" : "text-ink",
                ].join(" ")}
              >
                {a.icon && <span className="shrink-0" aria-hidden>{a.icon}</span>}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{a.label}</span>
                  {a.description && (
                    <span
                      id={`${idBase}-${a.id}`}
                      className="mt-0.5 block text-xs font-normal text-ink-mute"
                    >
                      {a.description}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-hairline p-2">
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] w-full items-center justify-center rounded-md text-sm font-semibold text-ink-dim hover:bg-surface-alt active:bg-hairline"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
