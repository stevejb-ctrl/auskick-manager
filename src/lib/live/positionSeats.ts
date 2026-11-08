// ─── Who stands where: the live seat map ─────────────────────
// On a big field (AFL U11+ named positions) each kid on the field holds
// a seat: a position key. assignPositionKeys deals the seats from
// scratch, so calling it on every lineup change reshuffles who's where
// after each sub. The seat map instead replays the game: seats are dealt
// at each lineup_set, a kid coming on takes the seat of the kid coming
// off, and kids trading places trade seats. Pure.
//
// position_swap (two kids trading named positions, or one moving to an
// empty spot) isn't recorded yet; the type below is its shape, so the
// replay already handles it when the event lands.

import { normalizeLineup, type GameEvent, type Lineup, type Zone } from "@/lib/types";
import { assignPositionKeys, type AflPlaybookInput } from "@/lib/sports/afl/engine";

/** positionKey → the kid in it, or null while it's empty. Every position has a key. */
export type Seats = Record<string, string | null>;

/** What the seats need of the team's positions. */
export type SeatPosition = { key: string; label: string; line: Zone };

export type SeatInput = Pick<AflPlaybookInput, "positionRoles"> & { positions: SeatPosition[] };

/** A position change: `player_a_id` moves to `position_b`; whoever held it goes to `position_a`. */
export interface PositionSwapEvent {
  type: "position_swap";
  player_id?: string | null;
  created_at: string;
  metadata: {
    player_a_id: string;
    player_b_id?: string | null;
    position_a: string;
    position_b: string;
  };
}

export type SeatEvent = GameEvent | PositionSwapEvent;

/** Zones on each line, as the engine reads them (half-back is back). */
const LINE_OF_ZONE: Record<Zone, Zone> = { back: "back", hback: "back", mid: "mid", hfwd: "fwd", fwd: "fwd" };

/** Seats dealt for a lineup (assignPositionKeys), every other position empty. */
export function seedSeats(lineup: Lineup, input: SeatInput): Seats {
  const seats: Seats = {};
  for (const p of input.positions) seats[p.key] = null;
  for (const [pid, key] of Object.entries(assignPositionKeys(lineup, input))) seats[key] = pid;
  return seats;
}

/** The seat a kid holds, or null. */
export function seatOf(seats: Seats, pid: string): string | null {
  for (const [key, who] of Object.entries(seats)) if (who === pid) return key;
  return null;
}

/** `on` takes `off`'s seat; `off` holds none. Unchanged when `off` has no seat. */
export function seatSub(seats: Seats, off: string, on: string): Seats {
  const key = seatOf(seats, off);
  if (!key || seatOf(seats, on)) return seats;
  return { ...seats, [key]: on };
}

/** Two kids trade seats. A kid with no seat takes the other's and leaves theirs empty. */
export function seatSwap(seats: Seats, a: string, b: string): Seats {
  const ka = seatOf(seats, a);
  const kb = seatOf(seats, b);
  if (!ka && !kb) return seats;
  const next = { ...seats };
  if (ka) next[ka] = kb ? b : null;
  if (kb) next[kb] = a;
  return next;
}

/** A kid leaves the field (hurt, lent, sent off the field): their seat empties. */
export function seatLeave(seats: Seats, pid: string): Seats {
  const key = seatOf(seats, pid);
  return key ? { ...seats, [key]: null } : seats;
}

/**
 * A kid comes on into an empty spot on `line`: the seat `prefer` names
 * if it's empty and on that line (the seat an injured kid just left),
 * else the first empty one in formation order. Unchanged when the kid
 * already has a seat or the line has none free.
 */
export function seatFill(seats: Seats, pid: string, line: Zone, positions: SeatPosition[], prefer?: string | null): Seats {
  if (seatOf(seats, pid)) return seats;
  const free = positions.filter((p) => p.line === line && seats[p.key] === null);
  const pick = free.find((p) => p.key === prefer) ?? free[0];
  return pick ? { ...seats, [pick.key]: pid } : seats;
}

