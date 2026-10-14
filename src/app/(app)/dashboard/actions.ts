"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, Sport } from "@/lib/types";
import { defaultTrackScoring, getSportConfig, isRugby } from "@/lib/sports";
import { effectivePolicy, getSportPlaybook } from "@/lib/playbook";
import {
  formatTeamMessage,
  sendTelegramNotification,
} from "@/lib/notifications/telegram";

export async function createTeam(
  userId: string,
  name: string,
  ageGroup: string = "U10",
  sport: Sport = "afl"
): Promise<ActionResult<{ setupUrl: string }>> {
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

  // Start the scoreboard on or off per the age-group default, for
  // every sport. The wizard's "How we play" step shows that default
  // ("Default for Under 14: on") next to the toggle, so storing
  // anything else made the step contradict itself (UX plan C4).
  // Rugby league follows its laws: tag at U6/U7 (no scoreboard),
  // modified tackle at U8+ (tries + conversions).
  const initialTrackScoring = defaultTrackScoring(sport, ageGroup);

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
  if (isRugby(sport)) {
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

  // A new team starts on its age group's suggested way to play (Set
  // positions at U15, say), so the wizard's "Suggested" and its
  // selection agree. Teams with no row keep the older fallback, which
  // is why this is written here rather than defaulted in the resolver.
  // Not fatal: the coach can still pick in the wizard.
  const suggested = getSportPlaybook(sport).recommendedStrategy(effectivePolicy(sport, ageGroup));
  const { error: playbookError } = await supabase
    .from("team_playbooks")
    .insert({ team_id: teamId, strategy: suggested });
  if (playbookError) console.error("[createTeam] playbook insert failed", playbookError);

  console.log("[createTeam] insert succeeded, redirecting", {
    teamId,
    url: `/teams/${teamId}/setup?step=config`,
  });

  const text = formatTeamMessage(
    name,
    ageGroup,
    user.email ?? user.id,
    new Date().toISOString(),
    // Use the friendly long name from sport config ("Australian
    // Rules Football" / "Netball") instead of the raw id — easier
    // to scan in Telegram than "afl" / "netball". Steve 2026-05-17.
    cfg.name,
  );
  // Fire-and-forget — Telegram outage must not block team creation
  sendTelegramNotification(text).catch(() => {});

  revalidatePath("/dashboard");
  // The form replaces /teams/new with the setup (router.replace), so
  // Back leaves the wizard instead of landing on a blank create form
  // whose Continue makes a second team (round 5). A server-action
  // redirect() always pushes in Next 14, whatever its RedirectType.
  return { success: true, data: { setupUrl: `/teams/${teamId}/setup?step=config` } };
}
