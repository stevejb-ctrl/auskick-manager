// ─── Oztag — How we play ─────────────────────────────────────
// Oztag's own laws and fits, on the touch family's How we play
// (../touch/familyPlaybook.ts). Oztag names no positions, so Minutes
// only is ★ at every age and touch's lanes are an option. The junior
// modified rules (no marker; the dummy half runs but can't score) live
// in Help.

import { touchFamilyPlaybook } from "@/lib/sports/touch/familyPlaybook";
import type { LockedRule } from "@/lib/playbook/types";

const ITF = "ITF Oztag rules";

function oztagLaws(): LockedRule[] {
  return [
    { id: "oztag-sub-box", text: "Subs come on and off from the sub box, as often as you like", source: ITF },
    {
      id: "oztag-equal-time",
      text: "Equal game time: 50 %, give or take 10 %",
      source: "NSW Junior State Championships conditions of entry",
    },
    { id: "oztag-try", text: "A try is 1 point; in a mixed game a girl's try is 2", source: `${ITF}, rule 4.3` },
  ];
}

export const oztagPlaybook = touchFamilyPlaybook("oztag", {
  ruleSource: ITF,
  equalTimeSource: "NSW Junior State Championships: equal game time, 50 % ± 10 %",
  laws: oztagLaws,
  fit: {
    minutes: "Every age (Oztag has no set positions)",
    "rotate-positions": "Coaches who want every kid at middle, link and wing",
    "home-position": "Older teams that specialise",
  },
});
