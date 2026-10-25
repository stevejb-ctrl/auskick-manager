// ─── Sub-due anchor ───────────────────────────────────────────────
// Shared by the sports whose `swap` events carry `off_player_id`,
// `quarter` and `elapsed_ms`: rugby league and union, and Football
// (soccer). (Moved here from rugby_league/ when soccer needed it.)
//
// The elapsed-ms at which the CURRENT sub interval started — the
// period start, or the most recent PLANNED rotation swap. Forced swaps
// (injury / mark-out) must NOT re-anchor it: an off-cadence forced
// change keeps the rotation clock running toward the next planned sub
// (parity with the AFL sub-timer, issue 5).
//
// A forced swap is written alongside an `injury` event (injured:true)
// for the same player at the same quarter + elapsed, so we skip any swap
// whose (elapsed, off-player) matches such an injury. Pure + event-
// derived, so it recomputes identically on remount.
//
// A due batch made one swap at a time re-anchors only on its last swap:
// each swap made from the sub card says how many of the batch are still
// to make (`batch_left`), and one with some left doesn't move the clock.
// Otherwise doing 1 of 2 due swaps restarted the countdown and the other
// due swap fell off the card (soccer audit, 23 Oct 2026). A swap with no
// `batch_left` (every swap before this, other sports') re-anchors as
// it always has.
//
// A swap the coach makes by hand (tap a kid, tap another) says so
// (`manual: true`) and doesn't move the anchor either: AFL's rule, now
// every sport's. A hand swap is off the rotation's cadence, so the clock
// keeps running toward the next planned sub (round-2 usability test,
// 24 Oct 2026: soccer's countdown jumped from 3:15 to 3:58 on one).
//
// AFL's live screen keeps its sub clock on the phone too, since its
// swaps don't refresh the page: mergeSubAnchor folds the events' anchor
// into it, so a reload picks up the last planned sub instead of
// guessing from the clock.

import type { GameEvent } from "@/lib/types";

interface SwapMeta {
  quarter?: number;
  elapsed_ms?: number;
  off_player_id?: string;
  /** Swaps of the due batch still to make after this one. */
  batch_left?: number;
  /** Made by hand, off the rotation's cadence. */
  manual?: boolean;
}
interface InjuryMeta {
  quarter?: number;
  elapsed_ms?: number;
  injured?: boolean;
}

/**
 * Resolve the rotation-clock anchor for `currentQuarter`:
 *   • the elapsed_ms of the most recent PLANNED swap this period that
 *     finished its batch, or
 *   • 0 at the period start, or
 *   • null before the period has started.
 * Forced (injury/out) swaps, and swaps with more of their batch to come,
 * are skipped.
 */
export function resolveSubAnchorElapsed(
  events: readonly GameEvent[],
  currentQuarter: number,
): number | null {
  if (currentQuarter < 1) return null;
  for (const { ev, meta } of plannedSwapsAndStart(events, currentQuarter)) {
    if (ev.type === "quarter_start") return 0;
    if (batchLeft(meta) > 0) continue; // more of the batch to come
    return typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : null;
  }
  return null;
}

/**
 * The swaps a due batch made one at a time still has to make: the
 * latest planned swap's `batch_left` this period, 0 once the batch is
 * done (or none is open). The sub card shows just these: with the
 * clock held, the suggester would otherwise offer the kid just taken
 * off straight back on, as a second "due" swap.
 */
export function openSubBatch(events: readonly GameEvent[], currentQuarter: number): number {
  if (currentQuarter < 1) return 0;
  const latest = plannedSwapsAndStart(events, currentQuarter)[0];
  return latest?.ev.type === "swap" ? batchLeft(latest.meta) : 0;
}

const batchLeft = (meta: SwapMeta): number => (typeof meta.batch_left === "number" && meta.batch_left > 0 ? meta.batch_left : 0);

/**
 * This period's planned swaps, newest first, then its quarter_start.
 * Forced swaps and hand swaps are left out.
 */
function plannedSwapsAndStart(events: readonly GameEvent[], currentQuarter: number): { ev: GameEvent; meta: SwapMeta }[] {
  const out: { ev: GameEvent; meta: SwapMeta }[] = [];
  // Signatures of forced swaps: `${elapsed_ms}:${player_id}` for every
  // injury (injured:true) in this period.
  const forced = new Set<string>();
  for (const ev of events) {
    if (ev.type !== "injury" || !ev.player_id) continue;
    const m = ev.metadata as InjuryMeta;
    if (m.injured && m.quarter === currentQuarter && typeof m.elapsed_ms === "number") {
      forced.add(`${m.elapsed_ms}:${ev.player_id}`);
    }
  }

  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    const meta = ev.metadata as SwapMeta;
    if (meta.quarter !== currentQuarter) continue;
    if (ev.type === "swap") {
      if (
        typeof meta.elapsed_ms === "number" &&
        meta.off_player_id &&
        forced.has(`${meta.elapsed_ms}:${meta.off_player_id}`)
      ) {
        continue; // forced swap — doesn't re-anchor the rotation clock
      }
      if (meta.manual === true) continue; // by hand, off the cadence
      out.push({ ev, meta });
    }
    if (ev.type === "quarter_start") {
      out.push({ ev, meta });
      break;
    }
  }
  return out;
}

/** A period's sub clock: where its interval started, and the due batch's swaps still to make. */
export interface SubAnchor {
  period: number;
  /** Game ms into the period of the last planned sub (0 at the start). */
  anchorMs: number;
  batchLeft: number;
}

/**
 * AFL's sub clock on the phone, given what the events say
 * (resolveSubAnchorElapsed / openSubBatch for `events.period`, null
 * before the server has the period). A period the phone hasn't seen (a
 * reload, a new quarter) takes the events' anchor, or the period start.
 * In the same period the phone's own wins (its swaps don't refresh the
 * page, so the events lag it) unless the events have a newer planned
 * sub: another phone's.
 */
export function mergeSubAnchor(
  mine: SubAnchor | null,
  events: { period: number; anchorMs: number | null; batchLeft: number },
): SubAnchor {
  if (!mine || mine.period !== events.period) {
    return { period: events.period, anchorMs: events.anchorMs ?? 0, batchLeft: events.batchLeft };
  }
  if (events.anchorMs !== null && events.anchorMs > mine.anchorMs) {
    return { period: events.period, anchorMs: events.anchorMs, batchLeft: events.batchLeft };
  }
  return mine;
}
