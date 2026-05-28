"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { seedDefaultAvailability } from "@/lib/games/seedDefaultAvailability";
import { AGE_GROUPS } from "@/lib/ageGroups";
import { netballSport } from "@/lib/sports";
import { getSportConfig } from "@/lib/sports/registry";
import type { Sport } from "@/lib/types";

// Marketing-side sport IDs (the homepage picker uses these — afl,
// league, netball, union) map to the in-app SportId space that's
// used in the DB and rule modules. The picker URL/form sends the
// marketing id; this server action translates.
type MarketingSportId = "afl" | "league" | "netball" | "union";

const MARKETING_TO_SPORT: Record<MarketingSportId, Sport> = {
  afl: "afl",
  league: "rugby_league",
  netball: "netball",
  // Rugby Union has no in-app sport yet — it's a coming-soon
  // placeholder on the picker. The picker disables the union card
  // so this entry is for type completeness only; runDemoGame
  // refuses union before reaching this map.
  union: "afl",
};

/**
 * Start a fresh demo game for the given sport, then redirect to the
 * public /run/{token} view so a visitor sees the live-game UI
 * immediately.
 *
 * Flow:
 *   1. Validate the marketing sport id (reject union — coming-soon).
 *   2. Find the seeded `is_demo=true` team for that sport. If
 *      missing, return early with a clear message (the seed-demo
 *      cron should have created it; manual seed via
 *      /api/admin/seed-demo otherwise).
 *   3. Mark any leftover in-progress demo games for this team as
 *      completed (so we never have two open games for one demo
 *      team — the picker is single-tenant by design).
 *   4. INSERT a fresh game with U10 / sport-appropriate config and
 *      `clock_multiplier=8` so the demo plays out in a few minutes
 *      of wall-clock time rather than the full match duration.
 *   5. Seed default availability (all players available) so the
 *      lineup picker has a squad to work with.
 *   6. Redirect to /run/{share_token} — the public scoring view,
 *      same path /demo redirected to in the host-resolved flow.
 *
 * NB: This runs in server-context with admin Supabase (RLS-bypass)
 * because the visitor is anonymous. They never write to anything
 * — only this action writes on their behalf to set up the demo.
 */
export async function runDemoGame(formData: FormData): Promise<void> {
  const rawSport = formData.get("sport");
  if (typeof rawSport !== "string") {
    throw new Error("Missing sport parameter");
  }

  // Whitelist the input. Rejecting an unknown sport here means a
  // malicious form post can't smuggle arbitrary strings into the
  // DB sport column.
  const allowedMarketingIds: MarketingSportId[] = [
    "afl",
    "league",
    "netball",
  ];
  if (!allowedMarketingIds.includes(rawSport as MarketingSportId)) {
    // union explicitly excluded; unknown strings same path.
    throw new Error(`Demo not available for sport: ${rawSport}`);
  }
  const marketingSportId = rawSport as MarketingSportId;
  const sport: Sport = MARKETING_TO_SPORT[marketingSportId];

  const admin = createAdminClient();

  // ── Step 2: find the demo team for this sport ──
  const { data: team, error: teamErr } = await admin
    .from("teams")
    .select("id, age_group, sport")
    .eq("is_demo", true)
    .eq("sport", sport)
    .limit(1)
    .maybeSingle();

  if (teamErr) {
    throw new Error(`Failed to look up demo team: ${teamErr.message}`);
  }
  if (!team) {
    throw new Error(
      `No demo team set up for ${sport}. Hit /api/admin/seed-demo with the cron secret to create one.`,
    );
  }

  // ── Step 3: clean up leftover in-progress games ──
  await admin
    .from("games")
    .update({ status: "completed" })
    .eq("team_id", team.id)
    .neq("status", "completed");

  // ── Step 4: build per-sport INSERT payload ──
  // Each sport pulls on_field_size + sub_interval_seconds from its
  // own age-group config so the demo respects sport-specific
  // defaults (e.g. RL U10 = 11 on-field; netball "go" = 7 on-court).
  const { data: adminRow } = await admin
    .from("team_memberships")
    .select("user_id")
    .eq("team_id", team.id)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  if (!adminRow) {
    throw new Error(`Demo team for ${sport} has no admin membership`);
  }

  const insertPayload = buildDemoGamePayload({
    sport,
    teamId: team.id,
    teamAgeGroup: team.age_group,
    adminUserId: adminRow.user_id,
  });

  // Pre-generated UUID so we can stage availability + redirect
  // without a `.select().single()` round-trip that hits RLS
  // (the same trap noted in earlier commits — admin client doesn't
  // strictly need this, but the consistent pattern keeps the code
  // legible if we ever drop privileges).
  const { data: newGame, error: insertErr } = await admin
    .from("games")
    .insert(insertPayload)
    .select("id, share_token")
    .single();

  if (insertErr || !newGame) {
    throw new Error(
      `Failed to create demo game: ${insertErr?.message ?? "no row returned"}`,
    );
  }

  // ── Step 5: seed availability so the lineup picker has a squad ──
  await seedDefaultAvailability({
    supabase: admin,
    gameId: newGame.id,
    teamId: team.id,
    createdBy: null,
  });

  // ── Step 6: redirect to the public live view ──
  // `redirect` throws a NEXT_REDIRECT — must run outside try/catch.
  redirect(`/run/${newGame.share_token}`);
}

