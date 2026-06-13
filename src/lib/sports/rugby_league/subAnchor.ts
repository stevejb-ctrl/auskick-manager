// ─── Rugby-league sub-due anchor ──────────────────────────────────
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

import type { GameEvent } from "@/lib/types";

interface SwapMeta {
  quarter?: number;
  elapsed_ms?: number;
  off_player_id?: string;
}
interface InjuryMeta {
  quarter?: number;
  elapsed_ms?: number;
  injured?: boolean;
}

/**
 * Resolve the rotation-clock anchor for `currentQuarter`:
 *   • the elapsed_ms of the most recent PLANNED swap this period, or
 *   • 0 at the period start, or
 *   • null before the period has started.
 * Forced (injury/out) swaps are skipped.
 */
export function resolveLeagueSubAnchorElapsed(
  events: readonly GameEvent[],
  currentQuarter: number,
): number | null {
  if (currentQuarter < 1) return null;

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
      return typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : null;
    }
    if (ev.type === "quarter_start") {
      return 0;
    }
  }
  return null;
}
