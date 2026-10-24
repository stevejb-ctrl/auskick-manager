"use server";

// ─── Basketball live-game server actions ─────────────────────
// Parallel to soccer-actions.ts, league-actions.ts and netball-actions.ts.
// The shapes it writes are the ones src/lib/sports/basketball/replay.ts
// reads (migration 0069):
//   lineup_set       { lineup: BasketballLineup, quarter?, elapsed_ms? }
//   quarter_start    { quarter }       (the half or quarter)
//   quarter_end      { quarter, elapsed_ms }
//   swap             { off_player_id, on_player_id, line?, quarter, elapsed_ms }
//   field_zone_swap  { player_a_id, zone_a, player_b_id?, zone_b, quarter, elapsed_ms }
//   free_throw / two_pointer / three_pointer and the opponent's,
//   score_undo, foul { kind, undo? }, sit_out { duration_ms },
//   game_finalised
// Injuries (and a foul-out: an injury with reason "fouled_out"), loans,
// late arrivals and holds go through the shared actions in
// live/actions.ts, as the other sports' do.
//
// Auth, write queue and idempotency match the other sports: every
// mutation resolves the writer (team membership or share token), passes
// an optional idempotency key through to game_events, invalidates the
// season-events cache and revalidates the live page. Every event is
// stamped with the team's sport, and every rule is read from the team's
// own basketball age group as the team plays it (halves or quarters).

import { cache } from "react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, getMembership } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSportConfig, isBasketball, teamSport } from "@/lib/sports/registry";
import { basketballAgeGroupForTeam } from "@/lib/sports/basketball";
import { readValidatedUserId } from "@/lib/auth/userIdHeader";
import { invalidateSeasonEvents } from "@/lib/season";
import { reconcileLineupToAvailability } from "@/lib/live/reconcileLineupToAvailability";
import { checkPeriodWrite, periodWordOf, revalidateLivePage, scoreRowsOf, staleRefusal } from "@/lib/live/liveWriteGuard";
import { lineupWrite, type PeriodWrite } from "@/lib/live/periodGuard";
import { resolveUndoTarget, undoArgs, type UndoTargetRef } from "@/lib/live/undoTarget";
import type { ActionResult, LiveAuth } from "@/lib/types";
import {
  normalizeBasketballLineup,
  validateBasketballLineup,
  type BasketballLineup,
} from "@/lib/sports/basketball/lineup";
import { BASKETBALL_LINES, type BasketballAgeGroupConfig, type BasketballLine } from "@/lib/sports/basketball/types";
import type { BasketballFoulKind } from "@/lib/sports/basketball/replay";
import { BASKETBALL_SCORE_EVENT_TYPES, basketballScoreEventType } from "@/lib/sports/basketball/scoreEvents";
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
 * The team's basketball age group, as the team plays it (halves or
 * quarters). A team of another sport is an error, never a fallback.
 * Read past RLS (a team's sport and age aren't secret, and
 * resolveWriter has already checked the writer). Cached for the request.
 */
const basketballTeam = cache(async (teamId: string): Promise<{ ageCfg: BasketballAgeGroupConfig }> => {
  const { data } = await createAdminClient()
    .from("teams")
    .select("sport, age_group, period_count")
    .eq("id", teamId)
    .maybeSingle();
  const row = data as { sport?: string | null; age_group?: string | null; period_count?: number | null } | null;
  const sport = teamSport(row?.sport);
  if (!isBasketball(sport)) throw new Error(`Team ${teamId} plays ${sport}, not basketball.`);
  return { ageCfg: basketballAgeGroupForTeam(row?.age_group ?? null, row?.period_count ?? null) };
});

// The team's period word ("quarter", "half"), for a refusal's wording.
async function periodWordFor(teamId: string) {
  const { ageCfg } = await basketballTeam(teamId);
  return periodWordOf(ageCfg.periodLabel ?? getSportConfig("basketball").periodLabel);
}

