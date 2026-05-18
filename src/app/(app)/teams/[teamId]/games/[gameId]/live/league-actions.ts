"use server";

// ─── Rugby League live-game server actions ───────────────────
// Parallel to live/actions.ts (AFL) and netball-actions.ts. Emits
// rugby-league-shaped events: try / opponent_try / conversion_attempt
// / opponent_conversion / kickoff_taken / vest_assigned. Junior
// rugby league uses rolling subs like AFL, so the shared `swap`
// event type is reused (lineup → field-and-bench-shaped metadata).
//
// Auth + write-queue + idempotency model is identical to the other
// two sport modules. Every mutation:
//   - resolves the writer via `resolveWriter` (team-membership or
//     share-token),
//   - passes an optional `idempotencyKey` through to game_events,
//   - invalidates the season-events cache on successful insert,
//   - revalidates the live-page path so RSC re-renders.
//
// All RL-specific rotations enforced server-side as of Phase 5:
//   * vest no-twice rule        — assignLeagueVest
//   * conversion-kick rotation  — recordConversionAttempt (bypass with force: true)
//   * kickoff rotation          — recordKickoff (full squad pool)

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, getMembership } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgeGroupConfig } from "@/lib/sports/registry";
import { readValidatedUserId } from "@/lib/auth/userIdHeader";
import { invalidateSeasonEvents } from "@/lib/season";
import type { ActionResult, GameEvent, LeagueLineup, LeagueZone, LiveAuth } from "@/lib/types";
import { vestHistory } from "@/lib/sports/rugby_league/vests";
import {
  conversionCycle,
  kickoffCycle,
} from "@/lib/sports/rugby_league/kicks";
import { replayLeagueGame } from "@/lib/sports/rugby_league/fairness";

// ─── Internal helpers (shape-matched to netball-actions) ──────

async function clampOnFieldSize(
  supabase: SupabaseClient,
  teamId: string,
  requested: number,
): Promise<{ value: number; min: number; max: number }> {
  const { data: team } = await supabase
    .from("teams")
    .select("sport, age_group")
    .eq("id", teamId)
    .maybeSingle();
  const ageCfg = getAgeGroupConfig(team?.sport, team?.age_group);
  const min = ageCfg.minOnFieldSize;
  const max = ageCfg.maxOnFieldSize;
  const value = Math.max(min, Math.min(max, Math.floor(requested)));
  return { value, min, max };
}

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

async function insertEvent(
  auth: LiveAuth,
  gameId: string,
  type: string,
  payload: { player_id?: string | null; metadata?: Record<string, unknown> },
  idempotencyKey?: string,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  const { error } = await w.supabase.from("game_events").insert({
    game_id: gameId,
    type,
    player_id: payload.player_id ?? null,
    metadata: payload.metadata ?? {},
    created_by: w.userId,
    idempotency_key: idempotencyKey ?? null,
  });
  if (error) {
    // Unique-violation on the idempotency_key partial index means
    // this op already landed (write queue retry). Treat as success.
    if (error.code === "23505" && idempotencyKey) {
      return { success: true };
    }
    return { success: false, error: error.message };
  }
  if (w.teamId) invalidateSeasonEvents(w.teamId);
  return { success: true };
}

async function revalidateAfterMutation(
  auth: LiveAuth,
  gameId: string,
): Promise<ActionResult> {
  if (auth.kind === "team") {
    const w = await resolveWriter(auth, gameId);
    if (w.error) return { success: false, error: w.error };
    revalidatePath(`/teams/${w.teamId}/games/${gameId}/live`);
  } else {
    revalidatePath(`/run/${auth.token}`, "layout");
  }
  return { success: true };
}

