// Hockey — How we play. The soccer family's How we play
// (soccer/playbook.ts) with hockey's own words, laws and sources
// (HOCKEY_RULES): no keeper at U7–U8, keeper turns at U9–U12 changed
// only at the breaks, named keepers from U13.

import { HOCKEY_RULES } from "@/lib/sports/hockey";
import { soccerFamilyPlaybook } from "@/lib/sports/soccer/playbook";

export const hockeyPlaybook = soccerFamilyPlaybook("hockey", HOCKEY_RULES);
