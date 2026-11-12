"use client";

// ─── The game-day screens' loader ────────────────────────────
// The coach's /live and the game-day link (/run/<token>) show the app's
// loader (the pulse and the warm-up phrases, as every other page) while
// the game-day screen loads: after Start game day it was blank for as
// long as the server took (Stagehand round 11, #4).
//
// Only on the way in. These screens refresh themselves in place (the
// quarter ends, a break's Start, the other phone's changes), and the
// live game stays painted under a refresh (live/loading.tsx used to
// render nothing for that). The layout wraps the screen in
// GameDayScreen, which marks it with its path: if the screen for this
// path is still on the page when the loader would show, it's a refresh,
// and the loader stays out of the way.

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { PulseDot } from "@/components/ui/PulseDot";
import { WarmUpPhrases } from "@/components/ui/WarmUpPhrases";

const MARK = "data-game-day-screen";

/** Wraps a game-day layout's screen so its loader can tell a refresh from the way in. */
export function GameDayScreen({ children }: { children: ReactNode }) {
  const path = usePathname();
  // display: contents, so the screen lays out as if the mark weren't there.
  return (
    <div className="contents" {...{ [MARK]: path }}>
      {children}
    </div>
  );
}

function onPage(path: string): boolean {
  if (typeof document === "undefined") return false;
  return Array.from(document.querySelectorAll(`[${MARK}]`)).some(
    (el) => el.getAttribute(MARK) === path && el.childElementCount > 0,
  );
}

export function GameDayLoading() {
  const path = usePathname();
  // Decided once, as the loader mounts: a refresh of the screen on the
  // page shows nothing over it.
  const [refresh] = useState(() => onPage(path));
  if (refresh) return null;
  return (
    <div
      data-testid="game-day-loading"
      role="status"
      aria-label="Loading the game"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4"
    >
      <PulseDot size="lg" label="Loading the game" />
      <WarmUpPhrases />
    </div>
  );
}
