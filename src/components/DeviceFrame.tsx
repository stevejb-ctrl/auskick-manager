import type { ReactNode } from "react";

interface DeviceFrameProps {
  children: ReactNode;
}

/**
 * On desktop (≥ md): centres children inside a rounded phone-bezel mockup
 * on a neutral background. The bezel is ~390 px wide (iPhone 14 size) with
 * a scrollable inner viewport capped at 844 px / 90 vh.
 *
 * On mobile (< md): renders children full-width with no frame — the layout
 * is already mobile-first so no wrapper is needed.
 *
 * The caller's header must sit OUTSIDE this component so it stays above the
 * frame on desktop rather than scrolling away inside it.
 */
export function DeviceFrame({ children }: DeviceFrameProps) {
  return (
    <div className="md:flex md:min-h-[calc(100vh-49px)] md:items-start md:justify-center md:bg-warm md:py-8 md:px-4">
      {/* Bezel — ink-black ring, generous corner radius */}
      <div className="md:rounded-[3rem] md:bg-ink md:p-[10px] md:shadow-2xl md:ring-1 md:ring-black/20">
        {/* Screen — scrollable at fixed device dimensions.
            md:[transform:translateZ(0)] makes this the containing block for
            position:fixed descendants so modals/dialogs (which use
            `fixed inset-0`) stay inside the phone frame on desktop instead
            of escaping to the viewport. Only applied at md+ — on mobile the
            modal should fill the actual viewport as it always has. */}
        <div
          className="md:relative md:w-[390px] md:overflow-y-auto md:rounded-[2.5rem] md:bg-warm md:[transform:translateZ(0)]"
          style={{ maxHeight: "min(844px, 90vh)" } as React.CSSProperties}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
