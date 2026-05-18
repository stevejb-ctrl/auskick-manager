// ─── Rugby league vested-role derivation ─────────────────────
// Junior Laws §12: at U8+, the First Receiver wears a vest; at U9+
// the Dummy Half also wears one. Vests must rotate each period
// and — critically — "one vest worn once during a match" — no
// player wears the same vest type twice in a game.
//
// One carve-out exists for injuries: when a vested player is
// injured and leaves the field, the vest may pass to a replacement
// "for the expiry of that period of play". Both the original
// wearer AND the replacement count against the "one vest worn
// once" rule — the laws explicitly say so.
//
// All state derives from `vest_assigned` events on the game's
// event log. Metadata shape:
//   {
//     vest: "fr" | "dh",
//     period: number,          // which quarter / half this is for
//     replacement?: boolean,   // true = mid-period injury handover
//     sport: "rugby_league",
//   }
// The wearer's id is on `player_id`.

import type { GameEvent } from "@/lib/types";

export type VestType = "fr" | "dh";

export interface CurrentVests {
  /** Player id currently wearing the First Receiver vest, if any. */
  fr?: string;
  /** Player id currently wearing the Dummy Half vest, if any. */
  dh?: string;
}

interface VestEvent {
  player_id: string;
  vest: VestType;
  period: number;
  replacement: boolean;
  /** ISO timestamp for stable LIFO ordering. */
  created_at: string;
}

/**
 * Read every `vest_assigned` event from the log into a typed list.
 * Defensive — skips events with missing / malformed metadata so the
 * UI can never crash from a bad row in the DB. Sorted by created_at
 * ascending so derivations can walk forward in time.
 */
function readVestEvents(events: GameEvent[]): VestEvent[] {
  const out: VestEvent[] = [];
  for (const ev of events) {
    if (ev.type !== "vest_assigned") continue;
    if (!ev.player_id) continue;
    const meta = ev.metadata as {
      vest?: string;
      period?: number;
      replacement?: boolean;
    };
    if (meta.vest !== "fr" && meta.vest !== "dh") continue;
    if (typeof meta.period !== "number") continue;
    out.push({
      player_id: ev.player_id,
      vest: meta.vest,
      period: meta.period,
      replacement: meta.replacement === true,
      created_at: ev.created_at,
    });
  }
  out.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return out;
}

/**
 * Current vest holders for a given period — the LATEST
 * vest_assigned event for each vest type within that period wins.
 * Returns an empty `{}` when no vests have been assigned for the
 * period yet.
 *
 * Used by the live UI to surface the badge overlays on player
 * tiles, and by the orchestrator to gate the "vest already
 * assigned for this period" affordance state.
 */
export function currentVests(
  events: GameEvent[],
  period: number,
): CurrentVests {
  const vests = readVestEvents(events).filter((v) => v.period === period);
  const result: CurrentVests = {};
  for (const v of vests) {
    // Last write wins per vest.
    if (v.vest === "fr") result.fr = v.player_id;
    else result.dh = v.player_id;
  }
  return result;
}

/**
 * All players who have ever worn this vest type in this game.
 * Includes replacements (laws §12: "Remember - one vest worn once
 * during a match" — counts the replacement period too).
 * Used to gate the picker so the coach can't reassign someone who
 * has already had a turn.
 */
export function vestHistory(
  events: GameEvent[],
  vest: VestType,
): Set<string> {
  const seen = new Set<string>();
  for (const v of readVestEvents(events)) {
    if (v.vest === vest) seen.add(v.player_id);
  }
  return seen;
}

/**
 * Can this player wear this vest now? `false` if they've already
 * worn it this game (regardless of replacement vs fresh assignment
 * — the laws don't distinguish). The picker greys out ineligible
 * players; the server-side guard in `assignLeagueVest` is the
 * authority.
 */
export function eligibleForVest(
  events: GameEvent[],
  playerId: string,
  vest: VestType,
): boolean {
  return !vestHistory(events, vest).has(playerId);
}

/**
 * The pool of squad players who could legally be assigned this
 * vest for the next period — those who are eligible (haven't worn
 * the vest yet) AND currently on the field (a vest only goes on
 * a player who's on the pitch).
 */
export function eligibleVestCandidates(
  events: GameEvent[],
  onFieldPlayerIds: string[],
  vest: VestType,
): string[] {
  const used = vestHistory(events, vest);
  return onFieldPlayerIds.filter((id) => !used.has(id));
}

/**
 * Per-player vest history across the whole game. Returns a map
 * `{ playerId: { fr: number[], dh: number[] } }` where the
 * inner numbers are the periods that player wore each vest. Drives
 * the post-game dashboard / equity report. Most players will appear
 * in zero or one entry, which is the whole point of the rotation
 * rule.
 */
export function vestHistoryByPlayer(
  events: GameEvent[],
): Record<string, { fr: number[]; dh: number[] }> {
  const result: Record<string, { fr: number[]; dh: number[] }> = {};
  for (const v of readVestEvents(events)) {
    result[v.player_id] ??= { fr: [], dh: [] };
    result[v.player_id][v.vest].push(v.period);
  }
  return result;
}
