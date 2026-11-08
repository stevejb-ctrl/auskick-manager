"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "@/components/ui/useDialogFocus";
import { SHEET_CARD, SheetGrab } from "@/components/ui/sheetChrome";

type ModalSize = "xs" | "sm" | "md" | "lg" | "xl";

interface ModalProps {
  children: ReactNode;
  size?: ModalSize;
  /** id of the heading that names the dialog (aria-labelledby). */
  labelledBy?: string;
  /** Accessible name when there's no visible heading. */
  label?: string;
  /**
   * Called on a backdrop tap or Escape (UX plan Phase 6: one modal
   * primitive everywhere). Omit for dialogs that must be answered.
   */
  onClose?: () => void;
  /** Extra classes for the card (e.g. scrolling, padding tweaks). */
  className?: string;
  /**
   * Both rise from the bottom on a phone as the v3 sheet (live v3, Nov
   * 2026: one sheet look everywhere). From sm up, "center" (default)
   * and "sheet" both centre. Kept so callers can say which they meant.
   */
  placement?: "center" | "sheet";
  /**
   * Card padding (default 20 px); "p-0" for cards with their own sections.
   * In px, as the frame's 16 px is, so large text gets the width (UX
   * round 3: at 200% the rem padding left the player sheet 229 px buttons).
   */
  padding?: string;
}

// Widths from sm up; on a phone the sheet runs edge to edge.
const sizeClasses: Record<ModalSize, string> = {
  xs: "sm:max-w-xs",
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-xl",
  xl: "sm:max-w-2xl",
};

export function Modal({
  children,
  size = "sm",
  labelledBy,
  label,
  onClose,
  className = "",
  placement = "center",
  padding = "p-[20px]",
}: ModalProps) {
  // Every dialog is the bottom sheet on a phone now; `placement` is
  // kept for callers (see the prop).
  void placement;
  // Portal-mount at document.body so `position: fixed` is always
  // anchored to the viewport regardless of ancestor stacking contexts.
  //
  // Why: any ancestor with `transform`, `filter`, `perspective`,
  // `will-change: transform`, or `contain: paint` re-anchors `fixed`
  // children to that ancestor instead of the viewport (per CSS spec).
  // `DeviceFrame` applies `transform: translateZ(0)` on md+ to
  // create the iPhone-mock containing block, and the /run/[token]
  // layout wraps the live game tree in DeviceFrame. The result:
  // every modal opened from inside a live game (FeedbackModal,
  // QuarterEndModal, SubDueModal, etc.) was being centred relative
  // to the phone-mock rather than the viewport — Steve 2026-05-25
  // reported the in-game FeedbackHeaderButton opening "too high"
  // because the DeviceFrame's bounding box extended above the
  // visible viewport.
  //
  // The SSR guard (mounted state) avoids touching document.body
  // during server render — `createPortal` would throw because
  // document doesn't exist. Modals are always opened via user
  // action so the one-frame delay before mount is invisible.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Focus in, Tab kept inside, Escape → onClose, focus back to the
  // opener on close (UX round 3, e4).
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, mounted, onClose);
  if (!mounted) return null;

  return createPortal(
    // Padding is safe-area aware so a tall modal never tucks under the
    // iOS status bar / Dynamic Island (or the home indicator at the
    // bottom). `max(16px, env(...))` keeps the old 16px breathing room
    // on desktop (insets resolve to 0) and grows to clear the notch on
    // device. The inner card is capped to `max-h-full` so it fits inside
    // this padded box — Steve 2026-06-02: the Plan-Ahead planner was
    // extending above the top bar on iPhone.
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:pb-[16px]"
      // On a phone the sheet sits on the bottom edge and runs edge to
      // edge; a spacer inside it clears the home indicator. The top
      // keeps the notch clear, the sides a landscape notch.
      style={{
        paddingTop: "max(16px, env(safe-area-inset-top))",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {/* Backdrop: fades in over 350ms (existing `fade-in` keyframe).
          The card slides up over 220ms below — they start at the same
          time, so the card lands ~130ms ahead of the backdrop. Reads
          correctly: the user's attention focuses on the card content
          while the dimming catches up.

          P0-4 from .planning/MICRO-INTERACTIONS-PLAN.md — Steve
          2026-05-15 added the modal slide-up sweep. Every modal in
          the app (StartQuarterModal, QuarterEndModal,
          LockModal, WalkthroughModal, SwapConfirmDialog,
          InjuryReplacementModal, ScoresSheet, FeedbackModal)
          inherits this behaviour from the Modal primitive — no
          per-modal change needed. */}
      <div
        className="absolute inset-0 z-0 bg-scrim/40 motion-safe:animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      {/* Inner card: capped to viewport height (minus the p-4
          breathing room above) and rendered as a flex column so
          children can opt-in to scrolling middle + pinned footer.
          Default behaviour for short content is unchanged. Bug:
          when the Q-by-Q modal's Fix-scores list got long the
          card extended past the viewport and the Close button
          could not be reached.

          `motion-safe:animate-sheet-up` runs the 220ms slide+fade
          on mount. `motion-reduce` users see the final state
          immediately (no transform, no opacity ramp). The
          consumer-side unmount is a hard cut — caller toggles the
          modal off and React unmounts the subtree. CSS unmount
          transitions in React are stateful and hard to do
          correctly without a state-machine; the snap-out is
          accepted as the trade-off for primitive simplicity.

          Explicit `z-10` (paired with `z-0` on the backdrop) so
          the card is unambiguously above the dim layer. Before:
          painting order relied on DOM order alone, which works
          visually but Playwright's `elementFromPoint` hit-test
          would intermittently resolve to the backdrop when the
          card's `transform: translateY` (from animate-sheet-up)
          briefly created a stacking context that demoted it
          back to DOM-order tiebreak. Cost a 3-minute test
          timeout on every CI run (full-game-playthrough.spec.ts
          line 205). z-indexes don't change visual appearance —
          purely a hit-test fix. */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        className={`relative z-10 flex max-h-full w-full ${sizeClasses[size]} flex-col ${SHEET_CARD} ${padding} outline-none motion-safe:animate-sheet-up ${className}`}
      >
        <SheetGrab />
        {children}
        {/* Clears the home indicator on a phone, under any padding. */}
        <span aria-hidden className="block h-[env(safe-area-inset-bottom)] shrink-0 sm:hidden" />
      </div>
    </div>,
    document.body,
  );
}