/** A kid moves to the seat `to`; whoever held it takes the kid's old seat (or it empties). */
export function seatMove(seats: Seats, pid: string, to: string): Seats {
  if (!(to in seats)) return seats;
  const from = seatOf(seats, pid);
  if (from === to) return seats;
  const other = seats[to];
  const next = { ...seats, [to]: pid };
  if (from) next[from] = other;
  return next;
}

const zoneOf = (v: unknown): Zone | null =>
  typeof v === "string" && v in LINE_OF_ZONE ? (v as Zone) : null;

/**
 * The seats at the end of `events`, a game's log in any order (sorted by
 * created_at, as replayGame does). Null before the first lineup_set or
 * when the team has no positions.
 */
export function replaySeats(events: readonly SeatEvent[], input: SeatInput): Seats | null {
  if (input.positions.length === 0) return null;
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  let seats: Seats | null = null;
  // The seat each kid last held, for a replacement coming into it.
  const lastSeat: Record<string, string> = {};
  const leave = (pid: string) => {
    if (!seats) return;
    const key = seatOf(seats, pid);
    if (key) lastSeat[pid] = key;
    seats = seatLeave(seats, pid);
  };

  for (const ev of sorted) {
    if (ev.type === "lineup_set") {
      const lineup = (ev.metadata as { lineup?: unknown } | null)?.lineup;
      if (lineup) seats = seedSeats(normalizeLineup(lineup as Partial<Lineup>), input);
      continue;
    }
    if (!seats) continue;
    const meta = (ev.metadata ?? {}) as Record<string, unknown>;
    switch (ev.type) {
      case "swap": {
        const on = typeof meta.on_player_id === "string" ? meta.on_player_id : null;
        const off = typeof meta.off_player_id === "string" && meta.off_player_id ? meta.off_player_id : null;
        if (!on || seatOf(seats, on)) break;
        if (off && seatOf(seats, off)) {
          lastSeat[off] = seatOf(seats, off)!;
          seats = seatSub(seats, off, on);
          break;
        }
        // Into an empty spot: where the off kid stood if they already left
        // (an injury or loan landed first), else the first free one.
        const zone = zoneOf(meta.zone);
        if (zone) seats = seatFill(seats, on, LINE_OF_ZONE[zone], input.positions, off ? lastSeat[off] : null);
        break;
      }
      case "field_zone_swap": {
        const a = typeof meta.player_a_id === "string" ? meta.player_a_id : null;
        const b = typeof meta.player_b_id === "string" && meta.player_b_id ? meta.player_b_id : null;
        if (!a) break;
        if (b) {
          seats = seatSwap(seats, a, b);
          break;
        }
        // Into an empty spot on another line: leave this seat, take a free one there.
        const zoneB = zoneOf(meta.zone_b);
        if (!zoneB) break;
        const from = seatOf(seats, a);
        if (from && input.positions.find((p) => p.key === from)?.line === LINE_OF_ZONE[zoneB]) break;
        const left = seatLeave(seats, a);
        const moved = seatFill(left, a, LINE_OF_ZONE[zoneB], input.positions);
        if (seatOf(moved, a)) seats = moved;
        break;
      }
      case "position_swap": {
        const { player_a_id: a, position_b: to } = meta as PositionSwapEvent["metadata"];
        if (typeof a === "string" && typeof to === "string") seats = seatMove(seats, a, to);
        break;
      }
      case "injury": {
        const pid = ev.player_id;
        if (pid && ((meta.injured as boolean | undefined) ?? true)) leave(pid);
        break;
      }
      case "player_loan": {
        const pid = ev.player_id;
        if (pid && ((meta.loaned as boolean | undefined) ?? true)) leave(pid);
        break;
      }
      case "roster_shrink": {
        const ids = Array.isArray(meta.remove_player_ids) ? (meta.remove_player_ids as unknown[]) : [];
        for (const pid of ids) if (typeof pid === "string") leave(pid);
        break;
      }
      default:
        break;
    }
  }
  return seats;
}

/** playerId → position label, for the tiles. */
export function seatLabels(seats: Seats | null, positions: readonly SeatPosition[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!seats) return out;
  const label = new Map(positions.map((p) => [p.key, p.label]));
  for (const [key, pid] of Object.entries(seats)) if (pid) out[pid] = label.get(key) ?? key;
  return out;
}
