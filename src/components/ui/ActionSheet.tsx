"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "@/components/ui/useDialogFocus";
import { SHEET_CANCEL, SHEET_CARD, SHEET_EYEBROW, SHEET_OPTION, SHEET_TITLE, SheetGrab } from "@/components/ui/sheetChrome";

// A filled row: the sheet's one primary.
const FILLED: Record<string, string> = {
  ink: "!bg-ink !text-mark !shadow-none hover:!bg-ink/90",
  oval: "!bg-brand-600 !text-mark !shadow-none hover:!bg-brand-700",
};

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
  /**
   * danger: red words. ink and oval: a filled row, the sheet's one
   * primary (the v3 clock sheet's Pause, Resume).
   */
  tone?: "default" | "danger" | "ink" | "oval";
  /** A test hook on the row. */
  testId?: string;
  disabled?: boolean;
  onSelect: () => void;
}

interface ActionSheetProps {
  /** Accessible name and visible heading. */
  title: string;
  /** Optional line under the heading (player name, game, etc.). */
  subtitle?: ReactNode;
  /** Small caps over the heading ("GAME MENU", "Q2 CLOCK"). */
  eyebrow?: string;
  /** The dialog's accessible name when it isn't the heading. */
  label?: string;
  actions: ActionSheetAction[];
  onClose: () => void;
}

export function ActionSheet({ title, subtitle, eyebrow, label, actions, onClose }: ActionSheetProps) {
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
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <div
        className="absolute inset-0 z-0 bg-scrim/40 motion-safe:animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? title}
        className={`relative z-10 max-h-[calc(100dvh-16px)] w-full max-w-md overflow-y-auto overscroll-contain ${SHEET_CARD} outline-none motion-safe:animate-sheet-up sm:m-4`}
      >
        <SheetGrab />
        <div className="px-5 pb-2 pt-6 sm:pt-5">
          {eyebrow && <p className={SHEET_EYEBROW}>{eyebrow}</p>}
          <p className={SHEET_TITLE}>{title}</p>
          {subtitle && <div className="mt-1 text-sm text-ink-dim">{subtitle}</div>}
        </div>
        <ul className="space-y-1.5 px-3.5 py-1">
          {actions.map((a, i) => (
            <li key={a.id}>
              <button
                data-autofocus={i === 0 ? "" : undefined}
                type="button"
                disabled={a.disabled}
                aria-label={a.label}
                aria-describedby={a.description ? `${idBase}-${a.id}` : undefined}
                data-testid={a.testId}
                onClick={() => {
                  onClose();
                  a.onSelect();
                }}
                className={[
                  SHEET_OPTION,
                  "disabled:opacity-50",
                  a.tone === "danger" ? "text-danger" : a.tone === "ink" || a.tone === "oval" ? FILLED[a.tone] : "text-ink",
                ].join(" ")}
              >
                {a.icon && <span className="shrink-0" aria-hidden>{a.icon}</span>}
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-bold">{a.label}</span>
                  {a.description && (
                    <span
                      id={`${idBase}-${a.id}`}
                      className={`mt-0.5 block text-xs font-normal ${a.tone === "ink" || a.tone === "oval" ? "text-mark/80" : "text-ink-dim"}`}
                    >
                      {a.description}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="px-3.5 pb-[max(14px,env(safe-area-inset-bottom))] pt-2.5">
          <button type="button" onClick={onClose} className={SHEET_CANCEL}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
