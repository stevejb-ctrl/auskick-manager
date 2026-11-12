// ─── A rotation's name, from its id ──────────────────────────
// The Game plan says which How we play rotation made it ("Rotation:
// Preferred lines"; Stagehand round 11, #12). The plan has the engine
// input's strategy id (the kickoff snapshot's mid-game), so the name is
// looked up from the sport's own strategies: the age group's policy
// first, then with zones the other way (an AFL team that turned zones
// off plays Free rotation, Preferred lines or Set positions). No id: the
// strategy a team with no saved choice plays.

import { effectivePolicy, effectiveStrategy, getSportPlaybook } from "@/lib/playbook";
import type { Sport } from "@/lib/types";

export function strategyLabelOf(sport: Sport, ageGroup: string, strategyId?: string | null): string {
  const policy = effectivePolicy(sport, ageGroup);
  if (!strategyId) return effectiveStrategy(sport, policy, null).label;
  const playbook = getSportPlaybook(sport);
  for (const p of [policy, { ...policy, zonesEnforced: !policy.zonesEnforced }]) {
    const found = playbook.strategies(p).find((s) => s.id === strategyId);
    if (found) return found.label;
  }
  return effectiveStrategy(sport, policy, strategyId).label;
}
