"use server";

// ─── Football (soccer) live-game server actions ──────────────
// Parallel to live/actions.ts (AFL), netball-actions.ts and
// league-actions.ts, for every sport on the soccer family's engine
// (Football (soccer), futsal, hockey). The family records no event
// type of its own (migrations 0068, 0071): the shapes it writes are the
// ones src/lib/sports/soccer/replay.ts reads —
//   lineup_set       { lineup: SoccerLineup, quarter?, elapsed_ms? }
//   quarter_start    { quarter }       (the half, or hockey's quarter)
//   quarter_end      { quarter, elapsed_ms }
//   swap             { off_player_id, on_player_id, line?, quarter, elapsed_ms }
//   field_zone_swap  { player_a_id, zone_a, player_b_id?, zone_b, quarter, elapsed_ms }
//   goal / opponent_goal, score_undo, game_finalised
// Injuries, loans, late arrivals and holds (the keeper's "Keep in
// goal") go through the shared actions in live/actions.ts, as league's
// and netball's do.
//
// Auth, write queue and idempotency match the other sports: every
// mutation resolves the writer (team membership or share token), passes
// an optional idempotency key through to game_events, invalidates the
// season-events cache and revalidates the live page. Every event is
// stamped with the team's own sport, and every rule is read from the
// team's own age group in its own sport (soccerTeam), never another
// sport's.

import { cache } from "react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, getMembership } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSoccer, teamSport, type SoccerSport } from "@/lib/sports/registry";
import { soccerFamilyAgeGroupForTeam, soccerFamilyRules } from "@/lib/sports/soccer/family";
import { readValidatedUserId } from "@/lib/auth/userIdHeader";
import { invalidateSeasonEvents } from "@/lib/season";
import {
  buildAvailableIds,
  reconcileLineupToAvailability,
} from "@/lib/live/reconcileLineupToAvailability";
import { takeUndoTarget } from "@/lib/live/scoreUndo";
import type { ActionResult, LiveAuth } from "@/lib/types";
import {
  normalizeSoccerLineup,
  validateSoccerLineup,
  type SoccerLineup,
} from "@/lib/sports/soccer/lineup";
import type { SoccerAgeGroupConfig, SoccerUnit } from "@/lib/sports/soccer/types";
import { SOCCER_UNITS } from "@/lib/sports/soccer/types";
import { kickoffSnapshot } from "@/lib/playbook/snapshot";
import { writeGameRollup } from "@/lib/playbook/rollupStore";
import type { PlaybookSnapshot } from "@/lib/playbook/types";

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
  const userId = readValidatedUserId();
  if (!userId) {
    return { supabase, userId: null, teamId: auth.teamId, error: "Unauthenticated." };
  }
  const membership = await getMembership(auth.teamId, userId);
  if (!membership || (membership.role !== "admin" && membership.role !== "game_manager")) {
    return { supabase, userId, teamId: auth.teamId, error: "Not authorised." };
  }
  return { supabase, userId, teamId: auth.teamId, error: null };
}

/**
 * The team's sport and age group, in its halves or quarters
 * (teams.period_count, hockey). Every rule checked here is the team's
 * own; a team of a sport off the family's engine is an error, never a
 * fallback. Read past RLS (a team's sport and age aren't secret, and
 * resolveWriter has already checked the writer): an RLS read of a team
 * created moments ago can come back empty. Cached for the request.
 */
const soccerTeam = cache(async (teamId: string): Promise<{ sport: SoccerSport; ageCfg: SoccerAgeGroupConfig }> => {
  const { data } = await createAdminClient()
    .from("teams")
    .select("sport, age_group, period_count")
    .eq("id", teamId)
    .maybeSingle();
  const row = data as { sport?: string | null; age_group?: string | null; period_count?: number | null } | null;
  const sport = teamSport(row?.sport);
  if (!isSoccer(sport)) throw new Error(`Team ${teamId} plays ${sport}, not a sport on the soccer family's engine.`);
  return { sport, ageCfg: soccerFamilyAgeGroupForTeam(sport, row?.age_group ?? null, row?.period_count ?? null) };
});

