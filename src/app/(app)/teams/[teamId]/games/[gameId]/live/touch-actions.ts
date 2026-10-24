"use server";

// ─── Touch family live-game server actions ───────────────────
// Touch football and Oztag, parallel to basketball-actions.ts and
// soccer-actions.ts. The shapes it writes are the ones
// src/lib/sports/touch/replay.ts reads (migration 0071):
//   lineup_set       { lineup: TouchLineup, quarter?, elapsed_ms? }
//   quarter_start    { quarter }       (the half, or the one period)
//   quarter_end      { quarter, elapsed_ms }
//   swap             { off_player_id, on_player_id, line?, quarter, elapsed_ms }
//   field_zone_swap  { player_a_id, zone_a, player_b_id?, zone_b, quarter, elapsed_ms }
//   try / girls_try and opponent_try / opponent_girls_try, score_undo
//   roster_shrink    { on_field_size, quarter, elapsed_ms }
//   game_finalised
// Injuries, loans, late arrivals and holds go through the shared
// actions in live/actions.ts, as the other sports' do.
//
// Auth, write queue and idempotency match the other sports. Every event
// is stamped with the team's own sport (touch or oztag), and every rule
// is read from the team's own age group in its own sport. Whether a try
// is a girl's try is decided here, from the scorer's group and the
// team's rule, so a client can't score one the team doesn't play.

import { cache } from "react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, getMembership } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSportConfig, isTouch, teamSport, type TouchSport } from "@/lib/sports/registry";
import { touchAgeGroupForTeam } from "@/lib/sports/touch/family";
import { countMixedGroups, girlsTryCountsDouble, mixedFieldPlan, teamMixedRule } from "@/lib/sports/touch/mixed";
import { readValidatedUserId } from "@/lib/auth/userIdHeader";
import { invalidateSeasonEvents } from "@/lib/season";
import { reconcileLineupToAvailability } from "@/lib/live/reconcileLineupToAvailability";
import { checkPeriodWrite, periodWordOf, revalidateLivePage, scoreRowsOf, staleRefusal } from "@/lib/live/liveWriteGuard";
import { lineupWrite, type PeriodWrite } from "@/lib/live/periodGuard";
import { resolveUndoTarget, undoArgs, type UndoTargetRef } from "@/lib/live/undoTarget";
import type { ActionResult, LiveAuth, MixedGroup } from "@/lib/types";
import { normalizeTouchLineup, touchOnField, validateTouchLineup, type TouchLineup } from "@/lib/sports/touch/lineup";
import { TOUCH_LINES, type MixedRule, type TouchAgeGroupConfig, type TouchLine } from "@/lib/sports/touch/types";
import { TOUCH_SCORE_EVENTS } from "@/lib/sports/touch/replay";
import { isGirlsTry, touchTryEventType } from "@/lib/sports/touch/scoreEvents";
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

interface TouchTeam {
  sport: TouchSport;
  ageCfg: TouchAgeGroupConfig;
  /** The team's mixed rule, or null when it isn't a mixed team. */
  mixed: MixedRule | null;
  /** A girl's try counts 2 (Oztag mixed, unless the team turned it off). */
  girlsTryDouble: boolean;
}

/**
 * The team's sport, age group as it plays it, and mixed rule. A team of
 * another sport is an error, never a fallback. Read past RLS (a team's
 * sport and rules aren't secret, and resolveWriter has already checked
 * the writer). Cached for the request.
 */
const touchTeam = cache(async (teamId: string): Promise<TouchTeam> => {
  const { data } = await createAdminClient()
    .from("teams")
    .select("sport, age_group, period_count, mixed_max_boys, mixed_min_girls, mixed_min_boys, girls_try_double")
    .eq("id", teamId)
    .maybeSingle();
  const row = data as {
    sport?: string | null;
    age_group?: string | null;
    period_count?: number | null;
    mixed_max_boys?: number | null;
    mixed_min_girls?: number | null;
    mixed_min_boys?: number | null;
    girls_try_double?: boolean | null;
  } | null;
  const sport = teamSport(row?.sport);
  if (!isTouch(sport)) throw new Error(`Team ${teamId} plays ${sport}, not touch or Oztag.`);
  const ageCfg = touchAgeGroupForTeam(sport, row?.age_group ?? null, row?.period_count ?? null);
  const mixed = teamMixedRule(row);
  return { sport, ageCfg, mixed, girlsTryDouble: girlsTryCountsDouble(ageCfg, mixed, row?.girls_try_double) };
});

