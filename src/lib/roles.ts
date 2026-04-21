// Labels + one-line summaries for the three team roles. Reused by
// the invite picker, the accept page, the member roster, and anywhere
// a human needs to know what a role actually can do.

import type { TeamRole } from "@/lib/types";

export const ROLE_LABEL: Record<TeamRole, string> = {
  admin: "Admin",
  game_manager: "Game manager",
  parent: "Parent",
};

export const ROLE_SUMMARY: Record<TeamRole, string> = {
  admin: "Full control — squad, games, settings, invite others.",
  game_manager: "Run games on match day, mark availability, share runner links.",
  parent: "View team, schedule, and scores.",
};

export const ROLE_OPTIONS: TeamRole[] = ["admin", "game_manager", "parent"];
