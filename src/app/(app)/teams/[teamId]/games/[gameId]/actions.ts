"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getMembership } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearGameRollup } from "@/lib/playbook/rollupStore";
import { readValidatedUserId } from "@/lib/auth/userIdHeader";
import { gameBelongsToTeam } from "@/lib/auth/gameOwnership";
import { invalidateSeasonEvents } from "@/lib/season";
import type { ActionResult, AvailabilityStatus, LiveAuth } from "@/lib/types";

interface FillInInput {
  full_name: string;
  jersey_number: number | null;
  /** Touch and Oztag mixed teams: who the fill-in counts as under the rule. */
  mixed_group?: "girl" | "boy" | null;
}

async function authorizeManager(
  auth: LiveAuth,
  gameId: string
): Promise<
  | { ok: true; kind: "token"; userId: null }
  | { ok: true; kind: "team"; userId: string; teamId: string }
  | { ok: false; error: string }
> {
  if (auth.kind === "token") {
    const admin = createAdminClient();
    const { data: game } = await admin
      .from("games")
      .select("id, share_token")
      .eq("id", gameId)
      .maybeSingle();
    if (!game || game.share_token !== auth.token) {
      return { ok: false, error: "Invalid share link." };
    }
    return { ok: true, kind: "token", userId: null };
  }

  // Skip the second auth round-trip — middleware already validated.
  const userId = readValidatedUserId();
  if (!userId) return { ok: false, error: "Unauthenticated." };

  // Cached: shares the lookup with any page render / sibling action
  // running in the same request context.
  const membership = await getMembership(auth.teamId, userId);

  if (
    !membership ||
    (membership.role !== "admin" && membership.role !== "game_manager")
  ) {
    return { ok: false, error: "Not authorised." };
  }
  return { ok: true, kind: "team", userId, teamId: auth.teamId };
}

export async function setAvailability(
  auth: LiveAuth,
  gameId: string,
  playerId: string,
  status: AvailabilityStatus
): Promise<ActionResult> {
  return setAvailabilityMany(auth, gameId, [playerId], status);
}

/**
 * The same, for several players in one write: "Mark all in". It used to
 * send one setAvailability per kid, one after another (12 round trips;
 * over 10 s on a slow line, round 5).
 */
export async function setAvailabilityMany(
  auth: LiveAuth,
  gameId: string,
  playerIds: string[],
  status: AvailabilityStatus
): Promise<ActionResult> {
  if (playerIds.length === 0) return { success: true };
  if (auth.kind === "token") {
    const admin = createAdminClient();
    const { data: game } = await admin
      .from("games")
      .select("id, team_id, share_token")
      .eq("id", gameId)
      .maybeSingle();
    if (!game || game.share_token !== auth.token) {
      return { success: false, error: "Invalid share link." };
    }
    const now = new Date().toISOString();
    const { error } = await admin.from("game_availability").upsert(
      playerIds.map((playerId) => ({
        game_id: gameId,
        player_id: playerId,
        status,
        updated_at: now,
      })),
      { onConflict: "game_id,player_id" }
    );
    if (error) return { success: false, error: error.message };
    revalidatePath(`/run/${auth.token}`, "layout");
    return { success: true };
  }

  const supabase = createClient();
  // Skip the second auth round-trip — middleware already validated.
  const userId = readValidatedUserId();
  if (!userId) return { success: false, error: "Unauthenticated." };

  // Any team member — admin, game_manager, or parent — may toggle
  // availability. Parents are trusted to RSVP for their team.
  // Super-admins bypass the membership check entirely so they can
  // manage availability across every team without joining as
  // members. Steve 2026-05-19: the availability toggle was stuck
  // in a loading state because the super-admin didn't have a
  // team_memberships row, so the action kept returning
  // `{success: false, error: "Not authorised."}` and the write
  // queue retried forever.
  const membership = await getMembership(auth.teamId, userId);
  let isAuthorised = !!membership;
  if (!isAuthorised) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", userId)
      .maybeSingle<{ is_super_admin: boolean | null }>();
    if (profile?.is_super_admin) isAuthorised = true;
  }
  if (!isAuthorised) {
    return { success: false, error: "Not authorised." };
  }

  // Super-admins without team membership can't satisfy the RLS
  // INSERT WITH CHECK on `game_availability` (which requires
  // `updated_by` to be a member of the team). Use the admin client
  // to bypass RLS when the caller is super-admin — auth was
  // verified server-side above, so the admin escape is safe.
  const writer = membership ? supabase : createAdminClient();
  const now = new Date().toISOString();
  const { error } = await writer.from("game_availability").upsert(
    playerIds.map((playerId) => ({
      game_id: gameId,
      player_id: playerId,
      status,
      updated_by: userId,
      updated_at: now,
    })),
    { onConflict: "game_id,player_id" }
  );

  if (error) return { success: false, error: error.message };

  // Perf phase 6: was `, "layout"` which invalidated the entire
  // team segment (squad/stats/settings/dashboard/...) on every
  // availability flip. Narrow to just the three pages that
  // actually read game_availability: the game detail page, the
  // standalone /availability child, and the /live page (its
  // LineupPicker reads availability to filter the squad).
  revalidatePath(`/teams/${auth.teamId}/games/${gameId}`);
  revalidatePath(`/teams/${auth.teamId}/games/${gameId}/availability`);
  revalidatePath(`/teams/${auth.teamId}/games/${gameId}/live`);
  return { success: true };
}

