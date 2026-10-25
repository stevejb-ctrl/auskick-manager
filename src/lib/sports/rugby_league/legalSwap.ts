// ─── Is there a rolling sub the laws allow? ──────────────────────
// League's live screen shows "Sub due — rotate a player off" when a sub
// is due and the suggester has no pair. With §6 (or the game-time
// floor) keeping every kid on, that told the coach to break the law for
// whoever they took off, while the §6 card lower down said "Stay on to
// the hooter" (round-2 usability test, 24 Oct 2026). The banner now
// waits for a legal swap: a kid on the field who may come off (not one
// mustStayOn keeps, nor a vest wearer) and one on the bench who may
// come on. The laws themselves are mustStayOn's (fairness.ts).

import { mustStayOn, type LeagueSubLaws } from "@/lib/sports/rugby_league/fairness";
import type { LeaguePlaybookInput } from "@/lib/sports/rugby_league/engine";
import { leagueOnField, type GameEvent, type LeagueLineup } from "@/lib/types";

export function leagueSwapPossible(input: {
  events: GameEvent[];
  period: number;
  /** The lineup now; its bench holds only kids who can come on (not hurt or lent). */
  lineup: LeagueLineup;
  elapsedMs: number;
  laws: LeagueSubLaws;
  playbook?: LeaguePlaybookInput;
  /** Kids a rolling sub never takes off (the FR / DH vest wearers). */
  keepOn?: readonly string[];
}): boolean {
  const { events, period, lineup, elapsedMs, laws, playbook, keepOn = [] } = input;
  if (lineup.bench.length === 0) return false;
  // "Subs only at the breaks": no rolling sub at all.
  if (playbook?.rules?.some((r) => r.kind === "subs-at-breaks")) return false;
  const onField = leagueOnField(lineup);
  const stay = mustStayOn(events, period, onField, elapsedMs, laws);
  return onField.some((id) => !stay.has(id) && !keepOn.includes(id));
}
