// ─── Touch football — How we play ────────────────────────────
// Touch's own laws and fits, on the touch family's How we play
// (./familyPlaybook.ts). The laws shown are TFA's 8th Edition rules
// that change how a coach rotates; the dummy half's (it can't score)
// lives in Help.

import { touchFamilyPlaybook } from "@/lib/sports/touch/familyPlaybook";
import type { LockedRule } from "@/lib/playbook/types";

const TFA = "TFA 8th Edition rules";

function touchLaws(ageGroup: string): LockedRule[] {
  const out: LockedRule[] = [
    { id: "touch-interchange", text: "Subs roll on and off through the interchange, as often as you like", source: `${TFA}, rule 17` },
    {
      id: "touch-no-change-after-turnover",
      text: "No interchange after an intercept or line break until the next touch: change when you have the ball",
      source: `${TFA}, rule 17.7`,
    },
    { id: "touch-try", text: "A try is 1 point", source: `${TFA}, rule 14.1` },
  ];
  if (["U6", "U7", "U8", "U9", "U10"].includes(ageGroup)) {
    out.push({ id: "touch-half-field", text: "5 a side on a half field", source: "TFA junior framework" });
  }
  return out;
}

export const touchPlaybook = touchFamilyPlaybook("touch", {
  ruleSource: TFA,
  equalTimeSource: "TFA junior framework: every player rotates and plays",
  laws: touchLaws,
  fit: {
    minutes: "Under 6 to Under 9",
    "rotate-positions": "Under 10 and up (TFA brings positions in from 10)",
    "home-position": "Older teams that specialise",
  },
});
