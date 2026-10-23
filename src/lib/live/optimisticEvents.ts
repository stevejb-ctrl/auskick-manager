// ─── Optimistic events over a replay ─────────────────────────
// The sports whose live screen is a replay of the game's events
// (soccer's family, basketball) show a tap the moment it's made, as
// AFL's store does (LiveGame.tsx handleOpponent: update, then queue).
// Each write puts an event of the same shape the server action will
// insert on screen at once; the queue's op id is that event's
// idempotency_key, so when a refresh brings the server's row the
// screen's copy gives way to it and nothing counts twice (UX audit
// 23 Oct 2026, package C: "score taps lag seconds").
//
// Pure: the hook that drives it is useOptimisticEvents.ts.

import type { GameEvent } from "@/lib/types";
import { takeUndoTarget } from "@/lib/live/scoreUndo";

/** An event as a write would insert it (the server stamps the rest). */
export interface OptimisticEventInput {
  type: string;
  player_id?: string | null;
  metadata: Record<string, unknown>;
}

/** An event on screen the server hasn't returned yet. */
export interface PendingEvent extends GameEvent {
  idempotency_key: string;
  /** The write has saved; its row comes with the next refresh. */
  flushed?: boolean;
  /** Refreshes seen since it saved (see settlePendingEvents). */
  refreshesSinceFlush?: number;
}

/**
 * created_at for a write the server hasn't saved yet: after every event
 * the screen has, so the replay (which sorts by created_at with
 * localeCompare) applies it last, even when the phone's clock runs
 * behind the server's. At least the next whole second after the latest:
 * Postgres prints "08:02:00+00:00" for a whole second and
 * "08:02:00.5+00:00" otherwise, and collation puts "." before "+", so a
 * string in the same second can sort either way. A later second always
 * sorts later.
 */
export function optimisticCreatedAt(existing: string[], nowMs: number): string {
  let latest = Number.NEGATIVE_INFINITY;
  for (const at of existing) {
    const ms = Date.parse(at);
    if (Number.isFinite(ms) && ms > latest) latest = ms;
  }
  const nextSecond = Number.isFinite(latest) ? (Math.floor(latest / 1000) + 1) * 1000 : nowMs;
  return new Date(Math.max(nowMs, nextSecond)).toISOString();
}

export function toOptimisticEvent(
  input: OptimisticEventInput,
  opts: { opId: string; gameId: string; createdAt: string },
): PendingEvent {
  return {
    id: `optimistic-${opts.opId}`,
    game_id: opts.gameId,
    type: input.type as GameEvent["type"],
    player_id: input.player_id ?? null,
    metadata: input.metadata,
    created_by: null,
    created_at: opts.createdAt,
    idempotency_key: opts.opId,
  };
}

/** The server's events, then the writes it hasn't returned yet. */
export function mergeOptimisticEvents(server: GameEvent[], pending: GameEvent[]): GameEvent[] {
  if (pending.length === 0) return server;
  const landed = new Set(server.map((e) => e.idempotency_key).filter(Boolean));
  const waiting = pending.filter((e) => !e.idempotency_key || !landed.has(e.idempotency_key));
  return waiting.length === 0 ? server : [...server, ...waiting];
}

/**
 * After a refresh: keep the writes the server hasn't returned. A saved
 * write still missing two refreshes on made no row (an undo with
 * nothing left to take back), so it goes; one refresh may have raced
 * the save.
 */
export function settlePendingEvents<T extends PendingEvent>(pending: T[], server: GameEvent[]): T[] {
  const landed = new Set(server.map((e) => e.idempotency_key).filter(Boolean));
  const out: T[] = [];
  for (const p of pending) {
    if (landed.has(p.idempotency_key)) continue;
    if (!p.flushed) {
      out.push(p);
      continue;
    }
    const seen = (p.refreshesSinceFlush ?? 0) + 1;
    if (seen < 2) out.push({ ...p, refreshesSinceFlush: seen });
  }
  return out;
}

/**
 * The undo a tap would write now: it names the latest score still
 * standing, as the server's undo does (takeUndoTarget). Null when no
 * score stands.
 */
export function optimisticUndo(events: GameEvent[], scoreTypes: ReadonlySet<string>): OptimisticEventInput | null {
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const standing: GameEvent[] = [];
  for (const ev of sorted) {
    if (scoreTypes.has(ev.type)) standing.push(ev);
    else if (ev.type === "score_undo") takeUndoTarget(standing, ev.metadata);
  }
  const latest = standing[standing.length - 1];
  if (!latest) return null;
  return {
    type: "score_undo",
    player_id: latest.player_id ?? null,
    metadata: {
      target_event_id: latest.id,
      original_type: latest.type,
      quarter: (latest.metadata as { quarter?: number } | null)?.quarter,
    },
  };
}
