"use client";

import { createContext, useContext, type ReactNode } from "react";

// A parent on a game-day link: the scorebug marks which team is theirs.
// Round 8 put "You're scoring for X v Y" over the top bar, and in round 9
// cold-link parents still guessed which name was theirs: the line is
// small and scrolls away, and the scores are where they look.

const ScoringForContext = createContext(false);

export function ScoringForProvider({ children }: { children: ReactNode }) {
  return <ScoringForContext.Provider value>{children}</ScoringForContext.Provider>;
}

/** True on a game-day link (/run/<token>). */
export function useScoringFor(): boolean {
  return useContext(ScoringForContext);
}