async function insertEvent(
  auth: LiveAuth,
  gameId: string,
  type: string,
  payload: { player_id?: string | null; metadata?: Record<string, unknown> },
  idempotencyKey?: string,
  /** A period write: refused when another phone has moved the game on. */
  guard?: PeriodWrite,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };
  if (guard) {
    const verdict = await checkPeriodWrite(w.supabase, gameId, guard, await periodWordFor(w.teamId), idempotencyKey);
    if (verdict.kind === "stale") return staleRefusal(auth, w.teamId, gameId, verdict.message);
    if (verdict.kind === "duplicate") return { success: true };
  }
  await basketballTeam(w.teamId);

  const { error } = await w.supabase.from("game_events").insert({
    game_id: gameId,
    type,
    player_id: payload.player_id ?? null,
    metadata: { ...(payload.metadata ?? {}), sport: "basketball" },
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

// ─── startBasketballGame ─────────────────────────────────────
// The tip-off lineup, and the game goes in progress. With
// `startPeriodToo` the first period's quarter_start lands in the same
// call. The lineup is checked against the team's own age group at the
// game's size: more kids on court than the game plays is refused before
// anything is written.
export async function startBasketballGame(
  auth: LiveAuth,
  gameId: string,
  rawLineup: BasketballLineup,
  onCourtSize: number,
  startPeriodToo: boolean = false,
  subIntervalSeconds?: number | null,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };
  // A second phone's picker, still open after the first kicked off.
  const kickoff = await checkPeriodWrite(w.supabase, gameId, { kind: "kickoff" }, await periodWordFor(w.teamId));
  if (kickoff.kind !== "ok") return staleRefusal(auth, w.teamId, gameId, kickoff.kind === "stale" ? kickoff.message : "This game has already started.");
  const { ageCfg } = await basketballTeam(w.teamId);

  const size = Math.max(ageCfg.minOnFieldSize, Math.min(ageCfg.maxOnFieldSize, Math.floor(onCourtSize)));
  const lineup = normalizeBasketballLineup(await reconcileLineupToAvailability(w.supabase, gameId, rawLineup));
  // A position left with a kid who isn't playing today is dropped.
  if (lineup.slots) {
    const on = new Set(BASKETBALL_LINES.flatMap((l) => lineup.lines[l]));
    for (const pid of Object.keys(lineup.slots)) if (!on.has(pid)) delete lineup.slots[pid];
  }
  const check = validateBasketballLineup(lineup, ageCfg, size);
  const firstError = check.issues.find((i) => i.kind === "error");
  if (firstError) return { success: false, error: firstError.message };

  const { error: insertError } = await w.supabase.from("game_events").insert({
    game_id: gameId,
    type: "lineup_set",
    metadata: { lineup, sport: "basketball" },
    created_by: w.userId,
  });
  if (insertError) return { success: false, error: insertError.message };

  if (startPeriodToo) {
    const { error: startError } = await w.supabase.from("game_events").insert({
      game_id: gameId,
      type: "quarter_start",
      metadata: { quarter: 1, sport: "basketball" },
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
    // How we play at tip-off (UX plan 3.7).
    playbook_snapshot: await kickoffSnapshot(w.supabase, w.teamId),
  };
  if (subIntervalSeconds != null) {
    gameUpdate.sub_interval_seconds = Math.round(Math.min(10 * 60, Math.max(60, subIntervalSeconds)));
  }
  await w.supabase.from("games").update(gameUpdate).eq("id", gameId);

  // Tip-off retires the pre-game draft, as for every sport.
  await w.supabase.from("game_lineup_drafts").delete().eq("game_id", gameId);
  invalidateSeasonEvents(w.teamId);

  if (auth.kind === "team") {
    revalidatePath(`/teams/${w.teamId}/games/${gameId}/live`);
    redirect(`/teams/${w.teamId}/games/${gameId}/live`);
  }
  revalidatePath(`/run/${auth.token}`, "layout");
  return { success: true };
}

// ─── saveBasketballLineupDraft ───────────────────────────────
// The pre-game draft, in the sport-agnostic game_lineup_drafts table.
export async function saveBasketballLineupDraft(
  auth: LiveAuth,
  gameId: string,
  lineup: BasketballLineup,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };
  await basketballTeam(w.teamId);

  const { data: gameRow } = await w.supabase
    .from("games")
    .select("on_field_size, sub_interval_seconds")
    .eq("id", gameId)
    .maybeSingle();
  const row = gameRow as { on_field_size?: number; sub_interval_seconds?: number } | null;

  const { error } = await w.supabase.from("game_lineup_drafts").upsert(
    {
      game_id: gameId,
      lineup: normalizeBasketballLineup(lineup),
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

// ─── startBasketballPeriod / endBasketballPeriod ─────────────
// `quarter` is the period (a half, or a quarter when the team plays
// them): basketball reuses the period events every sport writes.
export async function startBasketballPeriod(
  auth: LiveAuth,
  gameId: string,
  quarter: number,
  idempotencyKey?: string,
): Promise<ActionResult> {
  const result = await insertEvent(auth, gameId, "quarter_start", { metadata: { quarter } }, idempotencyKey, {
    kind: "period_start",
    period: quarter,
  });
  if (!result.success) return result;
  return revalidateAfterMutation(auth, gameId);
}

export async function endBasketballPeriod(
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
    { kind: "period_end", period: quarter },
  );
  if (!result.success) return result;
  return revalidateAfterMutation(auth, gameId);
}

// ─── finaliseBasketballGame ──────────────────────────────────
// game_finalised, then the game is completed and its season time rolled
// up (stats and season balance).
export async function finaliseBasketballGame(
  auth: LiveAuth,
  gameId: string,
  elapsedMs: number,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };
  const { ageCfg } = await basketballTeam(w.teamId);

  // Both phones tapping Finish: the second finds it done.
  if ((await checkPeriodWrite(w.supabase, gameId, { kind: "finalise" }, "quarter")).kind === "duplicate") {
    revalidateLivePage(auth, w.teamId, gameId);
    return { success: true };
  }

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

// ─── recordBasketballLineupSet ───────────────────────────────
// The whole lineup at once: the break plan just before the next period
// starts, or a reshuffle mid-period (with `at`).
export async function recordBasketballLineupSet(
  auth: LiveAuth,
  gameId: string,
  lineup: BasketballLineup,
  at: { quarter: number; elapsed_ms: number } | undefined,
  idempotencyKey?: string,
): Promise<ActionResult> {
  return insertEvent(
    auth,
    gameId,
    "lineup_set",
    { metadata: { lineup: normalizeBasketballLineup(lineup), ...(at ?? {}) } },
    idempotencyKey,
    lineupWrite(at),
  );
}

const lineOrUndefined = (v: unknown): BasketballLine | undefined =>
  typeof v === "string" && (BASKETBALL_LINES as readonly string[]).includes(v) ? (v as BasketballLine) : undefined;

// ─── recordBasketballSwap ────────────────────────────────────
// A sub at a dead ball: the kid coming on takes the line (and position)
// of the kid going off. `line` names the spot when the kid going off has
// already left (fouled out, hurt, sat out).
export async function recordBasketballSwap(
  auth: LiveAuth,
  gameId: string,
  input: {
    off_player_id: string | null;
    on_player_id: string;
    line?: BasketballLine;
    quarter: number;
    elapsed_ms: number;
  },
  idempotencyKey?: string,
): Promise<ActionResult> {
  const line = lineOrUndefined(input.line);
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

// ─── recordBasketballMove ────────────────────────────────────
// Two kids on court swap places (lines and positions), or one kid moves
// to the other line ("Move to guards").
export async function recordBasketballMove(
  auth: LiveAuth,
  gameId: string,
  input: {
    player_a_id: string;
    zone_a: BasketballLine;
    player_b_id?: string | null;
    zone_b: BasketballLine;
    quarter: number;
    elapsed_ms: number;
  },
  idempotencyKey?: string,
): Promise<ActionResult> {
  const zoneA = lineOrUndefined(input.zone_a);
  const zoneB = lineOrUndefined(input.zone_b);
  if (!zoneA || !zoneB) return { success: false, error: "That isn't a spot on a basketball court." };
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

// ─── Baskets ─────────────────────────────────────────────────
// 1, 2 or 3 points, for either side. player_id is our scorer, or null
// when the coach didn't say who. The event types are scoreEvents.ts's,
// which the live screen's optimistic baskets use too.
const SCORE_TYPES = Array.from(BASKETBALL_SCORE_EVENT_TYPES);

export async function recordBasketballScore(
  auth: LiveAuth,
  gameId: string,
  input: { side: "ours" | "theirs"; points: 1 | 2 | 3; player_id: string | null; quarter: number; elapsed_ms: number },
  idempotencyKey?: string,
): Promise<ActionResult> {
  if (![1, 2, 3].includes(input.points)) return { success: false, error: "A basket is 1, 2 or 3 points." };
  const type = basketballScoreEventType(input.side, input.points);
  const result = await insertEvent(
    auth,
    gameId,
    type,
    {
      player_id: input.side === "ours" ? input.player_id : null,
      metadata: { quarter: input.quarter, elapsed_ms: input.elapsed_ms },
    },
    idempotencyKey,
  );
  if (!result.success) return result;
  return revalidateAfterMutation(auth, gameId);
}

// Takes back the score this phone's undo strip named (`target`: its
// event id, or its write's key while it's still on the way), and only
// that one: with two phones scoring, "the latest" may be the other
// phone's (UX round 2). Already taken back on the other phone: say so,
// write nothing. An undo with no target (queued by an older client)
// takes back the latest still standing, as before.
export async function undoBasketballScore(
  auth: LiveAuth,
  gameId: string,
  target: UndoTargetRef | null,
  idempotencyKey?: string,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  const { ref, key } = undoArgs(target, idempotencyKey);
  const rows = await scoreRowsOf(w.supabase, gameId, BASKETBALL_SCORE_EVENT_TYPES);
  const found = resolveUndoTarget(rows, BASKETBALL_SCORE_EVENT_TYPES, ref, { ownKey: key });
  if (found.kind === "gone") return staleRefusal(auth, w.teamId, gameId, found.message);
  // Nothing standing: nothing to take back (and a retry won't change that).
  if (found.kind !== "target") return { success: true };
  const t = found.target;

  const result = await insertEvent(
    auth,
    gameId,
    "score_undo",
    {
      player_id: t.player_id ?? null,
      metadata: {
        target_event_id: t.id,
        original_type: t.type,
        quarter: (t.metadata as { quarter?: number } | null)?.quarter,
      },
    },
    key,
  );
  if (!result.success) return result;
  return revalidateAfterMutation(auth, gameId);
}

// ─── recordBasketballFoul ────────────────────────────────────
// The coach's copy of the table's count: one foul on one of ours, or
// (undo) one taken back. The 5th personal foul is followed by the
// shared markInjury with reason "fouled_out".
export async function recordBasketballFoul(
  auth: LiveAuth,
  gameId: string,
  input: { player_id: string; kind?: BasketballFoulKind; undo?: boolean; quarter: number; elapsed_ms: number },
  idempotencyKey?: string,
): Promise<ActionResult> {
  const kind: BasketballFoulKind =
    input.kind === "technical" || input.kind === "unsportsmanlike" ? input.kind : "personal";
  const result = await insertEvent(
    auth,
    gameId,
    "foul",
    {
      player_id: input.player_id,
      metadata: { kind, ...(input.undo ? { undo: true } : {}), quarter: input.quarter, elapsed_ms: input.elapsed_ms },
    },
    idempotencyKey,
  );
  if (!result.success) return result;
  return revalidateAfterMutation(auth, gameId);
}

// ─── recordBasketballSitOut ──────────────────────────────────
// A timed sit-out (the 5-minute sin bin): the kid goes to the bench and
// can't come back on until `duration_ms` of clock time has run. A zero
// duration ends one early.
export async function recordBasketballSitOut(
  auth: LiveAuth,
  gameId: string,
  input: { player_id: string; duration_ms: number; quarter: number; elapsed_ms: number },
  idempotencyKey?: string,
): Promise<ActionResult> {
  const duration = Math.max(0, Math.min(20 * 60_000, Math.round(input.duration_ms)));
  const result = await insertEvent(
    auth,
    gameId,
    "sit_out",
    {
      player_id: input.player_id,
      metadata: { duration_ms: duration, quarter: input.quarter, elapsed_ms: input.elapsed_ms },
    },
    idempotencyKey,
  );
  if (!result.success) return result;
  return revalidateAfterMutation(auth, gameId);
}
