// ─── The sub interval, in one phrase ─────────────────────────
// Every sport's lineup Game settings, the ⋯ menu's line under Game
// settings and the Game plan say the sub interval the same way, AFL's:
// "Sub every 4 min" (Stagehand round 11, #5: it read "Sub every 5m",
// "4 min subs", "4.2 min subs" and "Subs every 4 min"). Whole minutes,
// else minutes and seconds ("Sub every 4 min 15 s"); league and union
// set it in seconds, so under a minute reads "Sub every 45 s".
//
// Only for sports that sub on Siren's timer. Netball subs at the breaks
// (unless the team turns on mid-quarter subs) and a soccer age group
// with sub windows says its windows instead (soccerSubModeNote).

/** A sub interval's length: "10 min", "4 min 30 s", "45 s". */
export function subIntervalDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  if (min === 0) return `${sec} s`;
  return sec === 0 ? `${min} min` : `${min} min ${sec} s`;
}

/** "Sub every 4 min": the one phrase for the sub interval, every sport. */
export function subEveryText(seconds: number): string {
  return `Sub every ${subIntervalDuration(seconds)}`;
}

/** "Sub every 3 min · 12 on the field": the line under the ⋯ menu's Game settings. */
export function settingsSummary(subIntervalSeconds: number, onField: number, surface = "field"): string {
  return `${subEveryText(subIntervalSeconds)} · ${onField} on the ${surface}`;
}
