// ─── Kids who went home ──────────────────────────────────────
// "Out" (a kid leaving early) is recorded as an injury with reason
// "out", so it sidelines them everywhere an injury does. Nothing read
// the reason back, and a kid whose mum took them home read as hurt on
// every tile, break and summary (Stagehand round 7, 28 Oct 2026).
// These say which of the sidelined kids went home.

interface InjuryEventLike {
  type: string;
  player_id?: string | null;
  metadata?: unknown;
}

/** The reason an injury event gives, when it's a kid going home. */
export const WENT_HOME_REASON = "out";

/**
 * Kids whose latest injury event put them out with reason "out", in
 * event order (the events in the order they happened). "Back on" (an
 * injury event with injured: false) or a later real injury clears it.
 */
export function wentHomeIds(events: readonly InjuryEventLike[]): Set<string> {
  const out = new Set<string>();
  for (const ev of events) {
    if (ev.type !== "injury" || !ev.player_id) continue;
    const m = (ev.metadata ?? {}) as { injured?: boolean; reason?: string };
    if ((m.injured ?? true) && m.reason === WENT_HOME_REASON) out.add(ev.player_id);
    else out.delete(ev.player_id);
  }
  return out;
}

/** Who the summary marks: hurt, and gone home (a subset of hurt). */
export interface SidelinedSets {
  injured: ReadonlySet<string>;
  wentHome: ReadonlySet<string>;
}

/** Kids still off at the end of the events: hurt, and of those, gone home. A foul-out isn't either. */
export function sidelinedAtEnd(events: readonly InjuryEventLike[]): SidelinedSets {
  const injured = new Set<string>();
  for (const ev of events) {
    if (ev.type !== "injury" || !ev.player_id) continue;
    const m = (ev.metadata ?? {}) as { injured?: boolean; reason?: string };
    if ((m.injured ?? true) && m.reason !== "fouled_out") injured.add(ev.player_id);
    else injured.delete(ev.player_id);
  }
  return { injured, wentHome: wentHomeIds(events) };
}

/** A sidelined kid's label: "Went home" for a kid who left, else `injured`. */
export function sidelinedLabel(pid: string, wentHome: ReadonlySet<string>, injured = "Injured"): string {
  return wentHome.has(pid) ? "Went home" : injured;
}

/** The summary's note after a kid's game time: " · went home" / " · injured". */
export function summaryStatusNote(pid: string, sets: SidelinedSets | undefined): string {
  if (!sets) return "";
  if (sets.wentHome.has(pid)) return " · went home";
  if (sets.injured.has(pid)) return " · injured";
  return "";
}
