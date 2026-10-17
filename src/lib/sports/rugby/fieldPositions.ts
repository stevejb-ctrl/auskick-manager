// ─── Rugby field: kids by named position ─────────────────────
// With named positions on, each kid stands in their position's spot: the
// line's spots read row by row (top to bottom, left to right), and the
// line's positions in the order they're listed, so the n-th position
// takes the n-th spot. A U11 union backline then reads Halfback / Centre
// / Five-eighth, then Left wing / Fullback / Right wing (Steve, 17 Oct
// 2026). Tiles used to fill in lineup order, so a kid labelled FB15 could
// stand on a wing.
//
// A position whose kid is off (lent, hurt) keeps its spot empty, so
// nobody shuffles. A kid with no position (or one past the line's spots)
// takes a spot still free in their line, then one in the other line.

import type { FieldSlot } from "@/lib/sports/rugby_league/fieldFormation";

type Line = "forwards" | "backs";

const lineOf = (slot: FieldSlot): Line =>
  slot.role === "forward" || slot.role === "dh" ? "forwards" : "backs";

/** Each line's position labels in their listed order, or undefined when none. */
export function linePositionOrder(
  positions: { label: string; line: string }[] | null | undefined,
): Record<Line, string[]> | undefined {
  if (!positions || positions.length === 0) return undefined;
  return {
    forwards: positions.filter((p) => p.line === "forwards").map((p) => p.label),
    backs: positions.filter((p) => p.line === "backs").map((p) => p.label),
  };
}

/** slot id → player id (null where nobody stands). */
export function placeByPosition(
  slots: FieldSlot[],
  forwardIds: string[],
  backIds: string[],
  labelOf: Record<string, string | undefined>,
  order: Record<Line, string[]>,
): Record<string, string | null> {
  const placed: Record<string, string | null> = Object.fromEntries(slots.map((s) => [s.id, null]));
  const spots = (line: Line) =>
    slots.filter((s) => lineOf(s) === line).sort((a, b) => a.y - b.y || a.x - b.x);
  const homeless: Record<Line, string[]> = { forwards: [], backs: [] };

  for (const [line, ids] of [["forwards", forwardIds], ["backs", backIds]] as const) {
    const lineSpots = spots(line);
    for (const id of ids) {
      const label = labelOf[id];
      const at = label ? order[line].indexOf(label) : -1;
      const spot = at >= 0 ? lineSpots[at] : undefined;
      if (spot && placed[spot.id] === null) placed[spot.id] = id;
      else homeless[line].push(id);
    }
  }

  // No position (or no spot for it): a free spot in the kid's own line,
  // then, the line full, one in the other.
  const free = (line: Line) => spots(line).filter((s) => placed[s.id] === null);
  for (const line of ["forwards", "backs"] as const) {
    const other: Line = line === "forwards" ? "backs" : "forwards";
    for (const id of homeless[line]) {
      const spot = free(line)[0] ?? free(other)[0];
      if (spot) placed[spot.id] = id;
    }
  }
  return placed;
}