/** Who each kid at the game counts as under the mixed rule: the squad and the game's fill-ins. */
async function gameMixedGroups(supabase: SupabaseClient, teamId: string, gameId: string): Promise<Map<string, MixedGroup>> {
  const [{ data: players }, { data: fillIns }] = await Promise.all([
    supabase.from("players").select("id, mixed_group").eq("team_id", teamId),
    supabase.from("game_fill_ins").select("id, mixed_group").eq("game_id", gameId),
  ]);
  const out = new Map<string, MixedGroup>();
  for (const r of [...(players ?? []), ...(fillIns ?? [])] as { id: string; mixed_group?: MixedGroup | null }[]) {
    if (r.mixed_group === "girl" || r.mixed_group === "boy") out.set(r.id, r.mixed_group);
  }
  return out;
}

// The team's period word ("quarter", "half"), for a refusal's wording.
async function periodWordFor(teamId: string) {
  const { sport, ageCfg } = await touchTeam(teamId);
  return periodWordOf(ageCfg.periodLabel ?? getSportConfig(sport).periodLabel);
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
  const { sport } = await touchTeam(w.teamId);

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

// ─── startTouchGame ──────────────────────────────────────────
// The starting lineup, and the game goes in progress. With
// `startPeriodToo` the first period's quarter_start lands in the same
// call. The lineup is checked against the team's own age group at the
// game's size and, on a mixed team, the team's rule: a lineup that
// breaks it is refused before anything is written. A mixed team short
// of girls starts on the field its rule allows (a roster_shrink).
export async function startTouchGame(
  auth: LiveAuth,
  gameId: string,
  rawLineup: TouchLineup,
  onFieldSize: number,
  startPeriodToo: boolean = false,
  subIntervalSeconds?: number | null,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };
  // A second phone's picker, still open after the first kicked off.
  const kickoff = await checkPeriodWrite(w.supabase, gameId, { kind: "kickoff" }, await periodWordFor(w.teamId));
  if (kickoff.kind !== "ok") return staleRefusal(auth, w.teamId, gameId, kickoff.kind === "stale" ? kickoff.message : "This game has already started.");
  const { sport, ageCfg, mixed } = await touchTeam(w.teamId);

  const size = Math.max(ageCfg.minOnFieldSize, Math.min(ageCfg.maxOnFieldSize, Math.floor(onFieldSize)));
  const lineup = normalizeTouchLineup(await reconcileLineupToAvailability(w.supabase, gameId, rawLineup));
  const groups = mixed ? await gameMixedGroups(w.supabase, w.teamId, gameId) : null;
  const check = validateTouchLineup(lineup, ageCfg, size, mixed && groups ? { rule: mixed, groupOf: (id) => groups.get(id) } : null);
  const firstError = check.issues.find((i) => i.kind === "error");
  if (firstError) return { success: false, error: firstError.message };

  const { error: insertError } = await w.supabase.from("game_events").insert({
    game_id: gameId,
    type: "lineup_set",
    metadata: { lineup, sport },
    created_by: w.userId,
  });
  if (insertError) return { success: false, error: insertError.message };

  // Short of girls: the field the rule allows, from everyone here.
  if (mixed && groups) {
    const here = [...touchOnField(lineup), ...lineup.bench];
    const plan = mixedFieldPlan(mixed, size, countMixedGroups(here, (id) => groups.get(id)));
    if (plan.short) {
      const { error: shrinkError } = await w.supabase.from("game_events").insert({
        game_id: gameId,
        type: "roster_shrink",
        metadata: { on_field_size: plan.size, quarter: 0, elapsed_ms: 0, sport },
        created_by: w.userId,
      });
      if (shrinkError) return { success: false, error: shrinkError.message };
    }
  }

  if (startPeriodToo) {
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
    // How we play at the start (UX plan 3.7).
    playbook_snapshot: await kickoffSnapshot(w.supabase, w.teamId),
  };
  if (subIntervalSeconds != null) {
    gameUpdate.sub_interval_seconds = Math.round(Math.min(10 * 60, Math.max(60, subIntervalSeconds)));
  }
  await w.supabase.from("games").update(gameUpdate).eq("id", gameId);

  // The start retires the pre-game draft, as for every sport.
  await w.supabase.from("game_lineup_drafts").delete().eq("game_id", gameId);
  invalidateSeasonEvents(w.teamId);

  if (auth.kind === "team") {
    revalidatePath(`/teams/${w.teamId}/games/${gameId}/live`);
    redirect(`/teams/${w.teamId}/games/${gameId}/live`);
  }
  revalidatePath(`/run/${auth.token}`, "layout");
  return { success: true };
}

