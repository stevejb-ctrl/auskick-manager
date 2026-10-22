// ─── Touch family game summary ───────────────────────────────
// The share text at full time ("Copy for group chat"), from the
// replayed game: the result (only when scoring is on), the try scorers,
// then each kid's game time (with the lanes they played under the
// position strategies), and the kids who were here but didn't get on.
// Nothing here says who counts as a girl or a boy: a girl's try is
// counted in the score, not named.

import type { Player } from "@/lib/types";
import { DIDNT_GET_ON, didntGetOn } from "@/lib/live/presentPlayers";
import { touchGameMs, type TouchGameState } from "@/lib/sports/touch/replay";
import { TOUCH_LANES } from "@/lib/sports/touch/types";

function fmtMs(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const LANE_LETTER = { middle: "M", link: "L", wing: "W" } as const;

export interface TouchSummaryInput {
  teamName: string;
  opponentName: string;
  trackScoring: boolean;
  state: TouchGameState;
  squad: Player[];
  /** Kids marked here for the game (lib/live/presentPlayers). */
  presentIds: string[];
}

export function buildTouchSummary(input: TouchSummaryInput): string {
  const { teamName, opponentName, trackScoring, state, squad, presentIds } = input;
  const byId = new Map(squad.map((p) => [p.id, p]));
  const first = (p: Player | undefined) => (p ? p.full_name.trim().split(/\s+/)[0] : "Unknown");
  const jersey = (p: Player | undefined) => (p?.jersey_number != null ? `#${p.jersey_number} ` : "");
  const lines: string[] = [`🏉 Full time — ${teamName} v ${opponentName}`];

  if (trackScoring) {
    const us = state.teamScore.points;
    const them = state.opponentScore.points;
    if (us > them) lines.push(`${teamName} ${us} def ${opponentName} ${them}`);
    else if (them > us) lines.push(`${opponentName} ${them} def ${teamName} ${us}`);
    else lines.push(`${teamName} ${us} drew with ${opponentName} ${them}`);

    const scorers = Object.entries(state.playerTries)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => {
        const p = byId.get(id);
        return `${first(p)}${p?.jersey_number != null ? ` (#${p.jersey_number})` : ""}${n > 1 ? ` ${n}` : ""}`;
      });
    if (scorers.length > 0) lines.push(`\n🏉 Tries: ${scorers.join(", ")}`);
  }

  const played = Object.keys(state.ms)
    .map((id) => ({ id, ms: touchGameMs(state, id) }))
    .filter((r) => r.ms >= 1000)
    .sort((a, b) => b.ms - a.ms);
  const rows = played.map(({ id, ms }) => {
    const p = byId.get(id);
    const lanes = TOUCH_LANES.filter((l) => (state.ms[id]?.[l] ?? 0) >= 1000);
    const split = lanes.length > 1 ? ` (${lanes.map((l) => `${LANE_LETTER[l as keyof typeof LANE_LETTER]} ${fmtMs(state.ms[id]![l]!)}`).join(", ")})` : "";
    return `${jersey(p)}${first(p)} — ${fmtMs(ms)}${split}`;
  });
  for (const id of didntGetOn(presentIds, played.map((r) => r.id))) {
    const p = byId.get(id);
    if (p) rows.push(`${jersey(p)}${first(p)} — ${DIDNT_GET_ON}`);
  }
  if (rows.length > 0) {
    lines.push(`\n⏱ Game time`);
    lines.push(...rows);
  }
  return lines.join("\n");
}
