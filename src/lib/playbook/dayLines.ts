// Carnival day (UX plan §7.4): "every player plays every third across
// the day's games". The day is the team's other games that started
// within 12 hours of this one, so no carnival needs setting up.

import type { GameEvent } from "@/lib/types";
import type { SportId } from "@/lib/sports/types";
import type { BalanceUnit } from "./types";
import { seasonTimeByUnit } from "./seasonTime";
import type { NetballPlaybookInput } from "@/lib/sports/netball/engine";

const DAY_MS = 12 * 60 * 60 * 1000;

/** The lines (units) each player has played in the team's other games that day. */
export function linesEarlierToday(
  sport: SportId,
  otherGamesEvents: GameEvent[],
  unit: BalanceUnit,
  at: string,
  periodSeconds?: number,
): Record<string, string[]> {
  const startOf = new Map<string, string>();
  for (const e of otherGamesEvents) {
    const cur = startOf.get(e.game_id);
    if (!cur || e.created_at < cur) startOf.set(e.game_id, e.created_at);
  }
  const atMs = Date.parse(at);
  const sameDay = otherGamesEvents.filter((e) => Math.abs(Date.parse(startOf.get(e.game_id)!) - atMs) < DAY_MS);
  const out: Record<string, string[]> = {};
  for (const [pid, byUnit] of Object.entries(seasonTimeByUnit(sport, sameDay, unit, { periodSeconds }))) {
    const played = Object.entries(byUnit)
      .filter(([, ms]) => ms > 0)
      .map(([k]) => k);
    if (played.length > 0) out[pid] = played;
  }
  return out;
}

/**
 * Netball: add the thirds each kid played in the day's earlier games,
 * when a Carnival day rule needs them. The game's own first event (or
 * now, before kickoff) dates the day.
 */
export function withThirdsToday(
  input: NetballPlaybookInput,
  otherGamesEvents: GameEvent[],
  thisGameEvents: GameEvent[],
  periodSeconds: number,
): NetballPlaybookInput {
  if (!(input.rules ?? []).some((r) => r.kind === "every-line-per-day" && r.enabled !== false)) return input;
  const at =
    thisGameEvents.reduce<string | null>((m, e) => (!m || e.created_at < m ? e.created_at : m), null) ??
    new Date().toISOString();
  return { ...input, thirdsToday: linesEarlierToday("netball", otherGamesEvents, "third", at, periodSeconds) };
}
