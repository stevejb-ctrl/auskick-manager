"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, Sport } from "@/lib/types";
import { getSportConfig } from "@/lib/sports";
import {
  formatTeamMessage,
  sendTelegramNotification,
} from "@/lib/notifications/telegram";

export async function createTeam(
  userId: string,
  name: string,
  ageGroup: string = "U10",
  sport: Sport = "afl"
): Promise<ActionResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== userId) {
    console.error("[createTeam] unauthenticated", { hasUser: !!user, userId });
    return { success: false, error: "Unauthenticated." };
  }

  // Validate age_group belongs to the chosen sport. The DB has no
  // per-sport CHECK (intentional — sport configs own the set), so
  // guard here before writing garbage.
  const cfg = getSportConfig(sport);
  const validAgeGroup = cfg.ageGroups.some((a) => a.id === ageGroup);
  if (!validAgeGroup) {
    console.error("[createTeam] invalid age group for sport", { sport, ageGroup });
    return {
      success: false,
      error: `Invalid age group "${ageGroup}" for ${cfg.name}.`,
    };
  }

  // Pre-generate the team ID so we can redirect straight to the setup
  // wizard — the AFTER INSERT trigger creates the admin membership row
  // in the same DB transaction, so by the time the redirect lands on
  // the setup page the user is already a member per the teams: read
  // RLS policy.
  const teamId = crypto.randomUUID();

  // Rugby league bakes the scoring rule into the laws: tag at U6/U7
  // (no scoreboard), modified tackle at U8+ (tries + conversions).
  // Pre-set `track_scoring` to match the age-group default so a
  // brand-new U8+ RL team can record tries from the first whistle
  // without the coach having to remember to toggle it on. AFL and
  // netball keep the explicit toggle in ScoringStep (DB default
  // `false` preserved for them — same contract as before).
  const ageCfg = cfg.ageGroups.find((a) => a.id === ageGroup);
  const initialTrackScoring
    = sport === "rugby_league" && ageCfg?.tracksScoreDefault === true;

  console.log("[createTeam] inserting team", {
    teamId,
    userId: user.id,
    name,
    ageGroup,
    sport,
    trackScoring: initialTrackScoring,
  });

  // Rugby League is a two-zone sport (Forwards + Backs). Pre-set
  // chip A → Forward, chip B → Back, and label them so the team
  // works out of the box: coaches see the F/B letter overlay on
  // player tiles + the orange/blue field zone palette without
  // having to dig into Settings → Player chips. Coach can still
  // override the labels (or clear them to hide the chip) later.
  // AFL + netball keep the legacy `split` default — they don't
  // ship with a forced zone mode. Steve 2026-05-23.
  const insertRow: {
    id: string;
    name: string;
    created_by: string;
    age_group: string;
    sport: Sport;
    track_scoring?: boolean;
    chip_a_label?: string;
    chip_b_label?: string;
    chip_a_mode?: import("@/lib/chips").ChipMode;
    chip_b_mode?: import("@/lib/chips").ChipMode;
  } = { id: teamId, name, created_by: user.id, age_group: ageGroup, sport };
  if (initialTrackScoring) insertRow.track_scoring = true;
  if (sport === "rugby_league") {
    insertRow.chip_a_label = "Forward";
    insertRow.chip_b_label = "Back";
    insertRow.chip_a_mode = "forward";
    insertRow.chip_b_mode = "back";
  }

  const { error: insertError } = await supabase
    .from("teams")
    .insert(insertRow);

  if (insertError) {
    console.error("[createTeam] insert failed", insertError);
    return { success: false, error: insertError.message };
  }

  console.log("[createTeam] insert succeeded, redirecting", {
    teamId,
    url: `/teams/${teamId}/setup?step=config`,
  });

  const text = formatTeamMessage(
    name,
    ageGroup,
    user.email ?? user.id,
    new Date().toISOString()
  );
  // Fire-and-forget — Telegram outage must not block team creation
  sendTelegramNotification(text).catch(() => {});

  revalidatePath("/dashboard");
  // redirect() throws NEXT_REDIRECT; must be OUTSIDE any try/catch
  // block so Next.js's action handler can propagate the redirect.
  redirect(`/teams/${teamId}/setup?step=config`);
}