/**
 * Build the INSERT row for a demo game. Sport-specific because each
 * sport's age-group config carries different on_field_size +
 * sub_interval_seconds defaults that the live-game UI relies on.
 */
function buildDemoGamePayload({
  sport,
  teamId,
  teamAgeGroup,
  adminUserId,
}: {
  sport: Sport;
  teamId: string;
  teamAgeGroup: string;
  adminUserId: string;
}) {
  // Shared base fields — every sport's demo game has these. The
  // clock_multiplier of 8× compresses a real-time match (e.g. RL
  // U10 = 2×20-min halves = 40 mins) into ~5 mins of wall-clock
  // so a visitor sees the period structure, scoring + breaks
  // without sticking around for a real match length.
  const base = {
    team_id: teamId,
    opponent: "Demo Opponent",
    scheduled_at: new Date().toISOString(),
    location: null,
    notes: null,
    clock_multiplier: 8,
    created_by: adminUserId,
  } as const;

  if (sport === "netball") {
    // Netball uses the team's actual age-group config (probably
    // "go") so on_field_size lines up with the position layout
    // the lineup picker expects (Set tier = 5-on-court, Go and
    // above = 7-on-court).
    const ageCfg =
      netballSport.ageGroups.find((a) => a.id === teamAgeGroup) ??
      netballSport.ageGroups.find((a) => a.id === "go")!;
    return {
      ...base,
      on_field_size: ageCfg.defaultOnFieldSize,
      sub_interval_seconds: ageCfg.subIntervalSeconds,
    };
  }

  if (sport === "rugby_league") {
    // Rugby League U10 — pull from the registered sport config so
    // we get the half-based sub interval (10 min) + 11-on-field
    // default rather than AFL's quarter values.
    const cfg = getSportConfig("rugby_league");
    const ageCfg =
      cfg.ageGroups.find((a) => a.id === teamAgeGroup) ??
      cfg.ageGroups.find((a) => a.id === "U10")!;
    return {
      ...base,
      on_field_size: ageCfg.defaultOnFieldSize,
      sub_interval_seconds: ageCfg.subIntervalSeconds,
    };
  }

  // AFL — legacy AGE_GROUPS table (still the source of truth for
  // AFL's on_field_size + sub_interval since AFL hasn't moved to
  // the per-sport registry yet for these fields).
  const cfg = AGE_GROUPS["U10"];
  return {
    ...base,
    on_field_size: cfg.defaultOnFieldSize,
    sub_interval_seconds: cfg.subIntervalSeconds,
  };
}
