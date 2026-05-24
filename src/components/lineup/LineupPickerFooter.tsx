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

import type { ReactNode } from "react";
import { SFButton } from "@/components/sf";

interface LineupPickerFooterProps {
  // ─── Counts row ─────────────────────────────────────────────
  onFieldCount: number;
  benchCount: number;
  /**
   * The word used for the on-field count chip. AFL uses "on field";
   * netball uses "on court". Default mirrors AFL because the AFL
   * adapter was the original implementation. Anything not falling
   * back to the default just passes the override explicitly.
   */
  onFieldLabel?: string;

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
  /** Button label. AFL passes "Ready for Q1"; netball passes its `confirmLabel` prop. */
  confirmLabel: string;
  /** Disable gate for the primary CTA — typically `onFieldCount === 0 || isPending`. */
  confirmDisabled?: boolean;
  /** Loading state for the primary CTA. */
  confirmLoading?: boolean;
  /** Optional right-side icon. AFL passes chevronRight; netball passes nothing. */
  confirmIconAfter?: ReactNode;
}

export function LineupPickerFooter({
  onFieldCount,
  benchCount,
  onFieldLabel = "on field",
  onSavePlan,
  savePending = false,
  savedAt = null,
  savePlanDisabled = false,
  onConfirm,
  confirmLabel,
  confirmDisabled = false,
  confirmLoading = false,
  confirmIconAfter,
}: LineupPickerFooterProps) {
  return (
    <div className="sticky bottom-0 z-30 border-t border-hairline bg-surface px-4 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(26,30,26,0.04)] sm:px-7 sm:pt-3">
      <div className="mx-auto flex max-w-4xl flex-col gap-2">
        {onSavePlan && (
          <div className="flex items-center justify-between gap-3">
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
                  className="hidden text-[11px] text-ink-mute sm:inline"
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
        >
          {confirmLabel}
        </SFButton>
      </div>
    </div>
  );
}
