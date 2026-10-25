// ─── pinPlayedPeriodLength ───────────────────────────────────
// A game that's been played keeps the period length it was played
// with. games.quarter_length_seconds is null when a game used the
// team's length (or the age group's), so a later change to the team's
// length, age group or halves-or-quarters rewrote every past game:
// after 12- to 10-minute quarters, Stats clipped game 1's quarters to
// 10 minutes and its % time used 40 (UX round 2, 24 Oct 2026).
//
// Call it BEFORE such a change lands. It writes the length in force now
// onto every started or finished game that still follows the team's;
// upcoming games keep following it, so the new length still reaches
// them.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getEffectiveQuarterSeconds, teamSport } from "@/lib/sports";
import { teamAgeGroup } from "@/lib/sports/teamAgeGroup";
import type { Sport } from "@/lib/types";

export async function pinPlayedPeriodLength(supabase: SupabaseClient, teamId: string): Promise<void> {
  const { data: team, error } = await supabase
    .from("teams")
    .select("sport, age_group, quarter_length_seconds, period_count")
    .eq("id", teamId)
    .single();
  if (error || !team) throw new Error(`Team not found: ${error?.message ?? teamId}`);
  const row = team as {
    sport: Sport | null;
    age_group: string | null;
    quarter_length_seconds: number | null;
    period_count: number | null;
  };
  const seconds = getEffectiveQuarterSeconds(
    { quarter_length_seconds: row.quarter_length_seconds ?? null },
    teamAgeGroup(teamSport(row.sport), row.age_group, row.period_count),
  );
  const { error: updateError } = await supabase
    .from("games")
    .update({ quarter_length_seconds: seconds })
    .eq("team_id", teamId)
    .in("status", ["in_progress", "completed"])
    .is("quarter_length_seconds", null);
  if (updateError) throw new Error(`Failed to keep past games' period length: ${updateError.message}`);
}