async function insertEvent(
  auth: LiveAuth,
  gameId: string,
  type: string,
  payload: { player_id?: string | null; metadata?: Record<string, unknown> },
  idempotencyKey?: string,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };
  const { sport } = await soccerTeam(w.teamId);

  const { error } = await w.supabase.from("game_events").insert({
    game_id: gameId,
    type,
    player_id: payload.player_id ?? null,
    metadata: { ...(payload.metadata ?? {}), sport },
    created_by: w.userId,
    idempotency_key: idempotencyKey ?? null,
  });
  if (error) {
    // Unique-violation on the idempotency_key partial index means this
    // op already landed (write queue retry). Treat as success.
    if (error.code === "23505" && idempotencyKey) return { success: true };
    return { success: false, error: error.message };
  }
  if (w.teamId) invalidateSeasonEvents(w.teamId);
  return { success: true };
}

async function revalidateAfterMutation(auth: LiveAuth, gameId: string): Promise<ActionResult> {
  if (auth.kind === "team") {
    const w = await resolveWriter(auth, gameId);
    if (w.error) return { success: false, error: w.error };
    revalidatePath(`/teams/${w.teamId}/games/${gameId}/live`);
  } else {
    revalidatePath(`/run/${auth.token}`, "layout");
  }
  return { success: true };
}

/**
 * A lineup with everyone who can't play today taken out: the shared
 * filter for the lines and bench, and the keeper (a single id, which the
 * shared filter leaves alone) by hand.
 */
async function reconcileSoccerLineup(supabase: SupabaseClient, gameId: string, raw: SoccerLineup): Promise<SoccerLineup> {
  const lineup = normalizeSoccerLineup(await reconcileLineupToAvailability(supabase, gameId, raw));
  if (lineup.keeper) {
    const here = await buildAvailableIds(supabase, gameId);
    if (!here.has(lineup.keeper)) lineup.keeper = null;
  }
  return lineup;
}

// ─── startSoccerGame ─────────────────────────────────────────
// The kick-off lineup, and the game goes in progress. With
// `startHalfToo` the first half's quarter_start lands in the same call
// (AFL's and netball's two-step kick-off otherwise). The lineup is
// checked against the team's own age group at the game's size: a
// missing keeper from 7 a side, or more kids on than the game plays, is
// refused before anything is written.
export async function startSoccerGame(
  auth: LiveAuth,
  gameId: string,
  rawLineup: SoccerLineup,
  onFieldSize: number,
  startHalfToo: boolean = false,
  subIntervalSeconds?: number | null,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };
  const { sport, ageCfg } = await soccerTeam(w.teamId);

  const size = Math.max(ageCfg.minOnFieldSize, Math.min(ageCfg.maxOnFieldSize, Math.floor(onFieldSize)));
  const lineup = await reconcileSoccerLineup(w.supabase, gameId, rawLineup);
  const check = validateSoccerLineup(lineup, ageCfg, size, soccerFamilyRules(sport));
  const firstError = check.issues.find((i) => i.kind === "error");
  if (firstError) return { success: false, error: firstError.message };

  const { error: insertError } = await w.supabase.from("game_events").insert({
    game_id: gameId,
    type: "lineup_set",
    metadata: { lineup, sport },
    created_by: w.userId,
  });
  if (insertError) return { success: false, error: insertError.message };

  if (startHalfToo) {
    const { error: startError } = await w.supabase.from("game_events").insert({
      game_id: gameId,
      type: "quarter_start",
      metadata: { quarter: 1, sport },
      created_by: w.userId,
    });
    if (startError) return { success: false, error: startError.message };
  }

  const gameUpdate: {
    status: "in_progress";
    on_field_size: number;
    sub_interval_seconds?: number;
    playbook_snapshot: PlaybookSnapshot | null;
  } = {
    status: "in_progress",
    on_field_size: size,
    // How we play at kick-off (UX plan 3.7).
    playbook_snapshot: await kickoffSnapshot(w.supabase, w.teamId),
  };
  if (subIntervalSeconds != null) {
    gameUpdate.sub_interval_seconds = Math.round(Math.min(10 * 60, Math.max(60, subIntervalSeconds)));
  }
  await w.supabase.from("games").update(gameUpdate).eq("id", gameId);

  // Kick-off retires the pre-game draft, as for every sport.
  await w.supabase.from("game_lineup_drafts").delete().eq("game_id", gameId);
  invalidateSeasonEvents(w.teamId);

  if (auth.kind === "team") {
    revalidatePath(`/teams/${w.teamId}/games/${gameId}/live`);
    redirect(`/teams/${w.teamId}/games/${gameId}/live`);
  }
  revalidatePath(`/run/${auth.token}`, "layout");
  return { success: true };
}

