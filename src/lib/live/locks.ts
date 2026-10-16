import type { GameEvent, Zone } from "@/lib/types";

/**
 * A coach's in-game hold on a player: Keep on (field), Keep in {zone}
 * (AFL) or Keep in {position} (netball). Saved as a `player_lock`
 * event so a reload, or a co-manager's phone, replays the same holds
 * (UX plan §6 Live: "keep-on and fixed are saved, not browser-only").
 */
export type PlayerLock =
  | { kind: "field" }
  | { kind: "zone"; zone: string }
  | { kind: "position"; position: string };

/** `player_lock` metadata. A null lock clears the player's hold. */
export interface PlayerLockMeta {
  lock: PlayerLock | null;
  quarter: number;
  elapsed_ms: number;
}

export function isPlayerLock(v: unknown): v is PlayerLock {
  if (!v || typeof v !== "object") return false;
  const l = v as { kind?: unknown; zone?: unknown; position?: unknown };
  if (l.kind === "field") return true;
  if (l.kind === "zone") return typeof l.zone === "string" && l.zone.length > 0;
  if (l.kind === "position") return typeof l.position === "string" && l.position.length > 0;
  return false;
}

/**
 * Each player's current hold, from the game's events in order: the
 * latest event per player wins, and a null lock clears it. Insertion
 * order follows the latest hold, so callers that resolve clashes
 * (two kids held on one bib) can let the later one win.
 */
export function replayLocks(events: Pick<GameEvent, "type" | "player_id" | "metadata">[]): Record<string, PlayerLock> {
  const out: Record<string, PlayerLock> = {};
  for (const ev of events) {
    if (ev.type !== "player_lock" || !ev.player_id) continue;
    const lock = (ev.metadata as Partial<PlayerLockMeta> | null)?.lock;
    delete out[ev.player_id];
    if (isPlayerLock(lock)) out[ev.player_id] = lock;
  }
  return out;
}

/** AFL live store shape: field locks and zone locks. */
export function aflStoreLocks(locks: Record<string, PlayerLock>): {
  lockedIds: string[];
  zoneLockedPlayers: Record<string, Zone>;
} {
  const lockedIds: string[] = [];
  const zoneLockedPlayers: Record<string, Zone> = {};
  for (const [pid, lock] of Object.entries(locks)) {
    if (lock.kind === "field") lockedIds.push(pid);
    else if (lock.kind === "zone") zoneLockedPlayers[pid] = lock.zone as Zone;
  }
  return { lockedIds, zoneLockedPlayers };
}

/** Netball: bib → player. One player per bib; the latest hold wins. */
export function netballPositionLocks(locks: Record<string, PlayerLock>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [pid, lock] of Object.entries(locks)) {
    if (lock.kind === "position") out[lock.position] = pid;
  }
  return out;
}
