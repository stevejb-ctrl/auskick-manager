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
import { getAgeGroupConfig, getSportConfig, type SportId } from "../../src/lib/sports";
import { newGameDefaults } from "../../src/lib/games/newGameDefaults";
import type { AgeGroup } from "../../src/lib/types";

export interface MakeTeamOpts {
  name?: string;
  /** One of the sport's age groups. Default: the setup wizard's (U10, netball "go"). */
  ageGroup?: string;
  /** Every spec says which sport its team plays; none is assumed. */
  sport: SportId;
  ownerId: string; // profile id of the admin who "created" this team
}

// The setup wizard's starting age group per sport (TeamBasicsForm).
const DEFAULT_AGE_GROUP: Record<SportId, string> = {
  afl: "U10",
  netball: "go",
  rugby_league: "U10",
};

export async function makeTeam(
  admin: SupabaseClient,
  opts: MakeTeamOpts
): Promise<{ id: string; name: string; ageGroup: string }> {
  // The database has no sport or age group defaults (migration 0063),
  // so every team says both, and the age group must be its sport's: a
  // netball "U10" team would quietly run on another age group's rules.
  const { sport } = opts;
  const ageGroup = opts.ageGroup ?? DEFAULT_AGE_GROUP[sport];
  const cfg = getSportConfig(sport);
  if (![...cfg.ageGroups, ...(cfg.legacyAgeGroups ?? [])].some((a) => a.id === ageGroup)) {
    throw new Error(`makeTeam: "${ageGroup}" isn't a ${sport} age group`);
  }
  const name = opts.name ?? `Test Team ${Math.random().toString(36).slice(2, 7)}`;

  // Two-step insert/select — the `handle_new_team` trigger relies on
  // AFTER INSERT, so chaining .select() would hit an RLS violation.
  // See the comment in migration 0001 for why.
  const { error: insertError } = await admin.from("teams").insert({
    name,
    age_group: ageGroup,
    sport,
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
  // Default = defaultOnFieldSize + 4 (covers a bench rotation) but
  // clamp to the 15-name pool / 15-active-player squad trigger from
  // migration 0001. Without the clamp every U10 (defaultOnFieldSize
  // = 12 → 16) and U13+ test that omits `count` throws "exceeds the
  // 15-name pool" before any assertion runs. Specs that actually
  // need 16+ players (full-game playthroughs at large age groups)
  // must still pass an explicit count and either resize the pool or
  // accept the trigger rejection.
  const count =
    opts.count
    ?? Math.min(
      PLAYER_FIRST_NAMES.length,
      getAgeGroupConfig("afl", ageGroup).defaultOnFieldSize + 4,
    );
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
  opponent?: string;
  scheduledAt?: string;
  roundNumber?: number;
}

export async function makeGame(
  admin: SupabaseClient,
  opts: MakeGameOpts
): Promise<{ id: string; on_field_size: number; sub_interval_seconds: number; share_token: string }> {
  // Sized from the team's own sport + age group, as createGame does
  // (the database has no on-field or interval defaults, migration
  // 0063). A spec that wants another size patches the game.
  const { data: team, error: teamError } = await admin
    .from("teams")
    .select("sport, age_group")
    .eq("id", opts.teamId)
    .single();
  if (teamError || !team) throw new Error(`makeGame team: ${teamError?.message}`);
  const { data, error } = await admin
    .from("games")
    .insert({
      team_id: opts.teamId,
      opponent: opts.opponent ?? "Test Opponent",
      scheduled_at: opts.scheduledAt ?? new Date(Date.now() + 86400_000).toISOString(),
      round_number: opts.roundNumber ?? 1,
      ...newGameDefaults(team.sport as string, team.age_group as string),
      created_by: opts.ownerId,
    })
    .select("id, on_field_size, sub_interval_seconds, share_token")
    .single();
  if (error || !data) throw new Error(`makeGame: ${error?.message}`);
  return {
    id: data.id as string,
    on_field_size: data.on_field_size as number,
    sub_interval_seconds: data.sub_interval_seconds as number,
    share_token: data.share_token as string,
  };
}
