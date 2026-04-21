"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  fetchPlayhqTeamPage,
  parsePlayhqUrl,
  type PlayHQFixture,
  type PlayHQTeamMeta,
} from "@/lib/playhq";
import type { ActionResult } from "@/lib/types";

async function getAuthedAdmin(teamId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, error: "Unauthenticated." };
  const { data: membership } = await supabase
    .from("team_memberships")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .single();
  if (!membership || membership.role !== "admin") {
    return { supabase, user, error: "Not authorised." };
  }
  return { supabase, user, error: null };
}

function futureFixtures(fixtures: PlayHQFixture[]): PlayHQFixture[] {
  const now = Date.now();
  return fixtures.filter((f) => {
    const t = Date.parse(f.scheduledAt);
    return Number.isFinite(t) && t > now;
  });
}

export async function previewPlayhqFixtures(
  teamId: string,
  playhqUrl: string
): Promise<
  ActionResult & { meta?: PlayHQTeamMeta; fixtures?: PlayHQFixture[] }
> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  const parsed = parsePlayhqUrl(playhqUrl);
  if (!parsed.ok) return { success: false, error: parsed.reason };

  let result: Awaited<ReturnType<typeof fetchPlayhqTeamPage>>;
  try {
    result = await fetchPlayhqTeamPage(parsed.teamId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to reach PlayHQ.";
    return { success: false, error: msg };
  }

  // Persist the URL so it pre-fills on future visits.
  await supabase
    .from("teams")
    .update({ playhq_url: playhqUrl })
    .eq("id", teamId);

  return { success: true, meta: result.meta, fixtures: futureFixtures(result.fixtures) };
}

export async function importPlayhqFixtures(
  teamId: string,
  playhqUrl: string,
  selectedExternalIds: string[]
): Promise<
  ActionResult & { imported: number; updated: number; skipped: number }
> {
  const { supabase, user, error } = await getAuthedAdmin(teamId);
  if (error || !user) {
    return {
      success: false,
      error: error ?? "Unauthenticated.",
      imported: 0,
      updated: 0,
      skipped: 0,
    };
  }

  const parsed = parsePlayhqUrl(playhqUrl);
  if (!parsed.ok) {
    return {
      success: false,
      error: parsed.reason,
      imported: 0,
      updated: 0,
      skipped: 0,
    };
  }

  let page: Awaited<ReturnType<typeof fetchPlayhqTeamPage>>;
  try {
    page = await fetchPlayhqTeamPage(parsed.teamId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to reach PlayHQ.";
    return { success: false, error: msg, imported: 0, updated: 0, skipped: 0 };
  }

  const selected = new Set(selectedExternalIds);
  const toImport = futureFixtures(page.fixtures).filter((f) =>
    selected.has(f.externalId)
  );

  await supabase
    .from("teams")
    .update({ playhq_url: playhqUrl })
    .eq("id", teamId);

  const { data: existing } = await supabase
    .from("games")
    .select("id, external_id, opponent, scheduled_at, location, round_number")
    .eq("team_id", teamId)
    .eq("external_source", "playhq");
  const existingByExt = new Map(
    (existing ?? []).map((r) => [r.external_id as string, r])
  );

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  const { data: team } = await supabase
    .from("teams")
    .select("age_group")
    .eq("id", teamId)
    .single();
  const { AGE_GROUPS, ageGroupOf } = await import("@/lib/ageGroups");
  const cfg = AGE_GROUPS[ageGroupOf(team?.age_group)];

  const { data: activePlayers } = await supabase
    .from("players")
    .select("id")
    .eq("team_id", teamId)
    .eq("is_active", true);

  for (const f of toImport) {
    const existingRow = existingByExt.get(f.externalId);
    if (existingRow) {
      const patch: Record<string, unknown> = {};
      if (existingRow.opponent !== f.opponent) patch.opponent = f.opponent;
      if (existingRow.scheduled_at !== f.scheduledAt)
        patch.scheduled_at = f.scheduledAt;
      if ((existingRow.location ?? null) !== (f.venue ?? null))
        patch.location = f.venue;
      if ((existingRow.round_number ?? null) !== (f.round ?? null))
        patch.round_number = f.round;
      if (Object.keys(patch).length === 0) {
        skipped++;
        continue;
      }
      const { error: updateErr } = await supabase
        .from("games")
        .update(patch)
        .eq("id", existingRow.id);
      if (updateErr) continue;
      updated++;
    } else {
      const { data: newGame, error: insertErr } = await supabase
        .from("games")
        .insert({
          team_id: teamId,
          opponent: f.opponent,
          scheduled_at: f.scheduledAt,
          location: f.venue,
          round_number: f.round,
          notes: null,
          on_field_size: cfg.defaultOnFieldSize,
          sub_interval_seconds: cfg.subIntervalSeconds,
          external_source: "playhq",
          external_id: f.externalId,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (insertErr || !newGame) continue;
      if (activePlayers && activePlayers.length > 0) {
        await supabase.from("game_availability").insert(
          activePlayers.map((p) => ({
            game_id: newGame.id,
            player_id: p.id,
            status: "available" as const,
            updated_by: user.id,
          }))
        );
      }
      imported++;
    }
  }

  revalidatePath(`/teams/${teamId}/games`);
  return { success: true, imported, updated, skipped };
}
