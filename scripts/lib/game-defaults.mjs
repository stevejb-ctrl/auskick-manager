// ─── A new game's size and sub interval, for .mjs scripts ─────
// Games have no on-field or interval defaults (migration 0063), so a
// script that inserts one must say both, from the team's own sport and
// age group. The app reads them through newGameDefaults(); scripts
// can't import the TS registry (its "@/" paths), so this mirrors each
// age group's defaultOnFieldSize / subIntervalSeconds.
// src/lib/__tests__/scriptGameDefaults.test.ts keeps it in step.

export const GAME_DEFAULTS = {
  afl: {
    U8: [6, 300],
    U9: [9, 240],
    U10: [12, 240],
    U11: [12, 300],
    U12: [12, 300],
    U13: [15, 240],
    U14: [15, 240],
    U15: [15, 240],
    U16_boys: [18, 240],
    U16_girls: [16, 240],
    U17_boys: [18, 240],
    U17_girls: [16, 240],
    U18_boys: [18, 240],
    U18_girls: [16, 240],
    // Legacy ids some teams still store.
    U16: [18, 240],
    U17: [18, 240],
  },
  netball: {
    set: [5, 300],
    go: [7, 300],
    "11u": [7, 300],
    "12u": [7, 300],
    "13u": [7, 300],
    open: [7, 300],
  },
  rugby_league: {
    U6: [6, 240],
    U7: [6, 240],
    U8: [8, 240],
    U9: [8, 240],
    U10: [11, 240],
    U11: [11, 240],
    U12: [13, 240],
    U13: [13, 250],
    U14: [13, 250],
    U15: [13, 250],
    U16: [13, 300],
    U17: [13, 300],
  },
};

/** { on_field_size, sub_interval_seconds } for a team's sport + age group. */
export function gameDefaults(sport, ageGroup) {
  const hit = GAME_DEFAULTS[sport]?.[ageGroup];
  if (!hit) throw new Error(`No game defaults for ${sport} ${ageGroup}`);
  return { on_field_size: hit[0], sub_interval_seconds: hit[1] };
}
