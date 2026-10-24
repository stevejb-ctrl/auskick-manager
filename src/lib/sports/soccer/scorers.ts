// The scorer sheet's order for the soccer family: the likeliest scorers
// first (attack, midfield, a one-line field, defence), the keeper after
// every outfielder, then the bench (a kid just subbed off may have
// scored). AFL's sheet lists its forwards first the same way (UX audit
// 23 Oct 2026: the keeper headed soccer's list).

import type { SoccerLineup } from "@/lib/sports/soccer/lineup";
import type { SoccerUnit } from "@/lib/sports/soccer/types";

const SCORING_ORDER: SoccerUnit[] = ["att", "mid", "field", "def"];

export function soccerLikelyScorers(lineup: SoccerLineup): { id: string; unit: SoccerUnit | null }[] {
  const out: { id: string; unit: SoccerUnit | null }[] = [];
  for (const unit of SCORING_ORDER) {
    if (unit === "gk") continue;
    for (const id of lineup.lines[unit]) out.push({ id, unit });
  }
  if (lineup.keeper) out.push({ id: lineup.keeper, unit: "gk" });
  for (const id of lineup.bench) out.push({ id, unit: null });
  return out;
}
