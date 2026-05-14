import { type ReactNode } from "react";

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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop: fades in over 350ms (existing `fade-in` keyframe).
          The card slides up over 220ms below — they start at the same
          time, so the card lands ~130ms ahead of the backdrop. Reads
          correctly: the user's attention focuses on the card content
          while the dimming catches up.

          P0-4 from .planning/MICRO-INTERACTIONS-PLAN.md — Steve
          2026-05-15 added the modal slide-up sweep. Every modal in
          the app (StartQuarterModal, QuarterEndModal, SubDueModal,
          LockModal, WalkthroughModal, SwapConfirmDialog,
          InjuryReplacementModal, QuarterScoreModal) inherits this
          behaviour from the Modal primitive — no per-modal change
          needed. */}
      <div className="absolute inset-0 bg-ink/40 motion-safe:animate-fade-in" />
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
          accepted as the trade-off for primitive simplicity. */}
      <div
        className={`relative flex w-full ${sizeClasses[size]} max-h-[calc(100dvh-2rem)] flex-col rounded-lg border border-hairline bg-surface p-5 shadow-modal motion-safe:animate-sheet-up`}
      >
        {children}
      </div>
    </div>
  );
}
