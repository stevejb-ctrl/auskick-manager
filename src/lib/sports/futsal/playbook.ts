// Futsal — How we play. The soccer family's How we play
// (soccer/playbook.ts) with futsal's own words, laws and sources
// (FUTSAL_RULES): keeper turns to U11, named keepers from U12, and the
// FIFA laws on flying subs and keeper swaps.

import { FUTSAL_RULES } from "@/lib/sports/futsal";
import { soccerFamilyPlaybook } from "@/lib/sports/soccer/playbook";

export const futsalPlaybook = soccerFamilyPlaybook("futsal", FUTSAL_RULES);
