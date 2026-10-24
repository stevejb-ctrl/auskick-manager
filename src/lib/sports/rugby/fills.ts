// ─── Rugby (league and union): filling empty spots live ──────
// A side short of its size with a kid on the bench who can play (a late
// arrival, a kid back from loan or over an injury): the sub card's first
// suggestions put them on into the empty spots, nobody off, before any
// swap (round 3 edge cases, 24 Oct 2026: every sport's card offered only
// swaps, and following one benched a kid off a side already short).
// Forwards first while they're short of this size's split; the least
// time this game first. Pure.

type Zone = "forward" | "back";

export interface RugbyFill {
  playerId: string;
  zone: Zone;
}

export function rugbyFills(input: {
  lineup: { forwards: readonly string[]; backs: readonly string[] };
  /** Bench kids who can come on now, in squad order. */
  bench: readonly string[];
  onFieldSize: number;
  /** Forwards this size plays (rugbyForwards). */
  forwards: number;
  msByPlayer: Readonly<Record<string, number>>;
}): RugbyFill[] {
  let open = input.onFieldSize - input.lineup.forwards.length - input.lineup.backs.length;
  if (open <= 0) return [];
  let fwd = input.lineup.forwards.length;
  const order = [...input.bench].sort((a, b) => (input.msByPlayer[a] ?? 0) - (input.msByPlayer[b] ?? 0));
  const out: RugbyFill[] = [];
  for (const playerId of order) {
    if (open <= 0) break;
    const zone: Zone = fwd < input.forwards ? "forward" : "back";
    if (zone === "forward") fwd++;
    out.push({ playerId, zone });
    open--;
  }
  return out;
}
