// Everyone who was at a game: every kid in any lineup (any sport's
// shape, field or bench) plus late arrivals. Shared by How we played and
// the game summaries, so a kid who never got on still shows up
// (Stagehand round 3: the game-time list left out the kid How we played
// flagged).
//
// Player ids only ever sit in arrays (AFL zones, netball positions,
// league forwards / backs, every bench); a league lineup's `slots` maps
// ids to position keys, so plain string values are skipped.

import type { GameEvent } from "@/lib/types";

export function presentPlayerIds(events: GameEvent[]): string[] {
  const present = new Set<string>();
  const collect = (v: unknown, inArray: boolean) => {
    if (typeof v === "string") {
      if (inArray) present.add(v);
    } else if (Array.isArray(v)) v.forEach((x) => collect(x, true));
    else if (v && typeof v === "object") Object.values(v).forEach((x) => collect(x, false));
  };
  for (const e of events) {
    if (e.type === "lineup_set" || e.type === "period_break_swap") {
      collect((e.metadata as { lineup?: unknown } | null)?.lineup, false);
    }
    if (e.type === "player_arrived" && e.player_id) present.add(e.player_id);
  }
  return Array.from(present);
}

/**
 * Kids at the game who never got on, in `present` order. Game-time lists
 * show them as "Name — 0:00 (didn't get on)": they're the ones a parent
 * asks about.
 */
export function didntGetOn(presentIds: readonly string[], playedIds: Iterable<string>): string[] {
  const played = new Set(playedIds);
  return presentIds.filter((id) => !played.has(id));
}

export const DIDNT_GET_ON = "0:00 (didn't get on)";

/**
 * The summary's headline count: kids who played, plus kids who were
 * there but didn't get on, so it matches the game-time list below it
 * (which shows those kids at 0:00).
 */
export function playersHeadline(played: number, didntGetOnCount: number): string {
  const base = `${played} player${played !== 1 ? "s" : ""}`;
  return didntGetOnCount > 0 ? `${base} · ${didntGetOnCount} didn't get on` : base;
}
