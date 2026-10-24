// ─── Basketball game summary ─────────────────────────────────
// The share text at full time ("Copy for group chat"), from the
// replayed game: the result (only when scoring is on), the scorers by
// points, then each kid's game time (with guard and forward split under
// the line strategies, and a foul-out marked), and the kids who were
// here but didn't get on.

import type { Player } from "@/lib/types";
import { shortName, shortNames } from "@/lib/names";
import { DIDNT_GET_ON, didntGetOn } from "@/lib/live/presentPlayers";
import { basketballGameMs, type BasketballGameState } from "@/lib/sports/basketball/replay";

function fmtMs(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export interface BasketballSummaryInput {
  teamName: string;
  opponentName: string;
  trackScoring: boolean;
  state: BasketballGameState;
  squad: Player[];
  /** Kids marked here for the game (lib/live/presentPlayers). */
  presentIds: string[];
}

export function buildBasketballSummary(input: BasketballSummaryInput): string {
  const { teamName, opponentName, trackScoring, state, squad, presentIds } = input;
  const byId = new Map(squad.map((p) => [p.id, p]));
  // Two Mias read "Mia C" and "Mia T" (the number is printed beside them).
  const short = shortNames(squad, "first", { numberShown: true });
  const first = (p: Player | undefined) => (p ? short.get(p.id) ?? shortName(p.full_name) : "Unknown");
  const jersey = (p: Player | undefined) => (p?.jersey_number != null ? `#${p.jersey_number} ` : "");
  const lines: string[] = [`🏀 Full time — ${teamName} v ${opponentName}`];

  if (trackScoring) {
    const us = state.teamScore.points;
    const them = state.opponentScore.points;
    if (us > them) lines.push(`${teamName} ${us} def ${opponentName} ${them}`);
    else if (them > us) lines.push(`${opponentName} ${them} def ${teamName} ${us}`);
    else lines.push(`${teamName} ${us} drew with ${opponentName} ${them}`);

    const scorers = Object.entries(state.playerPoints)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => {
        const p = byId.get(id);
        return `${first(p)}${p?.jersey_number != null ? ` (#${p.jersey_number})` : ""} ${n}`;
      });
    if (scorers.length > 0) lines.push(`\n🏀 Points: ${scorers.join(", ")}`);
  }

  const fouledOut = new Set(state.fouledOutIds);
  const played = Object.keys(state.ms)
    .map((id) => ({ id, ms: basketballGameMs(state, id), guard: state.ms[id]?.guard ?? 0, forward: state.ms[id]?.forward ?? 0 }))
    .filter((r) => r.ms >= 1000)
    .sort((a, b) => b.ms - a.ms);
  const rows = played.map(({ id, ms, guard, forward }) => {
    const p = byId.get(id);
    const split = guard >= 1000 && forward >= 1000 ? ` (G ${fmtMs(guard)}, F ${fmtMs(forward)})` : "";
    return `${jersey(p)}${first(p)} — ${fmtMs(ms)}${split}${fouledOut.has(id) ? " · fouled out" : ""}`;
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
