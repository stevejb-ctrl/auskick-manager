"use client";

// ─── LineupPickerFooter ──────────────────────────────────────
// Shared sticky-bottom footer for pre-game lineup pickers, used by
// both AFL `LineupPicker.tsx` and netball `LineupPicker.tsx`.
// Owns the cross-cutting chrome — fixed positioning, safe-area-aware
// padding, two-row layout, design-system buttons — so the only thing
// the sport adapters supply is the labels, the disable gates, and
// the click handlers.
//
// Layout has two shapes depending on whether `onSavePlan` is
// provided:
//
//   1. **Two-row** (team-auth coaches, callback provided):
//      [ on-X count · bench count · Plan saved? ]  [ Save plan & exit ]
//      [               primary "Ready for Q1" CTA               ]
//
//   2. **One-row** (token-auth runners, callback omitted):
//      [               primary "Ready for Q1" CTA               ]
//
// Steve 2026-05-13 (AFL) / 2026-05-15 (this extraction): token-auth
// parent-runners get the single-row footer because they have no
// "page to exit to" — there's no game-detail page in the runner-
// token flow, and "Save plan & exit" next to "Ready" freezes them
// ("will Exit delete the game?" — Lisa B4 usability finding). The
// caller controls the row count by deciding whether to pass
// `onSavePlan`.
//
// P3a of the netball-parity refactor: this is the first piece of
// shared shell — the rest of LineupPickerShell extraction follows
// in later commits.

import { useRef, type ReactNode } from "react";
import { SFButton } from "@/components/sf";
import { useStickyInset } from "@/components/ui/useStickyInset";

interface LineupPickerFooterProps {
  // ─── Counts row ─────────────────────────────────────────────
  onFieldCount: number;
  benchCount: number;
  /**
   * The words after the on-field count: "on field", or "on court" for
   * netball, futsal and basketball (`onSurfaceLabel(sport)`). No
   * default: an AFL "on field" read wrong on every court.
   */
  onFieldLabel: string;

  // ─── Save plan & exit (optional row) ────────────────────────
  /**
   * When omitted, the entire top row is suppressed and the footer
   * collapses to the primary CTA only. The caller decides — that's
   * how token-auth runners get the single-row layout (no
   * destination to exit to). Mirrors the existing netball pattern;
   * AFL used to gate inline with `auth.kind === "team"`, this
   * extraction unifies the contract around callback presence.
   */
  onSavePlan?: () => void;
  /** Loading state during the save action. */
  savePending?: boolean;
  /** ISO timestamp of the most-recent save. Drives the badge + the button label flip ("Save" → "Update"). */
  savedAt?: string | null;
  /** Extra disable gate for the Save button. Empty-court is the typical reason. */
  savePlanDisabled?: boolean;

  // ─── Primary CTA ────────────────────────────────────────────
  onConfirm: () => void;
  /** Button label, e.g. "Start Q1" (every sport passes its own). */
  confirmLabel: string;
  /** Disable gate for the primary CTA — typically `onFieldCount === 0 || isPending`. */
  confirmDisabled?: boolean;
  /**
   * Why the primary CTA is disabled, said under it (round 3 edge cases,
   * 24 Oct 2026: league's Start H1 greyed out with one kid in and nothing
   * said the vests need two).
   */
  confirmHint?: string | null;
  /** Loading state for the primary CTA. */
  confirmLoading?: boolean;
  /** Optional right-side icon. AFL passes chevronRight; netball passes nothing. */
  confirmIconAfter?: ReactNode;
}

export function LineupPickerFooter({
  onFieldCount,
  benchCount,
  onFieldLabel,
  onSavePlan,
  savePending = false,
  savedAt = null,
  savePlanDisabled = false,
  onConfirm,
  confirmLabel,
  confirmDisabled = false,
  confirmHint = null,
  confirmLoading = false,
  confirmIconAfter,
}: LineupPickerFooterProps) {
  // Focus scrolls clear of the footer (the page's scroll padding).
  const footerRef = useRef<HTMLDivElement>(null);
  useStickyInset(footerRef, "bottom");
  return (
    // On a short screen (a phone held sideways) the two rows fold into
    // one: 119 of 390 px left no player above the fold (UX round 3, e4).
    <div
      ref={footerRef}
      className="sticky bottom-0 z-30 border-t border-hairline bg-surface px-4 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(26,30,26,0.04)] sm:px-7 sm:pt-3 short:pb-[calc(8px+env(safe-area-inset-bottom))] short:pt-[8px]"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-2 short:flex-row short:items-center short:gap-4">
        {onSavePlan && (
          <div className="flex items-center justify-between gap-3 short:min-w-0 short:flex-1">
            <div className="flex items-center gap-3 text-xs sm:gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-ok" />
                <span className="font-mono font-bold tabular-nums text-ink">
                  {onFieldCount}
                </span>
                <span className="text-ink-dim">{onFieldLabel}</span>
              </span>
              <span
                className="h-3.5 w-px bg-hairline"
                aria-hidden="true"
              />
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-ink-mute" />
                <span className="font-mono font-bold tabular-nums text-ink">
                  {benchCount}
                </span>
                <span className="text-ink-dim">bench</span>
              </span>
              {savedAt && (
                <span
                  className="hidden text-micro text-ink-mute sm:inline"
                  title={`Plan saved ${new Date(savedAt).toLocaleString()}`}
                >
                  · Plan saved
                </span>
              )}
            </div>
            <SFButton
              onClick={onSavePlan}
              loading={savePending}
              disabled={savePlanDisabled}
              variant="ghost"
              size="sm"
            >
              {savePending
                ? "Saving…"
                : savedAt
                ? "Update plan & exit"
                : "Save plan & exit"}
            </SFButton>
          </div>
        )}
        <SFButton
          onClick={onConfirm}
          disabled={confirmDisabled}
          loading={confirmLoading}
          variant="accent"
          size="lg"
          full
          iconAfter={confirmIconAfter}
          aria-describedby={confirmDisabled && confirmHint ? "lineup-confirm-hint" : undefined}
          className="short:h-11 short:w-auto short:flex-1"
        >
          {confirmLabel}
        </SFButton>
        {confirmDisabled && confirmHint && (
          <p id="lineup-confirm-hint" role="status" className="text-center text-xs font-medium text-warn">
            {confirmHint}
          </p>
        )}
      </div>
    </div>
  );
}
