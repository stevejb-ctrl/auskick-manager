import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPlayhqTeamPage, parsePlayhqUrl } from "@/lib/playhq";
import { seedDefaultAvailability } from "@/lib/games/seedDefaultAvailability";
import { newGameDefaults } from "@/lib/games/newGameDefaults";
import { teamSport } from "@/lib/sports";

// Allow up to 60 s — one PlayHQ fetch per team, sequential.
export const maxDuration = 60;

interface TeamSyncResult {
  teamId: string;
  imported: number;
  updated: number;
  skipped: number;
  error?: string;
}

export async function GET(req: NextRequest) {
  // Vercel sets CRON_SECRET automatically and sends it as Authorization: Bearer <secret>.
  // In local dev, set CRON_SECRET in .env.local to test manually.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = Date.now();

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, sport, age_group, on_field_size, period_count, playhq_url")
    .not("playhq_url", "is", null);

  if (teamsError) {
    return NextResponse.json({ error: teamsError.message }, { status: 500 });
  }

  const results: TeamSyncResult[] = [];

  for (const team of teams ?? []) {
    results.push(await syncTeam(supabase, team, now));
  }

  const totals = results.reduce(
    (acc, r) => ({
      imported: acc.imported + r.imported,
      updated: acc.updated + r.updated,
      skipped: acc.skipped + r.skipped,
    }),
    { imported: 0, updated: 0, skipped: 0 }
  );

  console.log("[sync-playhq]", totals, results);

  return NextResponse.json({ ok: true, ...totals, teams: results });
}

async function syncTeam(
  supabase: ReturnType<typeof createAdminClient>,
  team: {
    id: string;
    sport: string | null;
    age_group: string | null;
    on_field_size: number | null;
    period_count?: number | null;
    playhq_url: string | null;
  },
  now: number
): Promise<TeamSyncResult> {
  const base = { teamId: team.id, imported: 0, updated: 0, skipped: 0 };

  // One team with a bad sport mustn't stop the others syncing.
  let sport;
  try {
    sport = teamSport(team.sport);
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : "Unknown sport" };
  }
  const parsed = parsePlayhqUrl(team.playhq_url ?? "", sport);
  if (!parsed.ok) return { ...base, error: parsed.reason };

  let page: Awaited<ReturnType<typeof fetchPlayhqTeamPage>>;
  try {
    page = await fetchPlayhqTeamPage(parsed.teamId, parsed.tenant);
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : "PlayHQ fetch failed" };
  }

  // Only sync games that haven't happened yet.
  const toSync = page.fixtures.filter((f) => {
    const t = Date.parse(f.scheduledAt);
    return Number.isFinite(t) && t > now;
  });

  if (toSync.length === 0) return base;

  // Load existing PlayHQ-sourced games for this team.
  const { data: existing } = await supabase
    .from("games")
    .select("id, external_id, opponent, scheduled_at, location, round_number")
    .eq("team_id", team.id)
    .eq("external_source", "playhq");

  const existingByExt = new Map(
    (existing ?? []).map((r) => [r.external_id as string, r])
  );

  // Resolve team config for defaults on new games.
  const defaults = newGameDefaults(team.sport, team.age_group, team.on_field_size, team.period_count);

  // Active-player lookup moved into `seedDefaultAvailability` —
  // each freshly-inserted game below re-runs the query through the
  // helper. Removes a stale-read hazard if the squad changes
  // mid-sync.

  // Use the team's first admin as created_by — required NOT NULL column.
  const { data: adminRow } = await supabase
    .from("team_memberships")
    .select("user_id")
    .eq("team_id", team.id)
    .eq("role", "admin")
    .limit(1)
    .single();

  if (!adminRow) return { ...base, error: "No admin found for team" };

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const f of toSync) {
    const existingRow = existingByExt.get(f.externalId);

    if (existingRow) {
      const patch: Record<string, unknown> = {};
      if (existingRow.opponent !== f.opponent) patch.opponent = f.opponent;
      if (existingRow.scheduled_at !== f.scheduledAt) patch.scheduled_at = f.scheduledAt;
      if ((existingRow.location ?? null) !== (f.venue ?? null)) patch.location = f.venue;
      if ((existingRow.round_number ?? null) !== (f.round ?? null)) patch.round_number = f.round;

      if (Object.keys(patch).length === 0) {
        skipped++;
        continue;
      }

      const { error } = await supabase
        .from("games")
        .update(patch)
        .eq("id", existingRow.id);

      if (!error) updated++;
    } else {
      const { data: newGame, error: insertErr } = await supabase
        .from("games")
        .insert({
          team_id: team.id,
          opponent: f.opponent,
          scheduled_at: f.scheduledAt,
          location: f.venue,
          round_number: f.round,
          notes: null,
          ...defaults,
          external_source: "playhq",
          external_id: f.externalId,
          created_by: adminRow.user_id,
        })
        .select("id")
        .single();

      if (insertErr || !newGame) continue;

      // Default-available — shared helper guarantees every game
      // creation path enforces the same convention.
      await seedDefaultAvailability({
        supabase,
        gameId: newGame.id,
        teamId: team.id,
        createdBy: adminRow.user_id,
      });

      imported++;
    }
  }

  return { teamId: team.id, imported, updated, skipped };
}