export async function addFillIn(
  auth: LiveAuth,
  gameId: string,
  input: FillInInput
): Promise<ActionResult> {
  const name = input.full_name.trim();
  if (!name) return { success: false, error: "Name is required." };
  const jersey =
    input.jersey_number === null || Number.isNaN(input.jersey_number)
      ? null
      : Math.trunc(input.jersey_number);

  const check = await authorizeManager(auth, gameId);
  if (!check.ok) return { success: false, error: check.error };

  // Pre-gen the UUID so we don't need `.select().single()` after
  // the insert. Token-auth path uses the admin client (RLS-bypass)
  // so it would never hit the read-back trap, but team-auth path
  // goes through RLS — same defensive pattern as createTeam keeps
  // both branches uniform and future-proof against policy changes.
  const fillInId = crypto.randomUUID();
  const db = check.kind === "token" ? createAdminClient() : createClient();
  const { error } = await db
    .from("game_fill_ins")
    .insert({
      id: fillInId,
      game_id: gameId,
      full_name: name,
      jersey_number: jersey,
      ...(input.mixed_group === "girl" || input.mixed_group === "boy" ? { mixed_group: input.mixed_group } : {}),
      created_by: check.kind === "team" ? check.userId : null,
    });
  if (error) return { success: false, error: error.message };

  // Fill-ins are implicitly available for the day — they only exist
  // because someone showed up unannounced. We don't (and can't) mark
  // game_availability for them: that table's player_id has an FK to
  // public.players(id) which fill-ins deliberately aren't in. Live
  // pages merge the fill-in ids into their own availableIds set
  // directly. (Earlier revisions tried a best-effort upsert here and
  // silently swallowed the resulting 23503; removed.)

  if (check.kind === "token") {
    revalidatePath(`/run/${auth.kind === "token" ? auth.token : ""}`, "layout");
  } else {
    // Perf phase 6: fill-ins appear on the game detail,
    // /availability, and /live pages. Skip the team-layout-wide
    // revalidation.
    revalidatePath(`/teams/${check.teamId}/games/${gameId}`);
    revalidatePath(`/teams/${check.teamId}/games/${gameId}/availability`);
    revalidatePath(`/teams/${check.teamId}/games/${gameId}/live`);
  }
  return { success: true, data: { id: fillInId } };
}

export async function removeFillIn(
  auth: LiveAuth,
  gameId: string,
  fillInId: string
): Promise<ActionResult> {
  const check = await authorizeManager(auth, gameId);
  if (!check.ok) return { success: false, error: check.error };

  const db = check.kind === "token" ? createAdminClient() : createClient();
  // Clear availability first (FK isn't enforced against fill-ins, but keeping
  // orphan availability rows around would count toward "available" tallies).
  await db
    .from("game_availability")
    .delete()
    .eq("game_id", gameId)
    .eq("player_id", fillInId);

  const { error } = await db
    .from("game_fill_ins")
    .delete()
    .eq("id", fillInId)
    .eq("game_id", gameId);
  if (error) return { success: false, error: error.message };

  if (check.kind === "token") {
    revalidatePath(`/run/${auth.kind === "token" ? auth.token : ""}`, "layout");
  } else {
    // Perf phase 6: fill-in removal touches the same three pages
    // as addFillIn. Skip the team-layout-wide revalidation.
    revalidatePath(`/teams/${check.teamId}/games/${gameId}`);
    revalidatePath(`/teams/${check.teamId}/games/${gameId}/availability`);
    revalidatePath(`/teams/${check.teamId}/games/${gameId}/live`);
  }
  return { success: true };
}

