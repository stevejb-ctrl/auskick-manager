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
      <div className="absolute inset-0 bg-ink/40" />
      {/* Inner card: capped to viewport height (minus the p-4
          breathing room above) and rendered as a flex column so
          children can opt-in to scrolling middle + pinned footer.
          Default behaviour for short content is unchanged. Bug:
          when QuarterScoreModal's Fix-scores list got long the
          card extended past the viewport and the Close button
          could not be reached. */}
      <div
        className={`relative flex w-full ${sizeClasses[size]} max-h-[calc(100dvh-2rem)] flex-col rounded-lg border border-hairline bg-surface p-5 shadow-modal`}
      >
        {children}
      </div>
    </div>
  );
}
