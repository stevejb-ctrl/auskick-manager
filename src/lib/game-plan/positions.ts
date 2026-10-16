// Each on-field kid's position label in a planned period, worked out
// exactly as the lineup screen does (home first, then also-plays, then
// the free spots). Stagehand round 3: for a set-position team the Game
// plan listed kids by line only, so a ruck sat under "Centre" and
// parents couldn't tell who plays where. Netball's groups already are
// positions, so it needs none.

import { assignPositionLabels, type AflPlaybookInput } from "@/lib/sports/afl/engine";
import { assignLeaguePositionLabels, type LeaguePlaybookInput } from "@/lib/sports/rugby_league/engine";
import { isRugby } from "@/lib/sports/registry";
import type { Lineup, Sport } from "@/lib/types";
import type { GamePlanPeriod } from "./types";

export function periodPositionLabels(
  sport: Sport,
  period: GamePlanPeriod,
  playbooks: { aflPlaybook?: AflPlaybookInput | null; leaguePlaybook?: LeaguePlaybookInput | null },
): Record<string, string> {
  const ids = (groupId: string) => period.groups.find((g) => g.groupId === groupId)?.playerIds ?? [];
  if (sport === "afl") {
    if (!playbooks.aflPlaybook?.positions?.length) return {};
    const lineup: Lineup = {
      back: ids("back"),
      hback: ids("hback"),
      mid: ids("mid"),
      hfwd: ids("hfwd"),
      fwd: ids("fwd"),
      bench: period.bench,
    };
    return assignPositionLabels(lineup, playbooks.aflPlaybook);
  }
  if (isRugby(sport)) {
    if (!playbooks.leaguePlaybook?.positions?.length) return {};
    return assignLeaguePositionLabels({ forwards: ids("forwards"), backs: ids("backs") }, playbooks.leaguePlaybook);
  }
  return {};
}