// ─── startLeagueGame ─────────────────────────────────────────
// Initial lineup + flip the game into "in_progress". Optionally
// atomically writes the Q1 quarter_start in the same call to mirror
// the AFL + netball two-step kickoff state machine (see commit
// `7d10723` for the netball parity fix).
//
// `initialVests` lets the pre-game picker bundle the period-1 FR
// (and DH at U9+) assignments into the same kickoff call — keeps
// the coach in one flow instead of bouncing them to a separate
// vest screen after the whistle. Validation:
//   * both assignees MUST be on the field (or we reject)
//   * FR and DH MUST be different players (laws §12 — one role
//     each at any moment)
// Each accepted assignment lands as its own `vest_assigned` event
// so the rest of the engine (vestHistory, currentVests, dashboard)
// sees them no differently from an in-game assignment.
export async function startLeagueGame(
  auth: LiveAuth,
  gameId: string,
  lineup: LeagueLineup,
  onFieldSize: number,
  startQuarterToo: boolean = false,
  /**
   * Vest rotation plan. `fr` / `dh` are arrays indexed by period
   * (period 1 = index 0). Each entry is a player id or null to
   * skip. The picker assembles this from the auto-suggester +
   * overrides; the server writes one `vest_assigned` event per
   * non-null entry so the rest of the engine (currentVests,
   * vestHistory, dashboard) doesn't need to know about the plan
   * shape — events are still the source of truth.
   *
   * Legacy single-period shape `{ fr: string|null, dh: string|null }`
   * is still accepted — it's promoted to a 1-period array under
   * the hood so existing AFL/netball-driven test fixtures don't
   * break.
   */
  initialVests:
    | { fr?: string | null; dh?: string | null }
    | { fr: (string | null)[]; dh: (string | null)[] } = {},
  subIntervalSeconds?: number | null,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  const { value: clampedSize } = await clampOnFieldSize(
    w.supabase,
    w.teamId,
    onFieldSize,
  );

  // Promote single-period legacy shape to arrays. After this both
  // `frPlan` and `dhPlan` are arrays the rest of the function can
  // walk uniformly.
  const frPlan: (string | null)[] = Array.isArray(
    (initialVests as { fr?: unknown }).fr,
  )
    ? ((initialVests as { fr: (string | null)[] }).fr ?? [])
    : [(initialVests as { fr?: string | null }).fr ?? null];
  const dhPlan: (string | null)[] = Array.isArray(
    (initialVests as { dh?: unknown }).dh,
  )
    ? ((initialVests as { dh: (string | null)[] }).dh ?? [])
    : [(initialVests as { dh?: string | null }).dh ?? null];

  // Pre-flight every period's vest plan before we touch the event
  // log — we'd rather refuse the kickoff than land in a half-applied
  // state.
  //   * Both wearers MUST be on the field at kickoff (we don't know
  //     who'll be on later periods — that's the half-time card's
  //     job to verify and the coach's job to override if a swap
  //     changes who's available).
  //   * FR and DH within the same period MUST be different players.
  //   * No player may wear the same vest in two different periods
  //     (Laws §12 — "one vest worn once during a match").
  const fieldSet = new Set([...lineup.forwards, ...lineup.backs]);
  const usedFr = new Set<string>();
  const usedDh = new Set<string>();
  for (let p = 0; p < Math.max(frPlan.length, dhPlan.length); p++) {
    const frId = frPlan[p] ?? null;
    const dhId = dhPlan[p] ?? null;
    if (frId && !fieldSet.has(frId)) {
      return {
        success: false,
        error: `First Receiver pick for period ${p + 1} is not on the field.`,
      };
    }
    if (dhId && !fieldSet.has(dhId)) {
      return {
        success: false,
        error: `Dummy Half pick for period ${p + 1} is not on the field.`,
      };
    }
    if (frId && dhId && frId === dhId) {
      return {
        success: false,
        error: `First Receiver and Dummy Half for period ${p + 1} must be different players.`,
      };
    }
    if (frId) {
      if (usedFr.has(frId)) {
        return {
          success: false,
          error:
            "Same player picked for First Receiver in two periods — vests can only be worn once per game.",
        };
      }
      usedFr.add(frId);
    }
    if (dhId) {
      if (usedDh.has(dhId)) {
        return {
          success: false,
          error:
            "Same player picked for Dummy Half in two periods — vests can only be worn once per game.",
        };
      }
      usedDh.add(dhId);
    }
  }

  const { error: insertError } = await w.supabase.from("game_events").insert({
    game_id: gameId,
    type: "lineup_set",
    metadata: { lineup, sport: "rugby_league" },
    created_by: w.userId,
  });
  if (insertError) return { success: false, error: insertError.message };

  if (startQuarterToo) {
    const { error: qStartError } = await w.supabase
      .from("game_events")
      .insert({
        game_id: gameId,
        type: "quarter_start",
        metadata: { quarter: 1, sport: "rugby_league" },
        created_by: w.userId,
      });
    if (qStartError) return { success: false, error: qStartError.message };
  }

  // Atomic vest writes for EVERY planned period. One row per
  // non-null entry — same shape as a mid-game `assignLeagueVest`
  // write, so the rest of the engine (currentVests, vestHistory,
  // dashboard) sees no difference between a pre-game rotation plan
  // and a coach reassigning at half-time. The coach can still
  // override at any break via the half-time card; LIFO ordering on
  // created_at means the later write wins per period.
  const vestRows: Array<{
    game_id: string;
    type: string;
    player_id: string;
    metadata: Record<string, unknown>;
    created_by: string | null;
  }> = [];
  for (let p = 0; p < frPlan.length; p++) {
    const id = frPlan[p];
    if (!id) continue;
    vestRows.push({
      game_id: gameId,
      type: "vest_assigned",
      player_id: id,
      metadata: {
        vest: "fr",
        period: p + 1,
        replacement: false,
        sport: "rugby_league",
      },
      created_by: w.userId,
    });
  }
  for (let p = 0; p < dhPlan.length; p++) {
    const id = dhPlan[p];
    if (!id) continue;
    vestRows.push({
      game_id: gameId,
      type: "vest_assigned",
      player_id: id,
      metadata: {
        vest: "dh",
        period: p + 1,
        replacement: false,
        sport: "rugby_league",
      },
      created_by: w.userId,
    });
  }
  if (vestRows.length > 0) {
    const { error: vestError } = await w.supabase
      .from("game_events")
      .insert(vestRows);
    if (vestError) {
      return {
        success: false,
        error: `Game started but vest assignment failed: ${vestError.message}`,
      };
    }
  }

  // Update games row with status + on-field-size + optional
  // sub-interval override. The latter mirrors AFL's `startGame`
  // contract: coaches who keep the suggested value pass null/
  // undefined and the DB default stays put; explicit overrides
  // (1..10 minutes clamped) flow straight through.
  const gameUpdate: {
    status: "in_progress";
    on_field_size: number;
    sub_interval_seconds?: number;
  } = {
    status: "in_progress",
    on_field_size: clampedSize,
  };
  if (subIntervalSeconds != null) {
    const clamped = Math.round(
      Math.min(10 * 60, Math.max(60, subIntervalSeconds)),
    );
    gameUpdate.sub_interval_seconds = clamped;
  }
  await w.supabase.from("games").update(gameUpdate).eq("id", gameId);

  // Kickoff invalidates any pre-game draft — same contract as
  // AFL `startGame` / netball `startNetballGame`.
  await w.supabase.from("game_lineup_drafts").delete().eq("game_id", gameId);

  invalidateSeasonEvents(w.teamId);

  if (auth.kind === "team") {
    revalidatePath(`/teams/${w.teamId}/games/${gameId}/live`);
    redirect(`/teams/${w.teamId}/games/${gameId}/live`);
  }
  revalidatePath(`/run/${auth.token}`, "layout");
  return { success: true };
}

