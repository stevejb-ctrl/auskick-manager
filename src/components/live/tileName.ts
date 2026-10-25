// ─── tileName ────────────────────────────────────────────────
// What a screen reader calls a player tile, the same way on every
// sport's tile (accessibility follow-up to UX round 3's R6, 25 Oct
// 2026). Tiles read their parts in DOM order before: AFL's "BCK #1
// Coming off next, pair 4 Zara Q Fwd 0:00, Mid 0:00, Back 1:04 1:04"
// (the zone twice, the kid in the middle), netball's court token "Goal
// Shooter, Zara Quill" (no time), the break's "#1 Zara Quill Stays
// 25:00". Now each says, once and in this order:
//
//   the kid, where they are (line, zone or position), their number,
//   their time, then any state chips
//
//   "Zara Quill, Back, #1, 1:04, Coming off next, pair 4"
//
// The tile's button takes it as its aria-label, so the visible parts
// don't add to it; a time split by zone, if any, goes in the tile's
// description (aria-describedby) rather than the name. The name is the
// kid's whole name: the tile's "Zara Q" is short for the space, and the
// whole name still starts with what's shown (label in name).

type Part = string | null | undefined | false;

export interface TileNameParts {
  /** The kid's whole name ("Zara Quill"). */
  name: string;
  /** Where they are: "Back", "Forwards", "Goal Shooter"; a list reads in order. */
  place?: Part | Part[];
  /** Jumper number (7 or "7"), read as "#7". */
  number?: number | string | null;
  /** Game time as shown ("1:04"). */
  time?: Part;
  /** State chips, in the tile's order: "Coming off next, pair 1", "2 tries", "Injured". */
  states?: Part[];
}

const present = (p: Part): p is string => typeof p === "string" && p.trim().length > 0;

export function tileName({ name, place, number, time, states = [] }: TileNameParts): string {
  const places = Array.isArray(place) ? place : [place];
  const num = number === null || number === undefined || number === "" ? null : `#${String(number).replace(/^#/, "")}`;
  return [name, ...places, num, time, ...states].filter(present).join(", ");
}
