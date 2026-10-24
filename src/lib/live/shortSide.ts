// Kicking off short. Round 3 edge testing (24 Oct 2026): AFL 12-a-side
// with 10 in, union U12 (minimum 12) with 11, and futsal (minimum 3) with
// one kid all started without a word. Playing short is legitimate, so
// the kickoff confirm says it rather than blocking: "Playing 6 of 7",
// and more firmly under the age group's minimum.

export interface ShortSide {
  /** Kids on the field at kickoff. */
  playing: number;
  /** The side's full size (the game's on-field number). */
  size: number;
  /** The fewest the age group plays with. */
  min: number;
}

export function shortSideNote(s: ShortSide): { text: string; belowMin: boolean } | null {
  if (s.playing <= 0 || s.playing >= s.size) return null;
  if (s.playing < s.min) {
    return {
      text: `Playing ${s.playing} of ${s.size}, under the ${s.min} this age group plays with. Borrow a player if you can.`,
      belowMin: true,
    };
  }
  return { text: `Playing ${s.playing} of ${s.size}. Borrow a player, or play on.`, belowMin: false };
}
