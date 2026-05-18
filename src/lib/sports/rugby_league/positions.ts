// ─── Rugby League position/chip convention ────────────────────
// The cohort-chip data model (Player.chip, Team.chip_*_label) is
// sport-agnostic, but rugby league pins specific semantics onto
// the chip keys:
//
//   chip = "a"  → Forward
//   chip = "b"  → Back
//   chip = "c"  → no position preference (free / unused)
//   chip = null → no position preference
//
// The label text on the team row (chip_a_label, chip_b_label) is
// free-form — coaches can rename "Forward" to "Pack" if they want
// — but the KEY-to-ZONE mapping is fixed by this module. Migration
// 0039 seeds the default labels so chip A reads "Forward" and chip
// B reads "Back" without any coach action.

import type { PlayerChip, LeagueZone } from "@/lib/types";

/** Chip-key → preferred zone. Returns null when the chip carries
 *  no position preference (chip = "c" or unset). */
export function chipZone(chip: PlayerChip | null | undefined): LeagueZone | null {
  if (chip === "a") return "forward";
  if (chip === "b") return "back";
  return null;
}

/** Chip key reserved for the Forward role. */
export const FORWARD_CHIP: PlayerChip = "a";
/** Chip key reserved for the Back role. */
export const BACK_CHIP: PlayerChip = "b";
