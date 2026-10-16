// ─── Rugby zone time: the centre is a vest ───────────────────
// Rugby's forwards / backs time bar has a centre segment only where a
// vest is worn: time wearing league's First Receiver (U8+) or Dummy
// Half (U9+) vest. Union wears none, nor does league U6–U7, so there the
// bar, its colour key and its settings are forwards and backs only and
// name no vest (Stagehand sideline-chaos-union, 16 Oct 2026).

import type { AgeGroupConfig } from "@/lib/sports/types";

/** "the FR or DH vest", "the FR vest", or null where none is worn. */
export function centreVest(vests: AgeGroupConfig["vestRequirements"]): string | null {
  const worn = [vests?.fr && "FR", vests?.dh && "DH"].filter(Boolean);
  return worn.length > 0 ? `the ${worn.join(" or ")} vest` : null;
}
