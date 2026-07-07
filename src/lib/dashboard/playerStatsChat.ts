// Plain-text summary of the Player statistics section, for pasting into
// the team group chat. Pure + framework-free so it's unit-testable and
// the dashboard component just renders the string. Steve 2026-07-07.

import type { PlayerSeasonStats } from "./types";

const MS_PER_MIN = 60_000;
const fmtMin = (ms: number) => Math.round(ms / MS_PER_MIN);

/**
 * One line per player, in the order given (so it follows the coach's
 * current sort). Zone split + goals are appended only when non-zero.
 */
export function buildChatText(rows: PlayerSeasonStats[]): string {
  const games = rows.reduce((n, r) => Math.max(n, r.gamesPlayed), 0);
  const lines = rows.map((p) => {
    const onField =
      p.zoneMs.back + p.zoneMs.hback + p.zoneMs.mid + p.zoneMs.hfwd + p.zoneMs.fwd;
    const zpct = (v: number) => (onField > 0 ? Math.round((v / onField) * 100) : 0);
    const bits = [
      `${fmtMin(p.totalMs)}m`,
      `${fmtMin(p.avgMsPerGame)}m/g`,
      `${p.teamGameTimePct}% time`,
    ];
    if (onField > 0) {
      bits.push(
        `Fwd ${zpct(p.zoneMs.fwd + p.zoneMs.hfwd)}% Cen ${zpct(p.zoneMs.mid)}% Back ${zpct(
          p.zoneMs.back + p.zoneMs.hback,
        )}%`,
      );
    }
    if (p.goals > 0) bits.push(`${p.goals} goal${p.goals === 1 ? "" : "s"}`);
    return `${p.playerName}: ${bits.join(" · ")}`;
  });
  const header = games > 0 ? `Player stats — ${games} games` : "Player stats";
  return `${header}\n\n${lines.join("\n")}`;
}
