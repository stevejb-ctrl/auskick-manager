import type { ReactNode } from "react";

interface DeviceFrameProps {
  children: ReactNode;
}

/**
 * On a desktop (`desk`: ≥ md and a mouse; a phone held sideways is wide
 * too, and got this frame inside it, Stagehand round 8): centres children inside a rounded phone-bezel mockup
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
    <div className="desk:flex desk:min-h-[calc(100vh-49px)] desk:items-start desk:justify-center desk:bg-warm desk:py-8 desk:px-4">
      {/* Bezel — ink-black ring, generous corner radius */}
      <div className="desk:rounded-[3rem] desk:bg-ink desk:p-[10px] desk:shadow-2xl desk:ring-1 desk:ring-black/20">
        {/* Screen — scrollable at fixed device dimensions.
            desk:[transform:translateZ(0)] makes this the containing
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
          className="desk:relative desk:w-[390px] desk:overflow-y-auto desk:rounded-[2.5rem] desk:bg-warm desk:[transform:translateZ(0)] desk:min-h-[min(844px,90vh)] desk:max-h-[min(844px,90vh)]"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
