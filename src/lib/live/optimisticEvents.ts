// ─── Optimistic events over a replay ─────────────────────────
// The sports whose live screen is a replay of the game's events
// (soccer's family, basketball, touch's family, rugby) show a tap the
// moment it's made, as AFL's store does (LiveGame.tsx handleOpponent:
// update, then queue).
// Each write puts an event of the same shape the server action will
// insert on screen at once; the queue's op id is that event's
// idempotency_key, so when a refresh brings the server's row the
// screen's copy gives way to it and nothing counts twice (UX audit
// 23 Oct 2026, package C: "score taps lag seconds").
//
// Pure: the hook that drives it is useOptimisticEvents.ts.

import type { GameEvent } from "@/lib/types";
import { takeUndoTarget } from "@/lib/live/scoreUndo";
import type { ClockPauseInput } from "@/lib/live/clockPause";

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

/**
 * An event on screen that the server hasn't returned yet: its id isn't
 * a row's, so nothing sent to the server may name it (a conversion's
 * try, say).
 */
export function isOptimisticEventId(id: string): boolean {
  return id.startsWith("optimistic-");
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

type At = { quarter: number; elapsed_ms: number };

/**
 * The events the live actions insert, built the same way for the
 * screen (each mirrors its server action's insert: live/actions.ts for
 * the sideline; soccer-, basketball-, touch- and league-actions.ts for
 * swaps, moves, lineups and scores). The server adds `sport` to
 * metadata; the replays don't read it.
 */
export const liveEvents = {
  /** recordSoccerSwap / recordBasketballSwap / recordTouchSwap / recordLeagueSwap. */
  swap(
    input: { off_player_id: string | null; on_player_id: string; line?: string; batch_left?: number; manual?: boolean } & At,
  ): OptimisticEventInput {
    return {
      type: "swap",
      player_id: input.on_player_id,
      metadata: {
        off_player_id: input.off_player_id,
        on_player_id: input.on_player_id,
        ...(input.line ? { line: input.line } : {}),
        quarter: input.quarter,
        elapsed_ms: input.elapsed_ms,
        ...(input.batch_left ? { batch_left: input.batch_left } : {}),
        ...(input.manual ? { manual: true } : {}),
      },
    };
  },
  /** recordSoccerMove / recordBasketballMove. */
  move(input: { player_a_id: string; zone_a: string; player_b_id?: string | null; zone_b: string } & At): OptimisticEventInput {
    return {
      type: "field_zone_swap",
      player_id: input.player_a_id,
      metadata: {
        player_a_id: input.player_a_id,
        zone_a: input.zone_a,
        ...(input.player_b_id ? { player_b_id: input.player_b_id } : {}),
        zone_b: input.zone_b,
        quarter: input.quarter,
        elapsed_ms: input.elapsed_ms,
      },
    };
  },
  /** A score of any type (recordSoccerGoal, recordBasketballScore, …). */
  score(type: string, playerId: string | null, at: At): OptimisticEventInput {
    return { type, player_id: playerId, metadata: { quarter: at.quarter, elapsed_ms: at.elapsed_ms } };
  },
  /** markInjury (a foul-out is an injury with reason "fouled_out"). */
  injury(input: { player_id: string; injured: boolean; reason?: string } & At): OptimisticEventInput {
    return {
      type: "injury",
      player_id: input.player_id,
      metadata: {
        injured: input.injured,
        quarter: input.quarter,
        elapsed_ms: input.elapsed_ms,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    };
  },
  /** markLoan. */
  loan(input: { player_id: string; loaned: boolean } & At): OptimisticEventInput {
    return {
      type: "player_loan",
      player_id: input.player_id,
      metadata: { loaned: input.loaned, quarter: input.quarter, elapsed_ms: input.elapsed_ms },
    };
  },
  /** recordPlayerLock. */
  lock(input: { player_id: string; lock: unknown } & At): OptimisticEventInput {
    return {
      type: "player_lock",
      player_id: input.player_id,
      metadata: { lock: input.lock, quarter: input.quarter, elapsed_ms: input.elapsed_ms },
    };
  },
  /** addLateArrival. */
  arrived(input: { player_id: string } & At): OptimisticEventInput {
    return { type: "player_arrived", player_id: input.player_id, metadata: { quarter: input.quarter, elapsed_ms: input.elapsed_ms } };
  },
  /** recordLeagueLineupSet / recordTouchLineupSet: the whole lineup, mid-period. */
  lineupSet(input: { lineup: unknown } & At): OptimisticEventInput {
    return {
      type: "lineup_set",
      player_id: null,
      metadata: { lineup: input.lineup, quarter: input.quarter, elapsed_ms: input.elapsed_ms },
    };
  },
  /** recordLeaguePositionChange: a kid on the field to the other line. */
  leaguePositionChange(input: { player_id: string; to_zone: "forward" | "back" } & At): OptimisticEventInput {
    return {
      type: "league_position_change",
      player_id: input.player_id,
      metadata: { to_zone: input.to_zone, quarter: input.quarter, elapsed_ms: input.elapsed_ms },
    };
  },
  /** recordConversionAttempt: a kick at goal after a try, made or missed. */
  conversion(
    input: { kicker_id: string; made: boolean; force: boolean; try_event_id?: string } & At,
  ): OptimisticEventInput {
    return {
      type: "conversion_attempt",
      player_id: input.kicker_id,
      metadata: {
        quarter: input.quarter,
        elapsed_ms: input.elapsed_ms,
        made: input.made,
        force: input.force,
        ...(input.try_event_id ? { try_event_id: input.try_event_id } : {}),
      },
    };
  },
  /** recordTouchFieldSize: the field a mixed team's rule allows from now. */
  fieldSize(input: { on_field_size: number } & At): OptimisticEventInput {
    return {
      type: "roster_shrink",
      player_id: null,
      metadata: { on_field_size: input.on_field_size, quarter: input.quarter, elapsed_ms: input.elapsed_ms },
    };
  },
  /** recordClockPause: the clock stopped, or started again (lib/live/clockPause). */
  clockPause(input: ClockPauseInput): OptimisticEventInput {
    return {
      type: "clock_pause",
      player_id: null,
      metadata: { quarter: input.quarter, paused: input.paused, elapsed_ms: input.elapsed_ms, at_ms: input.at_ms },
    };
  },
};
