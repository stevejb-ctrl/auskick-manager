// The one line over each sport's starting-lineup field. One string so
// the sports can't drift (design review, Oct 2026: four pickers said
// "Long-press for…", a word coaches don't use). Live v3 (10 Nov 2026):
// it opens with the period break's own words over its field, as the
// picker is the break's job before kickoff, and it sits over the field
// (PickerField) in every sport, not under a heading in some.
export const LINEUP_TAP_HINT =
  "Tap two players to swap — any position or bench. Press and hold a player to bench or lend them.";

// League and union also pick the First Receiver / Dummy Half vests and
// named positions from the same press-and-hold sheet.
export const LEAGUE_LINEUP_TAP_HINT =
  "Tap two players to swap — any position or bench. Press and hold a player for vests, positions or the bench.";