export async function resetGame(
  auth: LiveAuth,
  gameId: string
): Promise<ActionResult> {
  const admin = createAdminClient();

  // Resolve team id + authorise. Token bearers are trusted for live-game
  // ops including reset (same level as scoring / late arrivals). Team
  // callers must be a team admin (game_managers can run the game but not
  // destroy its history).
  let teamId: string;
  if (auth.kind === "token") {
    const { data: game } = await admin
      .from("games")
      .select("id, team_id, share_token, status")
      .eq("id", gameId)
      .maybeSingle();
    if (!game || game.share_token !== auth.token) {
      return { success: false, error: "Invalid share link." };
    }
    // A finished game is the season's record. Share links get passed
    // around group chats, so they can't wipe one — a team admin can,
    // from the game page.
    if (game.status === "completed") {
      return {
        success: false,
        error: "This game is finished. Only a team admin can restart it, from the game page.",
      };
    }
    teamId = game.team_id;
  } else {
    // Skip the second auth round-trip — middleware already validated.
    const userId = readValidatedUserId();
    if (!userId) return { success: false, error: "Unauthenticated." };

    const membership = await getMembership(auth.teamId, userId);
    if (!membership || membership.role !== "admin") {
      return { success: false, error: "Only admins can reset games." };
    }
    // IDOR guard: the admin client below bypasses RLS and deletes by
    // game_id, so confirm this game actually belongs to the team the caller
    // is an admin of — otherwise an admin of any team could pass another
    // team's gameId and wipe its history.
    const { data: ownerCheck } = await admin
      .from("games")
      .select("team_id")
      .eq("id", gameId)
      .maybeSingle();
    if (!ownerCheck || !gameBelongsToTeam(ownerCheck.team_id, auth.teamId)) {
      return { success: false, error: "Game not found for this team." };
    }
    teamId = auth.teamId;
  }

  const { error: delError } = await admin
    .from("game_events")
    .delete()
    .eq("game_id", gameId);
  if (delError) return { success: false, error: delError.message };
  // The game's time goes with its events (UX plan 4.5).
  await clearGameRollup(admin, gameId);

  const { error: updError } = await admin
    .from("games")
    .update({ status: "upcoming" })
    .eq("id", gameId)
    .eq("team_id", teamId);
  if (updError) return { success: false, error: updError.message };

  // Game's events just got wiped — drop the season-events cache.
  invalidateSeasonEvents(teamId);

  // Perf phase 6: resetGame wipes events + flips status back to
  // "upcoming". Affects the game detail page, /availability,
  // /live, and the team's games list (status pill goes back to
  // "Upcoming"). Stats also re-derive without this game's events.
  revalidatePath(`/teams/${teamId}/games/${gameId}`);
  revalidatePath(`/teams/${teamId}/games/${gameId}/availability`);
  revalidatePath(`/teams/${teamId}/games/${gameId}/live`);
  revalidatePath(`/teams/${teamId}/games`);
  revalidatePath(`/teams/${teamId}/stats`);
  const { data: game } = await admin
    .from("games")
    .select("share_token")
    .eq("id", gameId)
    .maybeSingle();
  if (game?.share_token) {
    revalidatePath(`/run/${game.share_token}`, "layout");
  }

  // Redirect back to the pre-kick-off screen so the coach can re-set
  // availability and add fill-ins before starting again. Without this
  // the live page just rerenders into the lineup picker, skipping the
  // availability + fill-in management surface entirely. Token bearers
  // go to /run/[token] (their equivalent of the team game-detail
  // page); team admins go to the game detail page.
  if (auth.kind === "token") {
    redirect(`/run/${auth.token}`);
  }
  redirect(`/teams/${teamId}/games/${gameId}`);
}

