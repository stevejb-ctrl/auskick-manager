// ─── The soccer family's game summary ────────────────────────
// The share text at full time ("Copy for group chat"), from the
// replayed game, under the sport's own emoji (⚽, or hockey's 🏑): the
// result (only when scoring is on: MiniRoos records
// none), the goal scorers, then each kid's game time with their time in
// goal, and the kids who were here but didn't get on.

import type { Player } from "@/lib/types";
import { DIDNT_GET_ON, didntGetOn } from "@/lib/live/presentPlayers";
import { byJerseyThenName } from "@/lib/share/neutralOrder";
import { soccerGameMs, type SoccerGameState } from "@/lib/sports/soccer/replay";

function fmtMs(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export interface SoccerSummaryInput {
  /** The sport's emoji (SoccerFamilyRules.emoji). */
  emoji: string;
  teamName: string;
  opponentName: string;
  trackScoring: boolean;
  state: SoccerGameState;
  squad: Player[];
  /** Kids marked here for the game (lib/live/presentPlayers). */
  presentIds: string[];
}

export function buildSoccerSummary(input: SoccerSummaryInput): string {
  const { emoji, teamName, opponentName, trackScoring, state, squad, presentIds } = input;
  const byId = new Map(squad.map((p) => [p.id, p]));
  const first = (p: Player | undefined) => (p ? p.full_name.trim().split(/\s+/)[0] : "Unknown");
  const jersey = (p: Player | undefined) => (p?.jersey_number != null ? `#${p.jersey_number} ` : "");
  const lines: string[] = [`${emoji} Full time — ${teamName} v ${opponentName}`];

  if (trackScoring) {
    const us = state.teamScore.goals;
    const them = state.opponentScore.goals;
    if (us > them) lines.push(`${teamName} ${us} def ${opponentName} ${them}`);
    else if (them > us) lines.push(`${opponentName} ${them} def ${teamName} ${us}`);
    else lines.push(`${teamName} ${us} drew with ${opponentName} ${them}`);

    const scorers = Object.entries(state.playerGoals)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => {
        const p = byId.get(id);
        return `${first(p)}${p?.jersey_number != null ? ` (#${p.jersey_number})` : ""}${n > 1 ? ` ×${n}` : ""}`;
      });
    if (scorers.length > 0) lines.push(`\n${emoji} Goals: ${scorers.join(", ")}`);
  }

  const played = Object.keys(state.ms)
    .map((id) => ({ id, ms: soccerGameMs(state, id), gk: state.ms[id]?.gk ?? 0 }))
    .filter((r) => r.ms >= 1000);
  const rows = played.map(({ id, ms, gk }) => {
    const p = byId.get(id);
    return { id, text: `${jersey(p)}${first(p)} — ${fmtMs(ms)}${gk >= 1000 ? ` (in goal ${fmtMs(gk)})` : ""}` };
  });
  for (const id of didntGetOn(presentIds, played.map((r) => r.id))) {
    const p = byId.get(id);
    if (p) rows.push({ id, text: `${jersey(p)}${first(p)} — ${DIDNT_GET_ON}` });
  }
  if (rows.length > 0) {
    lines.push(`\n⏱ Game time`);
    // By number, never by minutes: this goes to every parent.
    lines.push(...rows.sort(byJerseyThenName((r) => byId.get(r.id))).map((r) => r.text));
  }
  return lines.join("\n");
}
