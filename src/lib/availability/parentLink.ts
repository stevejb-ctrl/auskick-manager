// ─── The parent availability link ────────────────────────────
// Each game has its own link (games.availability_token, migration 0072)
// that a coach shares in the group chat. A parent opens it without an
// account and marks their child In or Out; nothing else. It's not the
// game-day link (games.share_token), which runs the game.
//
// Anyone holding the link can answer for any kid on the team, as on the
// team's own availability page: a parent's link can't know which child
// is theirs without an account.

import type { GameStatus } from "@/lib/types";

export const availabilityPath = (token: string) => `/availability/${token}`;

/** Why a parent's answer can't be taken, or null when it can. */
export function parentAnswerError(input: {
  gameStatus: GameStatus;
  gameTeamId: string;
  player: { team_id: string; is_active: boolean } | null;
  status: string;
}): string | null {
  if (input.gameStatus !== "upcoming") {
    return "This game has started, so availability is closed. Tell the coach on the day.";
  }
  // "unknown" clears a wrong answer: a sleepy parent tapped someone
  // else's child and could only overwrite it (Stagehand round 8, #12).
  if (input.status !== "available" && input.status !== "unavailable" && input.status !== "unknown") {
    return "Choose In or Out.";
  }
  if (!input.player || input.player.team_id !== input.gameTeamId || !input.player.is_active) {
    return "That player isn't in this team's squad.";
  }
  return null;
}

/** "Tyler H.": a first name and a surname initial, for a page anyone with the link can open. */
export function kidLabel(fullName: string): string {
  const [first, ...rest] = fullName.trim().split(/\s+/);
  return rest.length > 0 ? `${first} ${rest[0][0]}.` : first;
}

/** The message a coach posts in the group chat, ending with the link. */
export function availabilityAskText(input: {
  teamName: string;
  opponent: string;
  /** The game's day in the coach's own words, e.g. "Sat 25 Oct". */
  dayLabel: string;
  url: string;
}): string {
  return [
    `${input.teamName} v ${input.opponent}, ${input.dayLabel}`,
    "Can your child play? Tap their name and choose In or Out (no account needed):",
    input.url,
  ].join("\n");
}
