// ─── AFL's big field, live ───────────────────────────────────
// From U13 an AFL side plays 15, 16 or 18 a side, and from U11 the coach
// can name positions (How we play). On a big field the live screen
// draws the team's formation (playbook FORMATIONS, or the team's own
// positions), each kid in their seat: "CHB Jack S". Small sides, and
// the zoned ages, keep the zone lines they've always had.
//
// The seats come from the game's log (lib/live/positionSeats): dealt at
// each lineup, a sub takes the off-going kid's seat, a position change
// (position_swap) moves them. And AFL's rotation rule, the game-time
// minimum (minGameTimePct, 50–75 %), is said live as "Needs N′ more"
// for a kid at risk of missing it by full time (lib/live/minGameTime).
// Pure.

import type { GameEvent, Lineup, PositionModel as ZoneModel, Zone } from "@/lib/types";
import type { PositionDef } from "@/lib/playbook/types";
import type { ResolvedPlaybook } from "@/lib/playbook/team";
import type { AflPlaybookInput } from "@/lib/sports/afl/engine";
import { defaultAflPositions } from "@/lib/sports/afl/playbook";
import { fitSeats, replaySeats, type SeatInput, type SeatPosition, type Seats } from "@/lib/live/positionSeats";
import { awayMsByPeriod } from "@/lib/playbook/awayTime";
import { minTimeState, type MinTimeState } from "@/lib/live/minGameTime";

/**
 * From this many on, an AFL field with named positions is drawn as its
 * formation (the design's "big fields: 14 to 18 on"). U13–U15 play 15,
 * U16+ girls 16, boys 18.
 */
export const AFL_BIG_FIELD_FROM = 14;

/** What the live screen needs to draw a big field. */
export interface AflBigField {
  /** The formation: each position with its line and where it's drawn. */
  positions: PositionDef[];
  /** Who's in which position, from the game's log; null before the lineup. */
  seats: Seats | null;
}

/**
 * The positions a big field is drawn with: the team's own (How we play ›
 * Positions) or the default formation for the game's size. Null where
 * the field keeps its zone lines: the zoned ages (no positions), fewer
 * than AFL_BIG_FIELD_FROM on, or a five-zone field.
 */
export function aflBigFieldPositions(
  playbook: Pick<ResolvedPlaybook, "positionModel" | "customPositions" | "positions">,
  onFieldSize: number,
  zoneModel: ZoneModel,
): PositionDef[] | null {
  if (playbook.positionModel.kind !== "custom") return null;
  if (zoneModel !== "zones3") return null;
  if (onFieldSize < AFL_BIG_FIELD_FROM) return null;
  const positions = playbook.customPositions ? playbook.positions : defaultAflPositions(onFieldSize);
  return positions.length > 0 ? positions : null;
}

/** The seat map's input for a formation (and set positions' homes). */
export function aflSeatInput(
  positions: readonly PositionDef[],
  playbook: Pick<AflPlaybookInput, "positionRoles"> | null | undefined,
): SeatInput {
  return {
    positions: positions.map((p): SeatPosition => ({ key: p.key, label: p.label, line: p.line as Zone })),
    positionRoles: playbook?.positionRoles,
  };
}

/**
 * The big field for a game, or null to keep the zone lines. `lineup` is
 * the replay's (who's on the field now), so the seats always fit it.
 */
export function aflBigField(input: {
  playbook: Pick<ResolvedPlaybook, "positionModel" | "customPositions" | "positions">;
  aflPlaybook?: Pick<AflPlaybookInput, "positionRoles"> | null;
  onFieldSize: number;
  zoneModel: ZoneModel;
  events: readonly GameEvent[];
  lineup: Lineup | null;
}): AflBigField | null {
  const positions = aflBigFieldPositions(input.playbook, input.onFieldSize, input.zoneModel);
  if (!positions) return null;
  const seatInput = aflSeatInput(positions, input.aflPlaybook);
  const replayed = replaySeats(input.events, seatInput);
  return {
    positions,
    seats: input.lineup ? fitSeats(replayed, input.lineup, seatInput.positions).seats : replayed,
  };
}

/**
 * Time each kid couldn't play so far (late, hurt, lent), in ms: off
 * their game for the minimum, as the break's rule check takes it off.
 * Counted to the period in play; an absence still open runs to its end,
 * but a kid who's out isn't flagged anyway.
 */
export function aflAwayMs(events: readonly GameEvent[], quarterMs: number, currentQuarter: number): Record<string, number> {
  if (currentQuarter < 1) return {};
  const byPeriod = awayMsByPeriod(events, () => quarterMs, currentQuarter);
  const out: Record<string, number> = {};
  for (const [pid, periods] of Object.entries(byPeriod)) out[pid] = Object.values(periods).reduce((t, ms) => t + ms, 0);
  return out;
}

export interface AflMinTimeInput {
  /** The minimum, % of the game (0: none). */
  minPct: number;
  /** ms each kid has played this game, the open stint included. */
  playedMs: Record<string, number>;
  awayMs?: Record<string, number>;
  /** Game time gone: the quarters played and the clock in this one. */
  elapsedMs: number;
  quarterMs: number;
  periodCount: number;
  /** The wait for a kid's next chance to come on: the sub interval. */
  soonMs: number;
  /** The kids in the game: on the field and the bench. */
  playerIds: readonly string[];
  /** Out right now (hurt, lent): never flagged. */
  out: ReadonlySet<string>;
}

/** Each kid against the minimum; empty with no minimum. */
export function aflMinTimeStates(input: AflMinTimeInput): Map<string, MinTimeState> {
  const states = new Map<string, MinTimeState>();
  if (input.minPct <= 0 || input.quarterMs <= 0) return states;
  const gameMs = input.periodCount * input.quarterMs;
  for (const pid of input.playerIds) {
    states.set(
      pid,
      minTimeState({
        playedMs: input.playedMs[pid] ?? 0,
        awayMs: input.awayMs?.[pid] ?? 0,
        gameMs,
        elapsedMs: input.elapsedMs,
        minPct: input.minPct,
        soonMs: input.soonMs,
        out: input.out.has(pid),
      }),
    );
  }
  return states;
}
