"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult, LiveAuth, Lineup, Zone } from "@/lib/types";

interface Writer {
  supabase: SupabaseClient;
  userId: string | null;
  teamId: string;
  error: string | null;
}

async function resolveWriter(auth: LiveAuth, gameId: string): Promise<Writer> {
  if (auth.kind === "token") {
    const admin = createAdminClient();
    const { data: game } = await admin
      .from("games")
      .select("id, team_id, share_token")
      .eq("id", gameId)
      .maybeSingle();
    if (!game || game.share_token !== auth.token) {
      return {
        supabase: admin,
        userId: null,
        teamId: "",
        error: "Invalid share link.",
      };
    }
    return { supabase: admin, userId: null, teamId: game.team_id, error: null };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      supabase,
      userId: null,
      teamId: auth.teamId,
      error: "Unauthenticated.",
    };
  }
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
    return {
      supabase,
      userId: user.id,
      teamId: auth.teamId,
      error: "Not authorised.",
    };
  }
  return { supabase, userId: user.id, teamId: auth.teamId, error: null };
}

async function insertEvent(
  auth: LiveAuth,
  gameId: string,
  type: string,
  payload: { player_id?: string | null; metadata?: Record<string, unknown> }
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  const { error: insertError } = await w.supabase.from("game_events").insert({
    game_id: gameId,
    type,
    player_id: payload.player_id ?? null,
    metadata: payload.metadata ?? {},
    created_by: w.userId,
  });
  if (insertError) return { success: false, error: insertError.message };
  return { success: true };
}

export async function startGame(
  auth: LiveAuth,
  gameId: string,
  lineup: Lineup,
  subIntervalSeconds: number,
  onFieldSize: number
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  const { error: insertError } = await w.supabase.from("game_events").insert({
    game_id: gameId,
    type: "lineup_set",
    metadata: { lineup },
    created_by: w.userId,
  });
  if (insertError) return { success: false, error: insertError.message };

  await w.supabase
    .from("games")
    .update({
      status: "in_progress",
      sub_interval_seconds: subIntervalSeconds,
      on_field_size: onFieldSize,
    })
    .eq("id", gameId);

  if (auth.kind === "team") {
    revalidatePath(`/teams/${w.teamId}/games/${gameId}`);
    revalidatePath(`/teams/${w.teamId}/games/${gameId}/live`);
    redirect(`/teams/${w.teamId}/games/${gameId}/live`);
  }
  revalidatePath(`/run/${auth.token}`, "layout");
  return { success: true };
}

export async function startQuarter(
  auth: LiveAuth,
  gameId: string,
  quarter: number
): Promise<ActionResult> {
  const result = await insertEvent(auth, gameId, "quarter_start", {
    metadata: { quarter },
  });
  if (!result.success) return result;

  if (auth.kind === "team") {
    revalidatePath(`/teams/${auth.teamId}/games/${gameId}/live`);
  } else {
    revalidatePath(`/run/${auth.token}`, "layout");
  }
  return result;
}

export async function endQuarter(
  auth: LiveAuth,
  gameId: string,
  quarter: number,
  elapsedMs: number
): Promise<ActionResult> {
  const result = await insertEvent(auth, gameId, "quarter_end", {
    metadata: { quarter, elapsed_ms: elapsedMs },
  });
  if (!result.success) return result;

  // Non-final quarter ends still need to revalidate so the live page rerenders
  // into the Q-break shell. Q4 finalisation falls through to its own
  // revalidate block below (which also revalidates /games + /stats).
  if (quarter < 4) {
    if (auth.kind === "team") {
      const w = await resolveWriter(auth, gameId);
      if (w.error) return { success: false, error: w.error };
      revalidatePath(`/teams/${w.teamId}/games/${gameId}/live`);
    } else {
      revalidatePath(`/run/${auth.token}`, "layout");
    }
    return { success: true };
  }

  // Q4 end finalises the match: append a game_finalised event (so the replay
  // state reflects it) and flip the game row to "completed" so the dashboard
  // and season stats pick it up.
  if (quarter >= 4) {
    const finaliseResult = await insertEvent(auth, gameId, "game_finalised", {
      metadata: { quarter, elapsed_ms: elapsedMs },
    });
    if (!finaliseResult.success) return finaliseResult;

    const w = await resolveWriter(auth, gameId);
    if (w.error) return { success: false, error: w.error };
    const { error: updateError } = await w.supabase
      .from("games")
      .update({ status: "completed" })
      .eq("id", gameId);
    if (updateError) return { success: false, error: updateError.message };

    if (auth.kind === "team") {
      revalidatePath(`/teams/${w.teamId}/games/${gameId}`, "layout");
      revalidatePath(`/teams/${w.teamId}/games`);
      revalidatePath(`/teams/${w.teamId}/stats`);
    } else {
      revalidatePath(`/run/${auth.token}`, "layout");
    }
  }
  return { success: true };
}