// ─── saveTouchLineupDraft ────────────────────────────────────
// The pre-game draft, in the sport-agnostic game_lineup_drafts table.
export async function saveTouchLineupDraft(auth: LiveAuth, gameId: string, lineup: TouchLineup): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };
  await touchTeam(w.teamId);

  const { data: gameRow } = await w.supabase
    .from("games")
    .select("on_field_size, sub_interval_seconds")
    .eq("id", gameId)
    .maybeSingle();
  const row = gameRow as { on_field_size?: number; sub_interval_seconds?: number } | null;

  const { error } = await w.supabase.from("game_lineup_drafts").upsert(
    {
      game_id: gameId,
      lineup: normalizeTouchLineup(lineup),
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

// ─── startTouchPeriod / endTouchPeriod ───────────────────────
// `quarter` is the period (a half, or the one period): the touch family
// reuses the period events every sport writes.
export async function startTouchPeriod(
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

export async function endTouchPeriod(
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

// ─── finaliseTouchGame ───────────────────────────────────────
// game_finalised, then the game is completed and its season time rolled
// up (stats and season balance).
export async function finaliseTouchGame(auth: LiveAuth, gameId: string, elapsedMs: number): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };
  const { ageCfg } = await touchTeam(w.teamId);

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

// ─── recordTouchLineupSet ────────────────────────────────────
// The whole lineup at once: the half-time plan just before the next half
// starts, or a reshuffle mid-half (with `at`).
export async function recordTouchLineupSet(
  auth: LiveAuth,
  gameId: string,
  lineup: TouchLineup,
  at: { quarter: number; elapsed_ms: number } | undefined,
  idempotencyKey?: string,
): Promise<ActionResult> {
  return insertEvent(
    auth,
    gameId,
    "lineup_set",
    { metadata: { lineup: normalizeTouchLineup(lineup), ...(at ?? {}) } },
    idempotencyKey,
    lineupWrite(at),
  );
}

const lineOrUndefined = (v: unknown): TouchLine | undefined =>
  typeof v === "string" && (TOUCH_LINES as readonly string[]).includes(v) ? (v as TouchLine) : undefined;

// ─── recordTouchSwap ─────────────────────────────────────────
// A rolling sub: the kid coming on takes the lane of the kid going off.
// `line` names the spot when the kid going off has already left (hurt,
// lent), or an empty place.
export async function recordTouchSwap(
  auth: LiveAuth,
  gameId: string,
  input: {
    off_player_id: string | null;
    on_player_id: string;
    line?: TouchLine;
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

// ─── recordTouchMove ─────────────────────────────────────────
// Two kids on the field swap lanes, or one kid moves to another lane
// ("Move to wing").
export async function recordTouchMove(
  auth: LiveAuth,
  gameId: string,
  input: {
    player_a_id: string;
    zone_a: TouchLine;
    player_b_id?: string | null;
    zone_b: TouchLine;
    quarter: number;
    elapsed_ms: number;
  },
  idempotencyKey?: string,
): Promise<ActionResult> {
  const zoneA = lineOrUndefined(input.zone_a);
  const zoneB = lineOrUndefined(input.zone_b);
  if (!zoneA || !zoneB) return { success: false, error: "That isn't a lane on the field." };
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

// ─── recordTouchScore ────────────────────────────────────────
// A try, for either side. player_id is our scorer, or null when the
// coach didn't say who. On a team whose girl's try counts 2 (Oztag
// mixed), ours is a girl's try when the scorer counts as a girl (or,
// with no scorer, when the coach says so: `girl`), and theirs when the
// coach taps "+2 (girl)".
export async function recordTouchScore(
  auth: LiveAuth,
  gameId: string,
  input: { side: "ours" | "theirs"; player_id: string | null; girl?: boolean; quarter: number; elapsed_ms: number },
  idempotencyKey?: string,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };
  const { girlsTryDouble } = await touchTeam(w.teamId);
  // The live screen decides the same way for its optimistic try (scoreEvents.ts).
  const groups =
    girlsTryDouble && input.side === "ours" && input.player_id ? await gameMixedGroups(w.supabase, w.teamId, gameId) : null;
  const girl = isGirlsTry({
    girlsTryDouble,
    side: input.side,
    playerId: input.player_id,
    girl: input.girl,
    groupOf: (id) => groups?.get(id),
  });
  const type = touchTryEventType(input.side, girl);
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

const TOUCH_UNDO_TYPES: ReadonlySet<string> = new Set(TOUCH_SCORE_EVENTS);

// Takes back the score this phone's undo strip named (`target`: its
// event id, or its write's key while it's still on the way), and only
// that one: with two phones scoring, "the latest" may be the other
// phone's (UX round 2). Already taken back on the other phone: say so,
// write nothing. An undo with no target (queued by an older client)
// takes back the latest still standing, as before.
export async function undoTouchScore(
  auth: LiveAuth,
  gameId: string,
  target: UndoTargetRef | null,
  idempotencyKey?: string,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  const { ref, key } = undoArgs(target, idempotencyKey);
  const rows = await scoreRowsOf(w.supabase, gameId, TOUCH_UNDO_TYPES);
  const found = resolveUndoTarget(rows, TOUCH_UNDO_TYPES, ref, { ownKey: key });
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

// ─── recordTouchFieldSize ────────────────────────────────────
// The field's size from now (roster_shrink): a mixed team short of girls
// plays the field its rule allows, and back up when a girl returns. It
// never goes above the game's own size.
export async function recordTouchFieldSize(
  auth: LiveAuth,
  gameId: string,
  input: { on_field_size: number; quarter: number; elapsed_ms: number },
  idempotencyKey?: string,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };
  const { ageCfg } = await touchTeam(w.teamId);
  const size = Math.max(1, Math.min(ageCfg.maxOnFieldSize, Math.floor(input.on_field_size)));
  const result = await insertEvent(
    auth,
    gameId,
    "roster_shrink",
    { metadata: { on_field_size: size, quarter: input.quarter, elapsed_ms: input.elapsed_ms } },
    idempotencyKey,
  );
  if (!result.success) return result;
  return revalidateAfterMutation(auth, gameId);
}

// ─── setTouchMixedGroup ──────────────────────────────────────
// Who a kid counts as under the team's mixed rule, asked at the lineup
// when a kid on a mixed team has no group yet (one tap: Girl or Boy).
// A squad kid's is players.mixed_group; a fill-in's is the game's
// game_fill_ins.mixed_group. Only a mixed team asks.
export async function setTouchMixedGroup(
  auth: LiveAuth,
  gameId: string,
  playerId: string,
  group: MixedGroup,
): Promise<ActionResult> {
  if (group !== "girl" && group !== "boy") return { success: false, error: "A kid counts as a girl or a boy." };
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };
  const { mixed } = await touchTeam(w.teamId);
  if (!mixed) return { success: false, error: "Only a mixed team asks who counts as a girl or a boy." };

  // Past RLS: players are the admins' to edit, but a game manager (or a
  // run link) running the lineup is allowed to answer this one question,
  // and resolveWriter has checked them. Scoped to this team and game.
  const admin = createAdminClient();
  const { data: squadRow, error } = await admin
    .from("players")
    .update({ mixed_group: group })
    .eq("id", playerId)
    .eq("team_id", w.teamId)
    .select("id");
  if (error) return { success: false, error: error.message };
  if (!squadRow || squadRow.length === 0) {
    const { error: fillInError } = await admin
      .from("game_fill_ins")
      .update({ mixed_group: group })
      .eq("id", playerId)
      .eq("game_id", gameId);
    if (fillInError) return { success: false, error: fillInError.message };
  }
  if (auth.kind === "team") {
    revalidatePath(`/teams/${w.teamId}/games/${gameId}/live`);
    revalidatePath(`/teams/${w.teamId}/squad`);
  } else {
    revalidatePath(`/run/${auth.token}`, "layout");
  }
  return { success: true };
}
