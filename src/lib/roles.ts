// Labels + one-line summaries for the three team roles. Reused by
// the invite picker, the accept page, the member roster, and anywhere
// a human needs to know what a role actually can do.
//
// UI names follow the UX plan glossary (§5): Coach / Manager / Parent.
// The stored role keys (admin / game_manager / parent) are unchanged.

import type { TeamRole } from "@/lib/types";

export const ROLE_LABEL: Record<TeamRole, string> = {
  admin: "Coach",
  game_manager: "Manager",
  parent: "Parent",
};

export const ROLE_SUMMARY: Record<TeamRole, string> = {
  admin: "Full control — squad, games, settings, invite others.",
  game_manager: "Run games on game day, mark availability, share game-day links.",
  parent: "View team, schedule, and scores.",
};

export const ROLE_OPTIONS: TeamRole[] = ["admin", "game_manager", "parent"];
