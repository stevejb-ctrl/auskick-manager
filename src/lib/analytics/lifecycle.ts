import { trackServer } from "@/lib/analytics/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { teamOnFieldSize } from "@/lib/games/newGameDefaults";
import { getAgeGroupConfig, isSportId } from "@/lib/sports/registry";
import type { SportId } from "@/lib/sports/types";

// Game lifecycle events, shared by every sport's start and finalise
// actions (src/app/(app)/teams/[teamId]/games/[gameId]/live/*). The
// props are worked out after the response (see trackServer), so a
// kickoff or the final siren is never slowed by analytics. They read
// with the service-role client: by then the request's cookies, which
// the coach's own client needs, may be gone.

interface GameRef {
  /** The coach who did it; null for a share-link runner. */
  userId: string | null;
  teamId: string;
  gameId: string;
}

/** The team's sport, or null for a demo team (or one that's gone). */
async function realTeamSport(teamId: string): Promise<SportId | null> {
  const { data } = await createAdminClient().from("teams").select("sport, is_demo").eq("id", teamId).maybeSingle();
  const team = data as { sport: unknown; is_demo: boolean | null } | null;
  if (!team || team.is_demo || !isSportId(team.sport)) return null;
  return team.sport;
}

/**
 * squad_built: the first time the squad holds a full side (the team's
 * players on the field). Call after `added` players were inserted.
 */
export function trackSquadBuilt(userId: string, teamId: string, added: number): void {
  trackServer(userId, "squad_built", async () => {
    const admin = createAdminClient();
    const [{ data }, { count }] = await Promise.all([
      admin.from("teams").select("sport, age_group, on_field_size, is_demo").eq("id", teamId).maybeSingle(),
      // Every player the team has had, active or not, so dropping a kid
      // and adding another never crosses the line a second time.
      admin.from("players").select("id", { count: "exact", head: true }).eq("team_id", teamId),
    ]);
    const team = data as { sport: unknown; age_group: string | null; on_field_size: number | null; is_demo: boolean | null } | null;
    if (!team || team.is_demo || !isSportId(team.sport) || count == null) return null;
    const size = teamOnFieldSize(getAgeGroupConfig(team.sport, team.age_group), team.on_field_size);
    if (count - added >= size || count < size) return null;
    return { team_id: teamId, sport: team.sport, player_count: count };
  });
}

/** Whole days from `now` to the bounce: 0 today, negative if it's past. */
export function daysUntilGame(scheduledAt: string, now = Date.now()): number | null {
  const at = Date.parse(scheduledAt);
  return Number.isNaN(at) ? null : Math.round((at - now) / 86_400_000);
}

/** game_created, from the coach's form or a PlayHQ fixture import. */
export function trackGameCreated(
  userId: string,
  game: { teamId: string; sport: unknown; scheduledAt: string; source: "manual" | "playhq" },
): void {
  if (!isSportId(game.sport)) return;
  trackServer(userId, "game_created", {
    team_id: game.teamId,
    sport: game.sport,
    days_until_game: daysUntilGame(game.scheduledAt),
    source: game.source,
  });
}

/** game_started. Read `hasLineupDraft` before the start deletes the draft. */
export function trackGameStarted(ref: GameRef & { hasLineupDraft: boolean }): void {
  trackServer(ref.userId, "game_started", async () => {
    const sport = await realTeamSport(ref.teamId);
    if (!sport) return null;
    return { team_id: ref.teamId, sport, has_lineup_draft: ref.hasLineupDraft };
  });
}

interface FinalEvent {
  type: string;
  metadata: Record<string, unknown> | null;
}

/**
 * Playing time and in-play subs from a finished game's events.
 * Duration adds up each period's clock at its end (quarter_end, or the
 * finalise for a last period with none). Subs are swaps plus netball's
 * mid-quarter subs, which ride on its break and finalise events.
 */
export function gameTotals(events: FinalEvent[]): { durationMin: number | null; subsCount: number } {
  const periodMs = new Map<number, number>();
  let subsCount = 0;
  for (const e of events) {
    const meta = e.metadata ?? {};
    const quarter = typeof meta.quarter === "number" ? meta.quarter : null;
    const elapsed = typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : null;
    if (e.type === "quarter_end" && quarter !== null && elapsed !== null) {
      periodMs.set(quarter, Math.max(periodMs.get(quarter) ?? 0, elapsed));
    }
    if (e.type === "swap") subsCount++;
    if (Array.isArray(meta.midQuarterSubs)) subsCount += meta.midQuarterSubs.length;
  }
  const final = events.find((e) => e.type === "game_finalised")?.metadata ?? {};
  if (typeof final.quarter === "number" && typeof final.elapsed_ms === "number" && !periodMs.has(final.quarter)) {
    periodMs.set(final.quarter, final.elapsed_ms);
  }
  const totalMs = Array.from(periodMs.values()).reduce((a, b) => a + b, 0);
  return { durationMin: totalMs > 0 ? Math.round(totalMs / 60_000) : null, subsCount };
}

/** game_completed, once per game: a repeated finalise sends nothing. */
export function trackGameCompleted(ref: GameRef): void {
  trackServer(ref.userId, "game_completed", async () => {
    const [sport, { data }] = await Promise.all([
      realTeamSport(ref.teamId),
      createAdminClient().from("game_events").select("type, metadata").eq("game_id", ref.gameId),
    ]);
    if (!sport) return null;
    const events = (data ?? []) as FinalEvent[];
    if (events.filter((e) => e.type === "game_finalised").length !== 1) return null;
    const { durationMin, subsCount } = gameTotals(events);
    return { team_id: ref.teamId, sport, duration_min: durationMin, subs_count: subsCount };
  });
}