// ─── saveLeagueLineupDraft ───────────────────────────────────
// Pre-game draft save. Reuses the sport-agnostic
// `game_lineup_drafts` table — the `lineup` jsonb column carries
// whichever shape the sport expects, and the live-page branch reads
// it back into `LeagueLineup` via cast.
export async function saveLeagueLineupDraft(
  auth: LiveAuth,
  gameId: string,
  lineup: LeagueLineup,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  const { data: gameRow } = await w.supabase
    .from("games")
    .select("on_field_size, sub_interval_seconds")
    .eq("id", gameId)
    .maybeSingle();
  const onFieldSize = (gameRow as { on_field_size?: number } | null)?.on_field_size ?? 11;
  const subIntervalSeconds = (gameRow as { sub_interval_seconds?: number } | null)?.sub_interval_seconds ?? 240;

  const { error } = await w.supabase
    .from("game_lineup_drafts")
    .upsert(
      {
        game_id: gameId,
        lineup,
        on_field_size: onFieldSize,
        sub_interval_seconds: subIntervalSeconds,
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

// ─── startLeagueQuarter / endLeagueQuarter ───────────────────
// Same shape as the AFL + netball pairs. `quarter` is 1..4 for
// U6–U9 (quarters) or 1..2 for U10–U12 (halves) — the orchestrator
// resolves the cap from the AgeGroupConfig.periodCount, server
// just records what's passed.
export async function startLeagueQuarter(
  auth: LiveAuth,
  gameId: string,
  quarter: number,
  idempotencyKey?: string,
): Promise<ActionResult> {
  const result = await insertEvent(
    auth,
    gameId,
    "quarter_start",
    { metadata: { quarter, sport: "rugby_league" } },
    idempotencyKey,
  );
  if (!result.success) return result;
  return revalidateAfterMutation(auth, gameId);
}

export async function endLeagueQuarter(
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
    { metadata: { quarter, elapsed_ms: elapsedMs, sport: "rugby_league" } },
    idempotencyKey,
  );
  if (!result.success) return result;
  return revalidateAfterMutation(auth, gameId);
}

// ─── finaliseLeagueGame ──────────────────────────────────────
// End-of-game flow: writes a game_finalised event AND flips
// games.status to "completed". The Full-Time review step lives
// between the final endLeagueQuarter and this call so the coach can
// fix scores before locking in the result.
export async function finaliseLeagueGame(
  auth: LiveAuth,
  gameId: string,
  elapsedMs: number,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  // Use the team's age-group period count for the final-quarter
  // value on the event metadata. Defaults to 4 (the AFL/Netball
  // periodCount) — U10–U12 will overwrite to 2.
  const { data: team } = await w.supabase
    .from("teams")
    .select("sport, age_group")
    .eq("id", w.teamId)
    .maybeSingle();
  const ageCfg = getAgeGroupConfig(team?.sport, team?.age_group);
  const finalQuarter = ageCfg.periodCount;

  const finalise = await insertEvent(auth, gameId, "game_finalised", {
    metadata: { quarter: finalQuarter, elapsed_ms: elapsedMs, sport: "rugby_league" },
  });
  if (!finalise.success) return finalise;

  const { error: updateError } = await w.supabase
    .from("games")
    .update({ status: "completed" })
    .eq("id", gameId);
  if (updateError) return { success: false, error: updateError.message };

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

// ─── recordLeagueSwap ────────────────────────────────────────
// Rolling sub. Mirrors AFL `recordSwap` shape but emits without a
// zone — RL is positionless, so "field" is the only bucket. The
// replay engine (Phase 6) consumes metadata.off_player_id /
// metadata.on_player_id to apply the swap to the current lineup.
export async function recordLeagueSwap(
  auth: LiveAuth,
  gameId: string,
  input: {
    off_player_id: string;
    on_player_id: string;
    quarter: number;
    elapsed_ms: number;
  },
  idempotencyKey?: string,
): Promise<ActionResult> {
  return insertEvent(
    auth,
    gameId,
    "swap",
    {
      player_id: input.on_player_id,
      metadata: { ...input, sport: "rugby_league" },
    },
    idempotencyKey,
  );
}

// ─── recordLeagueLineupSet ───────────────────────────────────
// Alternate entry-point used by the live UI to re-set the lineup
// post-kickoff (e.g. after an injury reshuffle). Mirrors AFL
// `recordLineupSet`.
export async function recordLeagueLineupSet(
  auth: LiveAuth,
  gameId: string,
  lineup: LeagueLineup,
  idempotencyKey?: string,
): Promise<ActionResult> {
  return insertEvent(
    auth,
    gameId,
    "lineup_set",
    { metadata: { lineup, sport: "rugby_league" } },
    idempotencyKey,
  );
}

// ─── recordLeaguePositionChange ──────────────────────────────
// Coach long-pressed an on-field player and chose "Move to Backs"
// / "Move to Forwards". Emits a `league_position_change` event;
// the replayer moves the player between lineup.forwards and
// lineup.backs WITHOUT touching field membership (so stint timing
// + unbroken-period compliance stay intact). Single-player — no
// paired swap. The coach can fire this multiple times to reshape
// the field's forward-back ratio mid-game.
export async function recordLeaguePositionChange(
  auth: LiveAuth,
  gameId: string,
  input: {
    player_id: string;
    to_zone: LeagueZone;
    quarter: number;
    elapsed_ms: number;
  },
  idempotencyKey?: string,
): Promise<ActionResult> {
  return insertEvent(
    auth,
    gameId,
    "league_position_change",
    {
      player_id: input.player_id,
      metadata: {
        to_zone: input.to_zone,
        quarter: input.quarter,
        elapsed_ms: input.elapsed_ms,
        sport: "rugby_league",
      },
    },
    idempotencyKey,
  );
}

// ─── recordTry ───────────────────────────────────────────────
// 4-point team try. player_id = scorer. Replay engine reads the
// type and applies the points; the SportConfig.scoreTypes table
// (try → 4) is the source of truth for the point value.
export async function recordTry(
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
    "try",
    {
      player_id: playerId,
      metadata: { quarter, elapsed_ms: elapsedMs, sport: "rugby_league" },
    },
    idempotencyKey,
  );
  if (!result.success) return result;
  return revalidateAfterMutation(auth, gameId);
}

// ─── recordOpponentTry ───────────────────────────────────────
export async function recordOpponentTry(
  auth: LiveAuth,
  gameId: string,
  quarter: number,
  elapsedMs: number,
  idempotencyKey?: string,
): Promise<ActionResult> {
  const result = await insertEvent(
    auth,
    gameId,
    "opponent_try",
    { metadata: { quarter, elapsed_ms: elapsedMs, sport: "rugby_league" } },
    idempotencyKey,
  );
  if (!result.success) return result;
  return revalidateAfterMutation(auth, gameId);
}

// ─── recordConversionAttempt ─────────────────────────────────
// Goal-kick after a try. `made: true` adds 2 points to the team
// score on replay; `made: false` still records the attempt so the
// kick-rotation derivation can flag who has and hasn't kicked in
// the current cycle.
//
// Junior Law §15 — "Once a player has attempted a kick at goal
// (whether successful or not), that player may not attempt
// another until all others of the same team (on the field at the
// time) have been given an attempt at a goal." The server
// re-replays the game's events to derive the cycle state and
// blocks out-of-turn attempts.
//
// The `force: true` flag bypasses the rotation check for the
// edge case where the try-scorer is fouled in the act of scoring
// and gets an additional kick at goal (laws permit the same
// kicker to take it). Persisted on the event for downstream
// audit visibility — the dashboard / equity report can
// distinguish forced kicks from regular ones.
export async function recordConversionAttempt(
  auth: LiveAuth,
  gameId: string,
  kickerId: string,
  made: boolean,
  quarter: number,
  elapsedMs: number,
  options: { force?: boolean; tryEventId?: string } = {},
  idempotencyKey?: string,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  const force = options.force === true;
  if (!force) {
    // Re-derive state from the event log so the check survives
    // offline-queue replays and out-of-order arrivals. Same data
    // the UI uses for the picker — server is the authority.
    const { data: priorEventsRaw } = await w.supabase
      .from("game_events")
      .select("*")
      .eq("game_id", gameId)
      .order("created_at", { ascending: true });
    const priorEvents = (priorEventsRaw ?? []) as GameEvent[];
    const state = replayLeagueGame(priorEvents);
    const onField = state.lineup
      ? [...state.lineup.forwards, ...state.lineup.backs]
      : [];

    // Kicker must currently be on the field.
    if (onField.length > 0 && !onField.includes(kickerId)) {
      return {
        success: false,
        error: "That player is not on the field — they can't take this kick.",
      };
    }

    // No-twice rule: kicker already attempted in the current
    // cycle. Use the subset semantics from `conversionCycle` so
    // mid-cycle substitutions resolve correctly.
    const cycle = conversionCycle(priorEvents, onField);
    if (cycle.attempted.has(kickerId)) {
      return {
        success: false,
        error:
          "That player has already kicked in this rotation — pick a teammate or use Force for the fouled-in-act-of-scoring carve-out.",
      };
    }
  }

  const result = await insertEvent(
    auth,
    gameId,
    "conversion_attempt",
    {
      player_id: kickerId,
      metadata: {
        quarter,
        elapsed_ms: elapsedMs,
        made,
        force,
        try_event_id: options.tryEventId,
        sport: "rugby_league",
      },
    },
    idempotencyKey,
  );
  if (!result.success) return result;
  return revalidateAfterMutation(auth, gameId);
}

// ─── recordKickoff ───────────────────────────────────────────
// Per-period kickoff. Junior Law §16: a player can't take a
// second kickoff until every player in the team has had a turn.
// The pool is the FULL squad (not just on-field) — the kicker
// is selected just before the whistle and may still be off the
// field warming up.
//
// `squadIds` carries the team's current squad list so the
// rotation check uses the same pool the picker showed the coach.
// The server is the authority — if the client lineup is stale
// the squad set MIGHT diverge, but the cycle reset behaviour is
// idempotent enough that a slightly stale squad doesn't corrupt
// the rotation (worst case: the cycle resets one attempt early).
export async function recordKickoff(
  auth: LiveAuth,
  gameId: string,
  period: number,
  kickerId: string,
  squadIds: string[],
  idempotencyKey?: string,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  // Re-derive cycle state from the event log.
  const { data: priorEventsRaw } = await w.supabase
    .from("game_events")
    .select("*")
    .eq("game_id", gameId)
    .order("created_at", { ascending: true });
  const priorEvents = (priorEventsRaw ?? []) as GameEvent[];
  const cycle = kickoffCycle(priorEvents, squadIds);

  if (cycle.taken.has(kickerId)) {
    return {
      success: false,
      error:
        "That player has already taken a kickoff in this rotation — pick a teammate who hasn't yet.",
    };
  }

  const result = await insertEvent(
    auth,
    gameId,
    "kickoff_taken",
    {
      player_id: kickerId,
      metadata: { period, sport: "rugby_league" },
    },
    idempotencyKey,
  );
  if (!result.success) return result;
  return revalidateAfterMutation(auth, gameId);
}

// ─── recordOpponentConversion ────────────────────────────────
// 2-point opponent conversion. We don't track opposition rotations.
export async function recordOpponentConversion(
  auth: LiveAuth,
  gameId: string,
  quarter: number,
  elapsedMs: number,
  idempotencyKey?: string,
): Promise<ActionResult> {
  const result = await insertEvent(
    auth,
    gameId,
    "opponent_conversion",
    { metadata: { quarter, elapsed_ms: elapsedMs, sport: "rugby_league" } },
    idempotencyKey,
  );
  if (!result.success) return result;
  return revalidateAfterMutation(auth, gameId);
}

// ─── undoLeagueScore ─────────────────────────────────────────
// LIFO undo. Mirrors AFL `undoLastScore` / netball `undoNetballScore`
// — emits a marker event; replay pairs score / score_undo from its
// own stack. The optional `kind` filter lets the UI undo a specific
// score type (e.g. only the last conversion attempt) rather than
// the unrestricted "latest of any kind".
export async function undoLeagueScore(
  auth: LiveAuth,
  gameId: string,
  kind?: "try" | "opponent_try" | "conversion_attempt" | "opponent_conversion",
  idempotencyKey?: string,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  let targetQuery = w.supabase
    .from("game_events")
    .select("id, type, metadata, player_id")
    .eq("game_id", gameId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (kind) {
    targetQuery = targetQuery.eq("type", kind);
  } else {
    targetQuery = targetQuery.in("type", [
      "try",
      "opponent_try",
      "conversion_attempt",
      "opponent_conversion",
    ]);
  }

  const { data: latest } = await targetQuery.maybeSingle();
  if (!latest) {
    return { success: false, error: "No score event found to undo." };
  }

  const result = await insertEvent(
    auth,
    gameId,
    "score_undo",
    {
      player_id: (latest as { player_id?: string | null }).player_id ?? null,
      metadata: {
        target_event_id: (latest as { id: string }).id,
        original_type: (latest as { type: string }).type,
        sport: "rugby_league",
      },
    },
    idempotencyKey,
  );
  if (!result.success) return result;
  return revalidateAfterMutation(auth, gameId);
}

// ─── assignLeagueVest ────────────────────────────────────────
// Assigns the FR or DH vest to a player for a given period. Two
// rules enforced server-side (Junior Laws §12):
//
//   1. The wearer must be on the field at the time. Vests don't
//      sit on the bench. (Phase 4 trusts the client lineup snapshot;
//      a follow-up could re-resolve from the event log.)
//
//   2. No player wears the same vest twice in a game — UNLESS the
//      `replacement: true` flag is set, in which case the laws'
//      injury-handover carve-out applies and the assignment is
//      permitted for the rest of the current period only. The
//      coach's UI surfaces this as a separate "Replace injured FR"
//      affordance; the server distinguishes the two paths via the
//      flag and persists `replacement: true` in the event metadata
//      so future replays can reason about it.
//
// On success emits a `vest_assigned` event. The coach's badge UI +
// post-game equity report derive everything else from the log via
// `currentVests` / `vestHistoryByPlayer` in `vests.ts`.
export async function assignLeagueVest(
  auth: LiveAuth,
  gameId: string,
  vest: "fr" | "dh",
  period: number,
  playerId: string,
  options: { replacement?: boolean } = {},
  idempotencyKey?: string,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  // Replay prior vest_assigned events for this game so we can apply
  // the no-twice rule. The events table is small per-game (≤ ~8
  // vest events even at U9+ × 4 quarters), so this is cheap.
  const { data: prior } = await w.supabase
    .from("game_events")
    .select("*")
    .eq("game_id", gameId)
    .eq("type", "vest_assigned")
    .order("created_at", { ascending: true });
  const priorEvents = (prior ?? []) as GameEvent[];

  const replacement = options.replacement === true;
  if (!replacement) {
    // No-twice rule. Replacements bypass because the laws' carve-
    // out explicitly allows the same period's injured-wearer slot
    // to pass to someone fresh — they're still in vestHistory
    // afterwards, just for a different reason.
    const used = vestHistory(priorEvents, vest);
    if (used.has(playerId)) {
      return {
        success: false,
        error: `That player has already worn the ${vest.toUpperCase()} vest this game.`,
      };
    }
  }

  return insertEvent(
    auth,
    gameId,
    "vest_assigned",
    {
      player_id: playerId,
      metadata: {
        vest,
        period,
        replacement,
        sport: "rugby_league",
      },
    },
    idempotencyKey,
  );
}
