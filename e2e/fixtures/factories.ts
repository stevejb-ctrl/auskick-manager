// Data factories for e2e tests. Each factory writes directly via the
// service-role client (bypassing RLS) and returns typed records so
// tests can assert against known IDs.
//
// Design principle: factories are for _setup_, not for exercising the
// feature under test. If a spec covers `createGame`, it should click
// through the UI — not call `makeGame()`. Use factories when the spec
// needs a pre-existing team/game to focus on the downstream flow
// (e.g. "given a started game, a swap updates zone minutes").

import { type SupabaseClient } from "@supabase/supabase-js";
import { AGE_GROUPS } from "../../src/lib/ageGroups";
import type { AgeGroup } from "../../src/lib/types";

export interface MakeTeamOpts {
  name?: string;
  ageGroup?: AgeGroup;
  ownerId: string; // profile id of the admin who "created" this team
}

export async function makeTeam(
  admin: SupabaseClient,
  opts: MakeTeamOpts
): Promise<{ id: string; name: string; ageGroup: AgeGroup }> {
  const ageGroup = opts.ageGroup ?? "U10";
  const name = opts.name ?? `Test Team ${Math.random().toString(36).slice(2, 7)}`;

  // Two-step insert/select — the `handle_new_team` trigger relies on
  // AFTER INSERT, so chaining .select() would hit an RLS violation.
  // See the comment in migration 0001 for why.
  const { error: insertError } = await admin.from("teams").insert({
    name,
    age_group: ageGroup,
    created_by: opts.ownerId,
  });
  if (insertError) throw new Error(`makeTeam insert: ${insertError.message}`);

  const { data, error } = await admin
    .from("teams")
    .select("id, name, age_group")
    .eq("name", name)
    .eq("created_by", opts.ownerId)
    .single();
  if (error || !data) throw new Error(`makeTeam fetch: ${error?.message}`);

  return { id: data.id as string, name: data.name as string, ageGroup };
}

export interface MakePlayersOpts {
  teamId: string;
  ownerId: string;
  count?: number; // default: age group's defaultOnFieldSize + 4
  ageGroup?: AgeGroup;
}

// 15 unique single-word names — matches the 15-player squad cap from
// migration 0001. Single word is deliberate: PlayerTile renders
// `firstName + ' ' + lastInitial` when full_name has multiple words,
// so multi-word names ("Alice Player") would render as "Alice P" and
// `getByText(player.full_name)` would silently miss. Single-word names
// render as-is, so the test's natural `getByText(player.full_name)`
// just works without spec authors having to mirror PlayerTile's
// abbreviation rule.
const PLAYER_FIRST_NAMES = [
  "Alicia", "Brendan", "Camille", "Damian", "Elena",
  "Felix", "Gemma", "Harvey", "Ingrid", "Joaquin",
  "Karina", "Lachlan", "Maeve", "Nikolai", "Octavia",
];

export async function makePlayers(
  admin: SupabaseClient,
  opts: MakePlayersOpts
): Promise<Array<{ id: string; full_name: string; jersey_number: number }>> {
  const ageGroup = opts.ageGroup ?? "U10";
  const count = opts.count ?? AGE_GROUPS[ageGroup].defaultOnFieldSize + 4;
  if (count > PLAYER_FIRST_NAMES.length) {
    throw new Error(
      `makePlayers: count=${count} exceeds the ${PLAYER_FIRST_NAMES.length}-name pool ` +
        `(also bumps against the 15-active-player squad trigger from migration 0001)`,
    );
  }

  const rows = Array.from({ length: count }, (_, i) => ({
    team_id: opts.teamId,
    full_name: PLAYER_FIRST_NAMES[i],
    jersey_number: i + 1,
    is_active: true,
    created_by: opts.ownerId,
  }));
  const { data, error } = await admin.from("players").insert(rows).select("*");
  if (error || !data) throw new Error(`makePlayers: ${error?.message}`);
  return data as Array<{
    id: string;
    full_name: string;
    jersey_number: number;
  }>;
}

export interface MakeGameOpts {
  teamId: string;
  ownerId: string;
  ageGroup?: AgeGroup;
  opponent?: string;
  scheduledAt?: string;
  roundNumber?: number;
}

export async function makeGame(
  admin: SupabaseClient,
  opts: MakeGameOpts
): Promise<{ id: string; on_field_size: number; share_token: string }> {
  const ageGroup = opts.ageGroup ?? "U10";
  const cfg = AGE_GROUPS[ageGroup];
  const { data, error } = await admin
    .from("games")
    .insert({
      team_id: opts.teamId,
      opponent: opts.opponent ?? "Test Opponent",
      scheduled_at: opts.scheduledAt ?? new Date(Date.now() + 86400_000).toISOString(),
      round_number: opts.roundNumber ?? 1,
      on_field_size: cfg.defaultOnFieldSize,
      created_by: opts.ownerId,
    })
    .select("id, on_field_size, share_token")
    .single();
  if (error || !data) throw new Error(`makeGame: ${error?.message}`);
  return {
    id: data.id as string,
    on_field_size: data.on_field_size as number,
    share_token: data.share_token as string,
  };
}