export async function addLateArrival(
  auth: LiveAuth,
  gameId: string,
  input: { player_id: string; quarter: number; elapsed_ms: number }
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };
  // updated_by + updated_at MUST be set: the INSERT policy on
  // game_availability has `with check (... and updated_by = auth.uid())`,
  // and Postgres evaluates the INSERT policy before falling through to
  // ON CONFLICT UPDATE — so an upsert that omits updated_by fails the
  // INSERT WITH CHECK and the whole statement errors, leaving the
  // existing "unavailable" row untouched. Mirrors setAvailability.
  // (Token path goes through admin client which bypasses RLS, but it's
  // still hygienic to set the columns.)
  const { error: upsertError } = await w.supabase
    .from("game_availability")
    .upsert(
      {
        game_id: gameId,
        player_id: input.player_id,
        status: "available",
        updated_by: w.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "game_id,player_id" }
    );
  if (upsertError) return { success: false, error: upsertError.message };
  return insertEvent(auth, gameId, "player_arrived", {
    player_id: input.player_id,
    metadata: { quarter: input.quarter, elapsed_ms: input.elapsed_ms },
  });
}

export async function recordGoal(
  auth: LiveAuth,
  gameId: string,
  input: { player_id: string; quarter: number; elapsed_ms: number }
): Promise<ActionResult> {
  return insertEvent(auth, gameId, "goal", {
    player_id: input.player_id,
    metadata: { quarter: input.quarter, elapsed_ms: input.elapsed_ms },
  });
}

export async function recordBehind(
  auth: LiveAuth,
  gameId: string,
  input: { player_id: string; quarter: number; elapsed_ms: number }
): Promise<ActionResult> {
  return insertEvent(auth, gameId, "behind", {
    player_id: input.player_id,
    metadata: { quarter: input.quarter, elapsed_ms: input.elapsed_ms },
  });
}

export async function recordOpponentScore(
  auth: LiveAuth,
  gameId: string,
  input: { kind: "goal" | "behind"; quarter: number; elapsed_ms: number }
): Promise<ActionResult> {
  return insertEvent(
    auth,
    gameId,
    input.kind === "goal" ? "opponent_goal" : "opponent_behind",
    { metadata: { quarter: input.quarter, elapsed_ms: input.elapsed_ms } }
  );
}

export async function markInjury(
  auth: LiveAuth,
  gameId: string,
  input: {
    player_id: string;
    injured: boolean;
    quarter: number;
    elapsed_ms: number;
  }
): Promise<ActionResult> {
  return insertEvent(auth, gameId, "injury", {
    player_id: input.player_id,
    metadata: {
      injured: input.injured,
      quarter: input.quarter,
      elapsed_ms: input.elapsed_ms,
    },
  });
}

// Mark a player as lent to the opposition (or bring them back). While loaned
// they're excluded from sub rotation like an injury, but the loan minutes
// accumulate into a season-long tally the coach can use to spread the favour.
export async function markLoan(
  auth: LiveAuth,
  gameId: string,
  input: {
    player_id: string;
    loaned: boolean;
    quarter: number;
    elapsed_ms: number;
  }
): Promise<ActionResult> {
  return insertEvent(auth, gameId, "player_loan", {
    player_id: input.player_id,
    metadata: {
      loaned: input.loaned,
      quarter: input.quarter,
      elapsed_ms: input.elapsed_ms,
    },
  });
}

export async function recordLineupSet(
  auth: LiveAuth,
  gameId: string,
  lineup: Lineup
): Promise<ActionResult> {
  return insertEvent(auth, gameId, "lineup_set", {
    metadata: { lineup },
  });
}

export async function recordSwap(
  auth: LiveAuth,
  gameId: string,
  input: {
    off_player_id: string;
    on_player_id: string;
    zone: Zone;
    quarter: number;
    elapsed_ms: number;
  }
): Promise<ActionResult> {
  return insertEvent(auth, gameId, "swap", {
    player_id: input.on_player_id,
    metadata: input,
  });
}

export async function undoLastScore(
  auth: LiveAuth,
  gameId: string,
  input: {
    kind: "goal" | "behind" | "opponent_goal" | "opponent_behind";
    quarter: number;
    playerId: string | null;
  }
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  const { data: latest } = await w.supabase
    .from("game_events")
    .select("id")
    .eq("game_id", gameId)
    .eq("type", input.kind)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) return { success: false, error: "No score event found to undo." };

  return insertEvent(auth, gameId, "score_undo", {
    player_id: input.playerId,
    metadata: {
      target_event_id: latest.id,
      original_type: input.kind,
      quarter: input.quarter,
    },
  });
}

export async function recordFieldZoneSwap(
  auth: LiveAuth,
  gameId: string,
  input: {
    player_a_id: string;
    zone_a: string;
    player_b_id: string;
    zone_b: string;
    quarter: number;
    elapsed_ms: number;
  }
): Promise<ActionResult> {
  return insertEvent(auth, gameId, "field_zone_swap", {
    player_id: input.player_a_id,
    metadata: input,
  });
}