// ─── saveSoccerLineupDraft ───────────────────────────────────
// The pre-game draft, in the sport-agnostic game_lineup_drafts table
// (its jsonb carries whichever shape the sport uses).
export async function saveSoccerLineupDraft(
  auth: LiveAuth,
  gameId: string,
  lineup: SoccerLineup,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };
  await soccerTeam(w.teamId);

  const { data: gameRow } = await w.supabase
    .from("games")
    .select("on_field_size, sub_interval_seconds")
    .eq("id", gameId)
    .maybeSingle();
  const row = gameRow as { on_field_size?: number; sub_interval_seconds?: number } | null;

  const { error } = await w.supabase.from("game_lineup_drafts").upsert(
    {
      game_id: gameId,
      lineup: normalizeSoccerLineup(lineup),
      on_field_size: row?.on_field_size,
      sub_interval_seconds: row?.sub_interval_seconds,
      updated_by: w.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "game_id" },
  );
  if (error) return { success: false, error: error.message };

  if (auth.kind === "team") {
    revalidatePath(`/teams/${w.teamId}/games/${gameId}`);
    revalidatePath(`/teams/${w.teamId}/games/${gameId}/live`);
  }
  return { success: true };
}

// ─── startSoccerHalf / endSoccerHalf ─────────────────────────
// `quarter` is the period (a half, or hockey's quarter): the family
// reuses the period events every sport writes.
export async function startSoccerHalf(
  auth: LiveAuth,
  gameId: string,
  quarter: number,
  idempotencyKey?: string,
): Promise<ActionResult> {
  const result = await insertEvent(auth, gameId, "quarter_start", { metadata: { quarter } }, idempotencyKey);
  if (!result.success) return result;
  return revalidateAfterMutation(auth, gameId);
}

export async function endSoccerHalf(
  auth: LiveAuth,
  gameId: string,
  quarter: number,
  elapsedMs: number,
  idempotencyKey?: string,
): Promise<ActionResult> {
  const result = await insertEvent(
    auth,
    gameId,
    "quarter_end",
    { metadata: { quarter, elapsed_ms: elapsedMs } },
    idempotencyKey,
  );
  if (!result.success) return result;
  return revalidateAfterMutation(auth, gameId);
}

// ─── finaliseSoccerGame ──────────────────────────────────────
// game_finalised, then the game is completed and its season time rolled
// up (stats and season balance). The full-time review sits between the
// last half's end and this call, so scores can be fixed first.
export async function finaliseSoccerGame(
  auth: LiveAuth,
  gameId: string,
  elapsedMs: number,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };
  const { ageCfg } = await soccerTeam(w.teamId);

  const finalise = await insertEvent(auth, gameId, "game_finalised", {
    metadata: { quarter: ageCfg.periodCount, elapsed_ms: elapsedMs },
  });
  if (!finalise.success) return finalise;

  const { error: updateError } = await w.supabase.from("games").update({ status: "completed" }).eq("id", gameId);
  if (updateError) return { success: false, error: updateError.message };

  await writeGameRollup(w.supabase, gameId);

  if (auth.kind === "team") {
    revalidatePath(`/teams/${w.teamId}/games/${gameId}`);
    revalidatePath(`/teams/${w.teamId}/games/${gameId}/live`);
    revalidatePath(`/teams/${w.teamId}/games`);
    revalidatePath(`/teams/${w.teamId}/stats`);
  } else {
    revalidatePath(`/run/${auth.token}`, "layout");
  }
  return { success: true };
}

// ─── recordSoccerLineupSet ───────────────────────────────────
// The whole lineup at once: the half-time plan just before the second
// half starts, or a reshuffle mid-half (with `at`, so time is credited
// to the moment it happened).
export async function recordSoccerLineupSet(
  auth: LiveAuth,
  gameId: string,
  lineup: SoccerLineup,
  at: { quarter: number; elapsed_ms: number } | undefined,
  idempotencyKey?: string,
): Promise<ActionResult> {
  return insertEvent(
    auth,
    gameId,
    "lineup_set",
    { metadata: { lineup: normalizeSoccerLineup(lineup), ...(at ?? {}) } },
    idempotencyKey,
  );
}

const unitOrUndefined = (v: unknown): SoccerUnit | undefined =>
  typeof v === "string" && (SOCCER_UNITS as readonly string[]).includes(v) ? (v as SoccerUnit) : undefined;