export async function deleteGame(
  teamId: string,
  gameId: string
): Promise<ActionResult> {
  // Skip the second auth round-trip — middleware already validated.
  const userId = readValidatedUserId();
  if (!userId) return { success: false, error: "Unauthenticated." };

  const membership = await getMembership(teamId, userId);
  if (!membership || membership.role !== "admin") {
    return { success: false, error: "Only admins can delete games." };
  }

  const admin = createAdminClient();
  // IDOR guard: the child-table deletes below run via the RLS-bypassing
  // admin client keyed only on game_id. Confirm the game belongs to this
  // team first — otherwise an admin of any team could pass another team's
  // gameId and wipe its events + availability (the games row itself is
  // already team-scoped, so it would survive, leaving silent data loss).
  const { data: ownerCheck } = await admin
    .from("games")
    .select("team_id")
    .eq("id", gameId)
    .maybeSingle();
  if (!ownerCheck || !gameBelongsToTeam(ownerCheck.team_id, teamId)) {
    return { success: false, error: "Game not found for this team." };
  }
  await admin.from("game_events").delete().eq("game_id", gameId);
  await admin.from("game_availability").delete().eq("game_id", gameId);
  const { error: delError } = await admin
    .from("games")
    .delete()
    .eq("id", gameId)
    .eq("team_id", teamId);
  if (delError) return { success: false, error: delError.message };

  // Game + its events removed — drop the season-events cache.
  invalidateSeasonEvents(teamId);

  revalidatePath(`/teams/${teamId}/games`);
  revalidatePath(`/teams/${teamId}`);
  return { success: true };
}

/**
 * Is the game still there? An open live screen (or the game-day link)
 * asks now and then, and on coming back to the tab: round 3 edge testing
 * (24 Oct 2026) found a deleted game's live screen carried on, recording
 * into nothing, until a reload. Only a game that's definitely gone says
 * false; anything uncertain (offline, a hiccup) says true.
 */
export async function gameStillExists(auth: LiveAuth, gameId: string): Promise<{ exists: boolean }> {
  try {
    if (auth.kind === "token") {
      const { data, error } = await createAdminClient()
        .from("games")
        .select("id")
        .eq("id", gameId)
        .eq("share_token", auth.token)
        .maybeSingle();
      return { exists: !!data || !!error };
    }
    const { data, error } = await createClient()
      .from("games")
      .select("id")
      .eq("id", gameId)
      .eq("team_id", auth.teamId)
      .maybeSingle();
    return { exists: !!data || !!error };
  } catch {
    return { exists: true };
  }
}

/**
 * A game the coach never ran in Siren, played without the app (round 3
 * edge testing, 24 Oct 2026: a past game stayed "Next up" forever). It
 * moves to Completed with no events, so it has no score or minutes, and
 * isn't a 0–0 draw in the record (lib/games/notPlayed playedInSiren).
 */
export async function markGamePlayed(teamId: string, gameId: string): Promise<ActionResult> {
  const userId = readValidatedUserId();
  if (!userId) return { success: false, error: "Unauthenticated." };
  const membership = await getMembership(teamId, userId);
  if (!membership || membership.role !== "admin") {
    return { success: false, error: "Only admins can change a game." };
  }

  const supabase = createClient();
  const { data: game } = await supabase
    .from("games")
    .select("status")
    .eq("id", gameId)
    .eq("team_id", teamId)
    .maybeSingle();
  if (!game) return { success: false, error: "Game not found for this team." };
  if (game.status !== "upcoming") return { success: false, error: "That game was started in Siren." };
  const { count } = await supabase
    .from("game_events")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId);
  if ((count ?? 0) > 0) return { success: false, error: "That game was started in Siren." };

  const { error: updateError } = await supabase
    .from("games")
    .update({ status: "completed" })
    .eq("id", gameId)
    .eq("team_id", teamId);
  if (updateError) return { success: false, error: updateError.message };

  revalidatePath(`/teams/${teamId}`);
  revalidatePath(`/teams/${teamId}/games`);
  revalidatePath(`/teams/${teamId}/games/${gameId}`);
  revalidatePath("/dashboard");
  return { success: true };
}
