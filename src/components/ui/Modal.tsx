"use client";

import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ModalSize = "sm" | "md" | "lg";

interface ModalProps {
  children: ReactNode;
  size?: ModalSize;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-xl",
};

export function Modal({ children, size = "sm" }: ModalProps) {
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
  if (!mounted) return null;

  return createPortal(
    // Padding is safe-area aware so a tall modal never tucks under the
    // iOS status bar / Dynamic Island (or the home indicator at the
    // bottom). `max(1rem, env(...))` keeps the old 1rem breathing room
    // on desktop (insets resolve to 0) and grows to clear the notch on
    // device. The inner card is capped to `max-h-full` so it fits inside
    // this padded box — Steve 2026-06-02: the Plan-Ahead planner was
    // extending above the top bar on iPhone.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
      }}
    >
      {/* Backdrop: fades in over 350ms (existing `fade-in` keyframe).
          The card slides up over 220ms below — they start at the same
          time, so the card lands ~130ms ahead of the backdrop. Reads
          correctly: the user's attention focuses on the card content
          while the dimming catches up.

          P0-4 from .planning/MICRO-INTERACTIONS-PLAN.md — Steve
          2026-05-15 added the modal slide-up sweep. Every modal in
          the app (StartQuarterModal, QuarterEndModal, SubDueModal,
          LockModal, WalkthroughModal, SwapConfirmDialog,
          InjuryReplacementModal, QuarterScoreModal, FeedbackModal)
          inherits this behaviour from the Modal primitive — no
          per-modal change needed. */}
      <div className="absolute inset-0 z-0 bg-ink/40 motion-safe:animate-fade-in" />
      {/* Inner card: capped to viewport height (minus the p-4
          breathing room above) and rendered as a flex column so
          children can opt-in to scrolling middle + pinned footer.
          Default behaviour for short content is unchanged. Bug:
          when QuarterScoreModal's Fix-scores list got long the
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
        className={`relative z-10 flex max-h-full w-full ${sizeClasses[size]} flex-col rounded-lg border border-hairline bg-surface p-5 shadow-modal motion-safe:animate-sheet-up`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
