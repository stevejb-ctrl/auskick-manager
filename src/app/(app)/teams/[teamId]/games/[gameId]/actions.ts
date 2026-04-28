"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult, AvailabilityStatus, LiveAuth } from "@/lib/types";

interface FillInInput {
  full_name: string;
  jersey_number: number | null;
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

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthenticated." };

  const { data: membership } = await supabase
    .from("team_memberships")
    .select("role")
    .eq("team_id", auth.teamId)
    .eq("user_id", user.id)
    .single();

  if (
    !membership ||
    (membership.role !== "admin" && membership.role !== "game_manager")
  ) {
    return { ok: false, error: "Not authorised." };
  }
  return { ok: true, kind: "team", userId: user.id, teamId: auth.teamId };
}

export async function setAvailability(
  auth: LiveAuth,
  gameId: string,
  playerId: string,
  status: AvailabilityStatus
): Promise<ActionResult> {
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
    const { error } = await admin.from("game_availability").upsert(
      {
        game_id: gameId,
        player_id: playerId,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "game_id,player_id" }
    );
    if (error) return { success: false, error: error.message };
    revalidatePath(`/run/${auth.token}`, "layout");
    return { success: true };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthenticated." };

  // Any team member — admin, game_manager, or parent — may toggle
  // availability. Parents are trusted to RSVP for their team.
  // Fill-in add/remove and live-game ops stay admin/game_manager via
  // their own authorizeManager calls below.
  const { data: membership } = await supabase
    .from("team_memberships")
    .select("role")
    .eq("team_id", auth.teamId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return { success: false, error: "Not authorised." };
  }

  const { error } = await supabase.from("game_availability").upsert(
    {
      game_id: gameId,
      player_id: playerId,
      status,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "game_id,player_id" }
  );

  if (error) return { success: false, error: error.message };

  // "layout" scope so the /live child route also reloads availability-derived
  // data when a player is flipped on the parent game page.
  revalidatePath(`/teams/${auth.teamId}/games/${gameId}`, "layout");
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

  const db = check.kind === "token" ? createAdminClient() : createClient();
  const { data, error } = await db
    .from("game_fill_ins")
    .insert({
      game_id: gameId,
      full_name: name,
      jersey_number: jersey,
      created_by: check.kind === "team" ? check.userId : null,
    })
    .select("id")
    .single();
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
    revalidatePath(`/teams/${check.teamId}/games/${gameId}`, "layout");
  }
  return { success: true, data: { id: data.id } };
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
    revalidatePath(`/teams/${check.teamId}/games/${gameId}`, "layout");
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
      .select("id, team_id, share_token")
      .eq("id", gameId)
      .maybeSingle();
    if (!game || game.share_token !== auth.token) {
      return { success: false, error: "Invalid share link." };
    }
    teamId = game.team_id;
  } else {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Unauthenticated." };

    const { data: membership } = await supabase
      .from("team_memberships")
      .select("role")
      .eq("team_id", auth.teamId)
      .eq("user_id", user.id)
      .single();
    if (!membership || membership.role !== "admin") {
      return { success: false, error: "Only admins can reset games." };
    }
    teamId = auth.teamId;
  }

  const { error: delError } = await admin
    .from("game_events")
    .delete()
    .eq("game_id", gameId);
  if (delError) return { success: false, error: delError.message };

  const { error: updError } = await admin
    .from("games")
    .update({ status: "upcoming" })
    .eq("id", gameId);
  if (updError) return { success: false, error: updError.message };

  revalidatePath(`/teams/${teamId}/games/${gameId}`, "layout");
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
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthenticated." };

  const { data: membership } = await supabase
    .from("team_memberships")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .single();
  if (!membership || membership.role !== "admin") {
    return { success: false, error: "Only admins can delete games." };
  }

  const admin = createAdminClient();
  await admin.from("game_events").delete().eq("game_id", gameId);
  await admin.from("game_availability").delete().eq("game_id", gameId);
  const { error: delError } = await admin
    .from("games")
    .delete()
    .eq("id", gameId)
    .eq("team_id", teamId);
  if (delError) return { success: false, error: delError.message };

  revalidatePath(`/teams/${teamId}/games`);
  return { success: true };
}
