// ─── A game's periods, said ──────────────────────────────────
// The game page names its periods and how long they are ("4 × 10 min
// quarters"), so a coach who changes the length in Settings can see
// today's game took it (Stagehand round 11, #11). The length is the
// game's own, else the team's, else the age group's
// (getEffectiveQuarterSeconds); the count and words are the team's
// halves, quarters or one period (teamAgeGroup).

import { subIntervalDuration } from "@/lib/live/subIntervalText";

export function periodFormatText(
  count: number,
  periodSeconds: number,
  words: { label: string; plural: string },
): string {
  const length = subIntervalDuration(periodSeconds);
  if (count === 1) return `One ${length} ${words.label}`;
  return `${count} × ${length} ${words.plural}`;
}
