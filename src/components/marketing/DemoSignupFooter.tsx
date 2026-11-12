"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { PRICE } from "@/lib/siren-facts";

// ─── The demo game's sign-up footer ──────────────────────────
// Five Stagehand round 11 visitors looked for a way to sign up from
// inside a demo game and found none (Steve: "Add the signup footer").
// Demo games only: the run layout renders DemoFrame for an is_demo
// team, never for a real team's game-day link.
//
// The footer can't cover what a visitor needs to play the demo. The
// live screen is a column pinned over the whole screen (LiveShell,
// fixed inset-0), and the lineup and break footers are pinned to the
// bottom, so a footer laid over the page would hide the score bar or
// Start Q1. Instead DemoFrame gives the game a box the screen's height
// less the footer's, and makes it the containing block for fixed
// children (a transform, as DeviceFrame's phone does on a desktop): the
// game's pinned bars sit on the footer's top edge, not under it.
// Dialogs still portal to the body and cover everything. The box is
// what scrolls now, not the page, so a screen's window.scrollTo (the
// lineup pickers, the break, a new period) scrolls the box too.
//
// The look: a strip of the live screen's grass (bg-field, the same in
// both themes) with chalk words and the site's hi-vis Create your team
// (BAND_PRIMARY, 44 px tall here). Where large text leaves no room for
// the words beside the button (.demo-foot in globals.css), and on a
// short screen (a phone held sideways), only the button stays, so the
// game keeps its height.

export function DemoFrame({ children }: { children: ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const pageScrollTo = window.scrollTo;
    const both = ((...args: Parameters<typeof window.scrollTo>) => {
      pageScrollTo.apply(window, args);
      (box.scrollTo as (...a: unknown[]) => void)(...args);
    }) as typeof window.scrollTo;
    window.scrollTo = both;
    return () => {
      if (window.scrollTo === both) window.scrollTo = pageScrollTo;
    };
  }, []);
  return (
    <div className="flex h-[100dvh] flex-col desk:h-[min(844px,90vh)]">
      <div
        ref={boxRef}
        data-testid="demo-game"
        className="relative min-h-0 flex-1 overflow-y-auto [transform:translateZ(0)]"
        // The page's own scroll padding (globals.css) moves here with
        // the scrolling, so focus still scrolls clear of the sticky bars.
        style={{
          scrollPaddingTop: "calc(var(--sticky-top-h, 0px) + 8px)",
          scrollPaddingBottom: "calc(var(--sticky-bottom-h, 0px) + 8px)",
        }}
      >
        {children}
      </div>
      <DemoSignupFooter />
    </div>
  );
}

export function DemoSignupFooter() {
  return (
    <aside
      aria-label="Sign up"
      data-testid="demo-signup-footer"
      className="field-band demo-foot relative z-[1] flex shrink-0 items-center gap-3 bg-field px-4 pt-2 text-mark"
      style={{
        paddingBottom: "max(8px, env(safe-area-inset-bottom))",
        paddingLeft: "max(16px, env(safe-area-inset-left))",
        paddingRight: "max(16px, env(safe-area-inset-right))",
      }}
    >
      <p className="demo-foot-words min-w-0 flex-1 text-[0.8125rem] leading-snug short:hidden">
        <span className="block font-bold">Like it? Run your own team.</span>
        <span className="block text-mark/80">{PRICE.line}.</span>
      </p>
      <Link
        href="/signup"
        className="demo-foot-cta inline-flex min-h-[44px] shrink-0 items-center justify-center whitespace-nowrap rounded-[14px] bg-hivis px-4 font-display text-[0.9375rem] font-extrabold stretch-80 text-hivis-ink transition-[background-color,transform] duration-fast ease-out-quart hover:bg-hivis/90 motion-safe:active:scale-[0.98] short:ml-auto"
      >
        Create your team
      </Link>
    </aside>
  );
}
