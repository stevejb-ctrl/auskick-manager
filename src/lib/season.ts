// ─── Season-events cache layer (perf phase 5) ────────────────
//
// The live page render (live/page.tsx) feeds three season-wide
// aggregations — seasonZoneMinutes, seasonLoanMinutes,
// seasonAvailability — with a "give me every event for every
// game on this team" query. For a team with 10 games × ~200
// events each that's a 2000-row pull on every render, plus an
// O(N) walk per aggregation.
//
// Before this commit the query and the walks ran on every render.
// After this commit:
//   1. The DB pull is wrapped in `unstable_cache` keyed by teamId,
//      tagged per-team so action handlers can invalidate just the
//      affected team. Revalidates every 300s as a safety net.
//   2. Any server action that writes a new game_event invalidates
//      the team's tag via revalidateTag.

import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GameEvent } from "@/lib/types";

/** Tag emitted on every season-events cache entry for this team. */
export function seasonEventsTag(teamId: string): string {
  return `season-events:${teamId}`;
}

/**
 * Fetch every game_event for every game on this team. Cached
 * cross-render for 300s, and tag-invalidated by any action that
 * inserts a new event.
 *
 * Callers typically filter out the current game's events (they
 * already have those via the page's own thisGameEvents fetch) but
 * filtering at the cache boundary would multiply the cache key
 * space by N games — bad trade. Keep the cache simple, let
 * callers slice.
 *
 * Per-team tags are baked into the inner unstable_cache wrapper
 * because Next's `tags` array on unstable_cache is static at
 * definition time. Re-creating the wrapper per call lets us pass
 * a dynamic tag derived from teamId.
 *
 * IMPORTANT: the inner fetcher uses the SERVICE-ROLE admin client,
 * not createClient(). unstable_cache forbids dynamic Next APIs
 * (cookies(), headers()) inside its callback — and the user-
 * session client calls cookies() under the hood. The data here is
 * not user-scoped (it's the team's own event log; RLS would only
 * gate WRITE access, which we're not doing), and the caller
 * (live/page.tsx) has already checked team membership before
 * reaching this code. Using admin client inside the cache is the
 * standard Next.js pattern for this exact shape.
 */
export async function getSeasonEvents(teamId: string): Promise<GameEvent[]> {
  const fetcher = unstable_cache(
    async (id: string): Promise<GameEvent[]> => {
      const admin = createAdminClient();
      const { data: teamGames } = await admin
        .from("games")
        .select("id")
        .eq("team_id", id);
      const ids = (teamGames ?? []).map((t) => t.id);
      if (ids.length === 0) return [];
      const { data } = await admin
        .from("game_events")
        .select("*")
        .in("game_id", ids);
      return (data ?? []) as GameEvent[];
    },
    // Cache key parts: function name + teamId. unique per team.
    ["season-events", teamId],
    {
      // Five-minute TTL covers stale-after-restart edge cases —
      // under normal operation the tag-invalidation path keeps
      // the cache current.
      revalidate: 300,
      tags: [seasonEventsTag(teamId)],
    },
  );
  return fetcher(teamId);
}

/**
 * Invalidate this team's cached season events. Call from any
 * server action that writes a new game_event so the next render
 * re-fetches.
 *
 * Safe to call from any "use server" function — revalidateTag is
 * a no-op outside a request scope.
 */
export function invalidateSeasonEvents(teamId: string): void {
  revalidateTag(seasonEventsTag(teamId));
}
