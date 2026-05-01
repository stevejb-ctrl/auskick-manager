"use server";

// ─── Netball live-game server actions ─────────────────────────
// Parallel to live/actions.ts but emits netball-shaped events.
// Auth resolution is the same (team membership + admin/game_manager
// role OR share-token for the parent-runner path).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult, LiveAuth } from "@/lib/types";
import type { GenericLineup } from "@/lib/sports/netball/fairness";

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
      return { supabase: admin, userId: null, teamId: "", error: "Invalid share link." };
    }
    return { supabase: admin, userId: null, teamId: game.team_id, error: null };
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { supabase, userId: null, teamId: auth.teamId, error: "Unauthenticated." };
  }
  const { data: membership } = await supabase
    .from("team_memberships")
    .select("role")
    .eq("team_id", auth.teamId)
    .eq("user_id", user.id)
    .single();
  if (!membership || (membership.role !== "admin" && membership.role !== "game_manager")) {
    return { supabase, userId: user.id, teamId: auth.teamId, error: "Not authorised." };
  }
  return { supabase, userId: user.id, teamId: auth.teamId, error: null };
}

async function insertEvent(
  auth: LiveAuth,
  gameId: string,
  type: string,
  payload: { player_id?: string | null; metadata?: Record<string, unknown> },
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  const { error } = await w.supabase.from("game_events").insert({
    game_id: gameId,
    type,
    player_id: payload.player_id ?? null,
    metadata: payload.metadata ?? {},
    created_by: w.userId,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─── startNetballGame ────────────────────────────────────────
// Initial lineup + flip the game into "in_progress".
//
// `quarterLengthSeconds` carries the per-game override the coach set
// in the pre-game lineup picker (the AFL pre-game "Sub interval" card
// is repurposed for netball — no in-game subs, but per-game quarter
// length is the equivalent dial). Pass `null` (or omit) to leave
// games.quarter_length_seconds untouched, in which case the live
// clock falls back through team → age-group defaults.
export async function startNetballGame(
  auth: LiveAuth,
  gameId: string,
  lineup: GenericLineup,
  onFieldSize: number,
  quarterLengthSeconds?: number | null,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  const { error: insertError } = await w.supabase.from("game_events").insert({
    game_id: gameId,
    type: "lineup_set",
    metadata: { lineup, sport: "netball" },
    created_by: w.userId,
  });
  if (insertError) return { success: false, error: insertError.message };

  // Validate the override before writing — bounds match the picker
  // input (1..30 min). Leaves the column untouched when the picker
  // sent `null` / `undefined` (i.e. coach left the team default).
  const update: { status: "in_progress"; on_field_size: number; quarter_length_seconds?: number | null } = {
    status: "in_progress",
    on_field_size: onFieldSize,
  };
  if (quarterLengthSeconds != null) {
    if (
      !Number.isInteger(quarterLengthSeconds) ||
      quarterLengthSeconds < 60 ||
      quarterLengthSeconds > 30 * 60
    ) {
      return {
        success: false,
        error: "Quarter length must be a whole number between 1 and 30 minutes.",
      };
    }
    update.quarter_length_seconds = quarterLengthSeconds;
  }

  await w.supabase.from("games").update(update).eq("id", gameId);

  if (auth.kind === "team") {
    revalidatePath(`/teams/${w.teamId}/games/${gameId}/live`);
    redirect(`/teams/${w.teamId}/games/${gameId}/live`);
  }
  revalidatePath(`/run/${auth.token}`, "layout");
  return { success: true };
}

// ─── periodBreakSwap ─────────────────────────────────────────
// Snapshot the lineup about to take the court at a quarter break.
//
// `midQuarterSubs` carries the timestamps of any mid-quarter
// substitutions that happened DURING the quarter just ended. The
// replay engine uses them to split the closing quarter's time
// credit between sub-out and sub-in players, so an injured player
// who was on for 3 minutes gets credit for 3 minutes (not the full 8)
// AFTER the page reloads or moves into the next quarter. Without
// this metadata, the trailing-lineup credit would default to the
// pre-sub Q1 lineup × full period, and the substitute would forever
// show 0:00.
export async function periodBreakSwap(
  auth: LiveAuth,
  gameId: string,
  quarter: number,
  lineup: GenericLineup,
  midQuarterSubs?: Array<{
    positionId: string;
    // null when the slot was empty before the sub (lent-without-
    // replacement followed by a tap-to-fill). Replay engine skips
    // the bench-add for those.
    outPlayerId: string | null;
    inPlayerId: string;
    atMs: number;
  }>,
): Promise<ActionResult> {
  return insertEvent(auth, gameId, "period_break_swap", {
    metadata: {
      quarter,
      lineup,
      sport: "netball",
      midQuarterSubs: midQuarterSubs ?? [],
    },
  });
}

// ─── startNetballQuarter ─────────────────────────────────────
export async function startNetballQuarter(
  auth: LiveAuth,
  gameId: string,
  quarter: number,
): Promise<ActionResult> {
  const result = await insertEvent(auth, gameId, "quarter_start", {
    metadata: { quarter, sport: "netball" },
  });
  if (!result.success) return result;

  // Phase 5: revalidate so the live page picks up the quarter_start
  // event on next render — pairs with router.refresh() in the client.
  // (Phase 4 deferred item #2 / 04-EVIDENCE.md §5.)
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  if (auth.kind === "team") {
    revalidatePath(`/teams/${w.teamId}/games/${gameId}/live`);
  } else {
    revalidatePath(`/run/${auth.token}`, "layout");
  }
  return { success: true };
}

// ─── endNetballQuarter ───────────────────────────────────────
export async function endNetballQuarter(
  auth: LiveAuth,
  gameId: string,
  quarter: number,
  elapsedMs: number,
): Promise<ActionResult> {
  const result = await insertEvent(auth, gameId, "quarter_end", {
    metadata: { quarter, elapsed_ms: elapsedMs, sport: "netball" },
  });
  if (!result.success) return result;

  if (quarter >= 4) {
    const finalise = await insertEvent(auth, gameId, "game_finalised", {
      metadata: { quarter, elapsed_ms: elapsedMs, sport: "netball" },
    });
    if (!finalise.success) return finalise;

    const w = await resolveWriter(auth, gameId);
    if (w.error) return { success: false, error: w.error };
    await w.supabase.from("games").update({ status: "completed" }).eq("id", gameId);

    if (auth.kind === "team") {
      revalidatePath(`/teams/${w.teamId}/games/${gameId}`, "layout");
      revalidatePath(`/teams/${w.teamId}/games`);
    } else {
      revalidatePath(`/run/${auth.token}`, "layout");
    }
  } else {
    // ── Phase 5: non-final revalidate so the live page picks up
    //    the quarter_end event on next render. Without this, a
    //    parent-runner connecting to /run/[token] post-hooter sees
    //    stale Q-state until cache TTL or manual reload. (Phase 4
    //    deferred item #1 / 04-EVIDENCE.md §5.)
    const w = await resolveWriter(auth, gameId);
    if (w.error) return { success: false, error: w.error };

    if (auth.kind === "team") {
      revalidatePath(`/teams/${w.teamId}/games/${gameId}/live`);
    } else {
      revalidatePath(`/run/${auth.token}`, "layout");
    }
  }
  return { success: true };
}

// ─── recordNetballGoal / opponent goal ───────────────────────
export async function recordNetballGoal(
  auth: LiveAuth,
  gameId: string,
  playerId: string | null,
  quarter: number,
  elapsedMs: number,
): Promise<ActionResult> {
  return insertEvent(auth, gameId, "goal", {
    player_id: playerId,
    metadata: { quarter, elapsed_ms: elapsedMs, sport: "netball" },
  });
}

export async function recordNetballOpponentGoal(
  auth: LiveAuth,
  gameId: string,
  quarter: number,
  elapsedMs: number,
): Promise<ActionResult> {
  return insertEvent(auth, gameId, "opponent_goal", {
    metadata: { quarter, elapsed_ms: elapsedMs, sport: "netball" },
  });
}

// ─── scoreUndo ───────────────────────────────────────────────
// Append a marker event; replayNetballGame pairs score / score_undo
// LIFO from its own undoStack, so the action doesn't need a specific
// target event. The optional targetEventId stays as audit metadata
// when the caller has it.
export async function undoNetballScore(
  auth: LiveAuth,
  gameId: string,
  targetEventId?: string,
): Promise<ActionResult> {
  return insertEvent(auth, gameId, "score_undo", {
    metadata: { target: targetEventId, sport: "netball" },
  });
}