// ─── recordSoccerSwap ────────────────────────────────────────
// A sub: the kid coming on takes the place of the kid going off, in goal
// or in their line. `line` names the spot when the kid going off has
// already left (an injury or a loan landed first) or the spot is empty.
export async function recordSoccerSwap(
  auth: LiveAuth,
  gameId: string,
  input: {
    off_player_id: string | null;
    on_player_id: string;
    line?: SoccerUnit;
    quarter: number;
    elapsed_ms: number;
  },
  idempotencyKey?: string,
): Promise<ActionResult> {
  const line = unitOrUndefined(input.line);
  return insertEvent(
    auth,
    gameId,
    "swap",
    {
      player_id: input.on_player_id,
      metadata: {
        off_player_id: input.off_player_id,
        on_player_id: input.on_player_id,
        ...(line ? { line } : {}),
        quarter: input.quarter,
        elapsed_ms: input.elapsed_ms,
      },
    },
    idempotencyKey,
  );
}

// ─── recordSoccerMove ────────────────────────────────────────
// Two kids on the field swap places (between lines, or one into goal),
// or one kid moves into a spot (an empty goal, a short line).
export async function recordSoccerMove(
  auth: LiveAuth,
  gameId: string,
  input: {
    player_a_id: string;
    zone_a: SoccerUnit;
    player_b_id?: string | null;
    zone_b: SoccerUnit;
    quarter: number;
    elapsed_ms: number;
  },
  idempotencyKey?: string,
): Promise<ActionResult> {
  const zoneA = unitOrUndefined(input.zone_a);
  const zoneB = unitOrUndefined(input.zone_b);
  if (!zoneA || !zoneB) return { success: false, error: "That isn't a spot on a soccer field." };
  return insertEvent(
    auth,
    gameId,
    "field_zone_swap",
    {
      player_id: input.player_a_id,
      metadata: {
        player_a_id: input.player_a_id,
        zone_a: zoneA,
        ...(input.player_b_id ? { player_b_id: input.player_b_id } : {}),
        zone_b: zoneB,
        quarter: input.quarter,
        elapsed_ms: input.elapsed_ms,
      },
    },
    idempotencyKey,
  );
}

// ─── Goals ───────────────────────────────────────────────────
// One point each (soccer's scoreTypes). player_id is the scorer, or
// null when the coach didn't say who.
export async function recordSoccerGoal(
  auth: LiveAuth,
  gameId: string,
  playerId: string | null,
  quarter: number,
  elapsedMs: number,
  idempotencyKey?: string,
): Promise<ActionResult> {
  const result = await insertEvent(
    auth,
    gameId,
    "goal",
    { player_id: playerId, metadata: { quarter, elapsed_ms: elapsedMs } },
    idempotencyKey,
  );
  if (!result.success) return result;
  return revalidateAfterMutation(auth, gameId);
}

export async function recordSoccerOpponentGoal(
  auth: LiveAuth,
  gameId: string,
  quarter: number,
  elapsedMs: number,
  idempotencyKey?: string,
): Promise<ActionResult> {
  const result = await insertEvent(
    auth,
    gameId,
    "opponent_goal",
    { metadata: { quarter, elapsed_ms: elapsedMs } },
    idempotencyKey,
  );
  if (!result.success) return result;
  return revalidateAfterMutation(auth, gameId);
}

// ─── undoSoccerScore ─────────────────────────────────────────
// Takes back the latest goal still standing (either side), naming it so
// a replay takes back exactly that one.
export async function undoSoccerScore(
  auth: LiveAuth,
  gameId: string,
  idempotencyKey?: string,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  const { data: rows } = await w.supabase
    .from("game_events")
    .select("id, type, metadata, player_id")
    .eq("game_id", gameId)
    .in("type", ["goal", "opponent_goal", "score_undo"])
    .order("created_at", { ascending: true });
  type ScoreRow = { id: string; type: string; metadata: unknown; player_id: string | null };
  const standing: ScoreRow[] = [];
  for (const row of (rows ?? []) as ScoreRow[]) {
    if (row.type === "score_undo") takeUndoTarget(standing, row.metadata);
    else standing.push(row);
  }
  const latest = standing[standing.length - 1];
  // Nothing standing: nothing to take back (and a retry won't change that).
  if (!latest) return { success: true };

  const result = await insertEvent(
    auth,
    gameId,
    "score_undo",
    {
      player_id: latest.player_id ?? null,
      metadata: {
        target_event_id: latest.id,
        original_type: latest.type,
        quarter: (latest.metadata as { quarter?: number } | null)?.quarter,
      },
    },
    idempotencyKey,
  );
  if (!result.success) return result;
  return revalidateAfterMutation(auth, gameId);
}
