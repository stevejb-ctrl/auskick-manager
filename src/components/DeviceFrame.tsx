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
            md:[transform:translateZ(0)] makes this the containing
            block for position:fixed descendants so modals/dialogs,
            sticky CTAs, and the live-game scorebug all stay inside
            the phone frame on desktop instead of escaping to the
            viewport. Only applied at md+ — on mobile the phone
            frame is hidden and fixed elements should pin to the
            real viewport as always.
            Steve 2026-05-20: removed this earlier to try and fix
            a score-bar pinning issue, but that broke worse — the
            lineup picker's Ready CTA and other fixed-bottom bars
            then spanned the actual page viewport on desktop demo
            instead of the phone-frame width. Restored. The score-
            bar issue is being addressed separately. */}
        {/* Inner screen — w-390 × h-min(844,90vh) at md+.
            Both min-h AND max-h pinned to the same value so the
            div is ALWAYS the full phone-frame height regardless of
            content. Without min-h the div shrinks to content size
            and fixed-bottom descendants (score bar, sticky CTAs)
            pin to that shorter box, which rendered the score bar
            mid-page on the demo. Tailwind's `min(844px,90vh)` in
            arbitrary-value brackets resolves to the same CSS
            min() expression as the previous inline style, just
            scoped to md+. Steve 2026-05-20. */}
        <div
          className="md:relative md:w-[390px] md:overflow-y-auto md:rounded-[2.5rem] md:bg-warm md:[transform:translateZ(0)] md:min-h-[min(844px,90vh)] md:max-h-[min(844px,90vh)]"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
