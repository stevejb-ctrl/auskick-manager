"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Whose game the game-day link is for, said once in the live top bar:
 * "Scoring for Coburg Cubs · Under 10 AFL". A parent handed the link
 * cold guessed which team was theirs, and the sport was never named
 * (Stagehand round 8, #7).
 *
 * The /run layout provides it and LiveTopBar reads it, so the ten
 * sports' live, lineup and break screens all say it without threading
 * a prop through each one. Outside /run (the coach's own screens) there
 * is no provider and the bar shows the game's round and date instead.
 *
 * It replaced a second header above the live bar (design review, Oct
 * 2026): two bars took 16% of the phone, and its "‹ Siren" link went to
 * the homepage in the middle of a game.
 */
export interface RunWhose {
  team: string;
  opponent: string | null;
  /** Age group and sport, e.g. "Under 10 · AFL". */
  what: string;
  finished: boolean;
}

const RunWhoseContext = createContext<RunWhose | null>(null);

export function RunWhoseProvider({ whose, children }: { whose: RunWhose | null; children: ReactNode }) {
  return <RunWhoseContext.Provider value={whose}>{children}</RunWhoseContext.Provider>;
}

export function useRunWhose(): RunWhose | null {
  return useContext(RunWhoseContext);
}

/** "Scoring for Coburg Cubs · Under 10 · AFL" (or "Result for …" once it's over). */
export function runWhoseLine(whose: RunWhose): string {
  return [`${whose.finished ? "Result for" : "Scoring for"} ${whose.team}`, whose.what].filter(Boolean).join(" · ");
}
