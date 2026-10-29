"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, getMembership } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateLiveGame } from "@/lib/games/updateLiveGame";
import { gameWriteError } from "@/lib/games/gameWriteError";
import { getAgeGroupConfig } from "@/lib/sports/registry";
import { readValidatedUserId } from "@/lib/auth/userIdHeader";
import { invalidateSeasonEvents } from "@/lib/season";
import { notifyGameStarted } from "@/lib/notifications/gameStarted";
import { reconcileLineupToAvailability } from "@/lib/live/reconcileLineupToAvailability";
import { isPlayerLock, type PlayerLock } from "@/lib/live/locks";
import { isClockPauseInput, type ClockPauseInput } from "@/lib/live/clockPause";
import { pairScoreUndos } from "@/lib/live/scoreUndo";
import { checkPeriodWrite, revalidateLivePage, scoreRowsOf, staleRefusal } from "@/lib/live/liveWriteGuard";
import type { PeriodWrite } from "@/lib/live/periodGuard";
import { resolveUndoTarget, undoArgs, type UndoTargetRef } from "@/lib/live/undoTarget";
import { kickoffSnapshot } from "@/lib/playbook/snapshot";
import { writeGameRollup } from "@/lib/playbook/rollupStore";
import type { ActionResult, LineupDraft, LiveAuth, Lineup, Zone } from "@/lib/types";

// Clamp a coach-supplied on-field size to the legal range for the
// team's sport + age group. Returns the clamped value alongside the
// resolved age-group config so callers can react if the caller asked
// for something outside the legal band (we silently coerce; the form
// shouldn't have offered an out-of-band option in the first place).
async function clampOnFieldSize(
  supabase: SupabaseClient,
  teamId: string,
  requested: number,
): Promise<{ value: number; min: number; max: number }> {
  // This module writes afl games only: clamp to that sport's
  // own age groups, never whatever another sport would allow.
  const { data: team } = await supabase
    .from("teams")
    .select("age_group")
    .eq("id", teamId)
    .maybeSingle();
  const ageCfg = getAgeGroupConfig("afl", team?.age_group);
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
  // Skip the second supabase.auth.getUser() round-trip — middleware
  // already validated the JWT and stashed the user id on the request
  // headers (lib/auth/userIdHeader.ts). Saves ~150-400ms per action
  // on 3G. If the header is absent it means middleware didn't run
  // (or the user isn't logged in) — treat as unauthenticated.
  const userId = readValidatedUserId();
  if (!userId) {
    return {
      supabase,
      userId: null,
      teamId: auth.teamId,
      error: "Unauthenticated.",
    };
  }
  // Cached lookup — if the page render or an earlier action in the
  // same request already queried membership, this hits the React
  // cache instead of a duplicate Supabase round-trip.
  const membership = await getMembership(auth.teamId, userId);
  if (
    !membership ||
    (membership.role !== "admin" && membership.role !== "game_manager")
  ) {
    return {
      supabase,
      userId,
      teamId: auth.teamId,
      error: "Not authorised.",
    };
  }
  return { supabase, userId, teamId: auth.teamId, error: null };
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
    const verdict = await checkPeriodWrite(w.supabase, gameId, guard, "quarter", idempotencyKey);
    if (verdict.kind === "stale") return staleRefusal(auth, w.teamId, gameId, verdict.message);
    if (verdict.kind === "duplicate") return { success: true };
  }

  const { error: insertError } = await w.supabase.from("game_events").insert({
    game_id: gameId,
    type,
    player_id: payload.player_id ?? null,
    metadata: payload.metadata ?? {},
    created_by: w.userId,
    idempotency_key: idempotencyKey ?? null,
  });
  if (insertError) {
    // Unique violation on idempotency_key means the client is
    // replaying an op that already landed (e.g. native write
    // queue retry after a flaky network). Treat as success — the
    // event is already in the log.
    if (insertError.code === "23505" && idempotencyKey) {
      return { success: true };
    }
    return { success: false, error: insertError.message };
  }
  // A new event landed — drop the season-events cache for this
  // team so the next page render re-fetches. revalidateTag is a
  // no-op when there's no cached entry, so it's cheap to fire
  // unconditionally.
  if (w.teamId) invalidateSeasonEvents(w.teamId);
  return { success: true };
}

export async function startGame(
  auth: LiveAuth,
  gameId: string,
  lineup: Lineup,
  subIntervalSeconds: number,
  onFieldSize: number,
  /**
   * When true, atomically writes a `quarter_start` event for Q1 in
   * the same call. Caller is responsible for setting this only when
   * the coach has confirmed kickoff (e.g. tapped "Start Q1" on the
   * StartQuarterModal). Defaults to false so existing call sites
   * — which expected a separate quarter_start write afterwards —
   * stay on the legacy two-step commit. Steve 2026-05-13: the
   * LineupPicker refactor moved both writes behind the modal Start
   * tap so "Back to lineup" can cleanly cancel without leaving the
   * lineup_set committed.
   */
  startQuarterToo: boolean = false,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };
  // A second phone's picker, still open after the first kicked off.
  const verdict = await checkPeriodWrite(w.supabase, gameId, { kind: "kickoff" }, "quarter");
  if (verdict.kind !== "ok") return staleRefusal(auth, w.teamId, gameId, verdict.kind === "stale" ? verdict.message : "This game has already started.");

  // Backstop the picker's dropdown — clamp to the team's sport+age
  // legal range so a stale or hand-crafted client request can't shove
  // an illegal size past validation.
  const { value: clampedSize } = await clampOnFieldSize(
    w.supabase,
    w.teamId,
    onFieldSize,
  );

  // B1 / AVAIL-01: availability is the source of truth at kickoff.
  // A stale draft may seed a now-unavailable player onto the field;
  // strip anyone not in the server-computed availableIds union before
  // committing the lineup_set. The vacated spot is left empty — the
  // normal rotation fills it (D-04, silent auto-remove, no prompt).
  const reconciledLineup = await reconcileLineupToAvailability(
    w.supabase,
    gameId,
    lineup,
  );

  const { error: insertError } = await w.supabase.from("game_events").insert({
    game_id: gameId,
    type: "lineup_set",
    metadata: { lineup: reconciledLineup },
    created_by: w.userId,
  });
  if (insertError) return { success: false, error: insertError.message };

  if (startQuarterToo) {
    // Write the quarter_start event in the same call so the
    // commit is atomic — either both write or neither does. With
    // this flag, the caller doesn't have to chain a separate
    // startQuarter() afterwards (which it couldn't anyway because
    // the redirect below would terminate the request).
    const { error: qStartError } = await w.supabase
      .from("game_events")
      .insert({
        game_id: gameId,
        type: "quarter_start",
        metadata: { quarter: 1 },
        created_by: w.userId,
      });
    if (qStartError) return { success: false, error: qStartError.message };
  }

  const { error: gameError } = await updateLiveGame(w.supabase, gameId, {
    status: "in_progress",
    sub_interval_seconds: subIntervalSeconds,
    on_field_size: clampedSize,
    // How we play at kickoff (UX plan 3.7).
    playbook_snapshot: await kickoffSnapshot(w.supabase, w.teamId),
  });
  if (gameError) return { success: false, error: gameWriteError(gameError) };

  // The lineup_set event is now the source of truth; any pre-game
  // draft is stale. Clean it up so the game card stops showing the
  // "Plan saved" indicator.
  await w.supabase.from("game_lineup_drafts").delete().eq("game_id", gameId);

  // Direct event inserts above bypass insertEvent — invalidate
  // the season-events cache explicitly so the next render sees
  // the new lineup_set / quarter_start rows.
  invalidateSeasonEvents(w.teamId);

  // Telegram ping on Q1 kickoff — fire-and-forget so a slow Telegram
  // API can't hold the redirect. Gated on `startQuarterToo` so we
  // only ping on the first quarter (Q2–Q4 use a separate path), and
  // we skip the demo team so exploration on /demo doesn't pollute
  // the signal. Steve uses this to count real game-starts each
  // weekend; one ping per game is the target. Must be awaited
  // before the `redirect()` below — redirect() throws NEXT_REDIRECT
  // and unwinds the function, so anything we want fired-and-
  // forgot has to be kicked off before that throw.
  if (startQuarterToo) {
    notifyGameStarted(w.supabase, w.teamId, gameId, w.userId).catch(() => {});
  }

  if (auth.kind === "team") {
    revalidatePath(`/teams/${w.teamId}/games/${gameId}`);
    revalidatePath(`/teams/${w.teamId}/games/${gameId}/live`);
    redirect(`/teams/${w.teamId}/games/${gameId}/live`);
  }
  revalidatePath(`/run/${auth.token}`, "layout");
  return { success: true };
}


// ─── Pre-game lineup draft ───────────────────────────────────
// Save / load the night-before plan. One row per game keyed by
// game_id. Auth: writes are admin/game_manager (resolveWriter
// already checks); reads return null if there's nothing saved.

export async function saveLineupDraft(
  auth: LiveAuth,
  gameId: string,
  lineup: Lineup,
  subIntervalSeconds: number,
  onFieldSize: number,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  const { value: clampedSize } = await clampOnFieldSize(
    w.supabase,
    w.teamId,
    onFieldSize,
  );

  const { error } = await w.supabase
    .from("game_lineup_drafts")
    .upsert(
      {
        game_id: gameId,
        lineup,
        on_field_size: clampedSize,
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

export async function getLineupDraft(
  auth: LiveAuth,
  gameId: string,
): Promise<ActionResult & { draft?: LineupDraft | null }> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  const { data, error } = await w.supabase
    .from("game_lineup_drafts")
    .select("*")
    .eq("game_id", gameId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  return { success: true, draft: (data as LineupDraft | null) ?? null };
}

// ─── setOnFieldSize ──────────────────────────────────────────
// Mid-game adjustment. When two teams agree to shorten / extend the
// field count between quarters (lent player, opposition short-handed,
// etc), the coach hits this from QuarterBreak. Updates the games row
// only — no event written; replayGame reads g.on_field_size directly.
// The next quarter's zoneCaps come from the new value.
export async function setOnFieldSize(
  auth: LiveAuth,
  gameId: string,
  nextSize: number,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  const { value, min, max } = await clampOnFieldSize(
    w.supabase,
    w.teamId,
    nextSize,
  );
  if (!Number.isFinite(nextSize)) {
    return { success: false, error: "Invalid size." };
  }
  if (Math.floor(nextSize) < min || Math.floor(nextSize) > max) {
    return {
      success: false,
      error: `On-field size must be between ${min} and ${max} for this age group.`,
    };
  }

  const { error } = await updateLiveGame(w.supabase, gameId, { on_field_size: value });
  if (error) return { success: false, error: error.message };

  if (auth.kind === "team") {
    revalidatePath(`/teams/${w.teamId}/games/${gameId}/live`);
  } else {
    revalidatePath(`/run/${auth.token}`, "layout");
  }
  return { success: true };
}

// ─── setOnFieldSizeMidGame ───────────────────────────────────
// Mid-quarter on-field-size change driven by LiveGameSettingsModal.
// Two shapes:
//
//   1. GROW (newSize > currentSize): only updates games.on_field_size.
//      No event written — displayZoneCaps grows automatically and the
//      coach drags bench players in via the existing swap UI.
//
//   2. SHRINK (newSize < currentSize): write a `roster_shrink` event
//      carrying the chosen `remove_player_ids` (so replay can close
//      each player's stint and move them to bench) AND update
//      games.on_field_size in the same call. The number of players
//      to remove MUST equal (currentSize - newSize); the caller
//      (LiveGameSettingsModal) collects them via a follow-up picker.
//
// Steve 2026-05-20.
export async function setOnFieldSizeMidGame(
  auth: LiveAuth,
  gameId: string,
  input: {
    newSize: number;
    removePlayerIds: string[];
    quarter: number;
    elapsedMs: number;
  },
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  const { value: clampedSize, min, max } = await clampOnFieldSize(
    w.supabase,
    w.teamId,
    input.newSize,
  );
  if (!Number.isFinite(input.newSize)) {
    return { success: false, error: "Invalid size." };
  }
  if (Math.floor(input.newSize) < min || Math.floor(input.newSize) > max) {
    return {
      success: false,
      error: `On-field size must be between ${min} and ${max} for this age group.`,
    };
  }

  // Need current games.on_field_size to decide grow vs. shrink and
  // to validate the remove-list length. Single round-trip.
  const { data: gameRow, error: readErr } = await w.supabase
    .from("games")
    .select("on_field_size")
    .eq("id", gameId)
    .maybeSingle();
  if (readErr) return { success: false, error: readErr.message };
  if (!gameRow) return { success: false, error: "Game not found." };
  const currentSize = (gameRow as { on_field_size: number }).on_field_size;

  // No-op guard. Saves a redundant write + revalidate flash.
  if (clampedSize === currentSize && input.removePlayerIds.length === 0) {
    return { success: true };
  }

  // Shrink path: validate the remove-list length matches the size
  // delta, then write the event. The event MUST land before the
  // games row update so replay sees the stint-close at the
  // correct elapsed_ms. (If the games row updates first and the
  // event insert then fails, replay would see a smaller field
  // with old lineup still in place.)
  const sizeDelta = currentSize - clampedSize;
  if (sizeDelta > 0) {
    if (input.removePlayerIds.length !== sizeDelta) {
      return {
        success: false,
        error: `Expected ${sizeDelta} player(s) to remove, got ${input.removePlayerIds.length}.`,
      };
    }
    const evRes = await insertEvent(auth, gameId, "roster_shrink", {
      player_id: null,
      metadata: {
        remove_player_ids: input.removePlayerIds,
        new_size: clampedSize,
        quarter: input.quarter,
        elapsed_ms: input.elapsedMs,
      },
    });
    if (!evRes.success) return evRes;
  } else if (input.removePlayerIds.length > 0) {
    // Grow path with remove_player_ids supplied = caller bug.
    return {
      success: false,
      error: "Cannot remove players when growing the field size.",
    };
  }

  // Update games.on_field_size for both grow + shrink paths.
  const { error: updErr } = await updateLiveGame(w.supabase, gameId, { on_field_size: clampedSize });
  if (updErr) return { success: false, error: updErr.message };

  if (auth.kind === "team") {
    revalidatePath(`/teams/${w.teamId}/games/${gameId}/live`);
  } else {
    revalidatePath(`/run/${auth.token}`, "layout");
  }
  return { success: true };
}

/**
 * Mid-game override of the sub-interval cadence (AFL only — drives
 * the sub-due banner). Coach realises mid-quarter that the
 * pre-game guess was wrong (kids gassed at 4m, or barely warm at
 * 6m) — this lets them dial it without restarting the game or
 * waiting for the next break. The live page's RSC SELECT picks up
 * the new value on the next refresh and the sub-due banner retimes
 * from the new cadence.
 *
 * Validation matches the pre-game LineupPicker input: integer or
 * half-minute, clamped to 1–10 minutes. Stored as seconds on the
 * games row.
 *
 * Steve 2026-05-20.
 */
export async function setSubInterval(
  auth: LiveAuth,
  gameId: string,
  seconds: number,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  if (!Number.isFinite(seconds)) {
    return { success: false, error: "Invalid interval." };
  }
  if (seconds < 60 || seconds > 600) {
    return {
      success: false,
      error: "Sub interval must be between 1 and 10 minutes.",
    };
  }
  // Allow half-minute increments (matches the pre-game step=0.5
  // input). Round to the nearest 30s so a 4.7-minute input doesn't
  // land as 282s.
  const rounded = Math.round(seconds / 30) * 30;

  const { error } = await updateLiveGame(w.supabase, gameId, { sub_interval_seconds: rounded });
  if (error) return { success: false, error: error.message };

  if (auth.kind === "team") {
    revalidatePath(`/teams/${w.teamId}/games/${gameId}/live`);
  } else {
    revalidatePath(`/run/${auth.token}`, "layout");
  }
  return { success: true };
}

export async function startQuarter(
  auth: LiveAuth,
  gameId: string,
  quarter: number,
  idempotencyKey?: string,
): Promise<ActionResult> {
  const result = await insertEvent(
    auth,
    gameId,
    "quarter_start",
    { metadata: { quarter } },
    idempotencyKey,
    { kind: "period_start", period: quarter },
  );
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
  elapsedMs: number,
  idempotencyKey?: string,
): Promise<ActionResult> {
  // Quarter_end gets the caller's idempotency key. The Q4
  // game_finalised + games-table-update path below stays
  // un-keyed for now; if a Q4 endQuarter is replayed after a
  // mid-flight network drop, the dedup'd quarter_end is fine but
  // the second game_finalised will insert a duplicate row in the
  // event log. The user-visible state stays correct (game shows
  // completed); only the audit log shows two finalise events.
  // Phase 5e.1 follow-up: derive a second key for finalise.
  const result = await insertEvent(
    auth,
    gameId,
    "quarter_end",
    { metadata: { quarter, elapsed_ms: elapsedMs } },
    idempotencyKey,
    { kind: "period_end", period: quarter },
  );
  if (!result.success) return result;

  // Non-final quarter ends still need to revalidate so the live page rerenders
  // into the Q-break shell. Q4 finalisation falls through to its own
  // revalidate block below (which also revalidates /games + /stats).
  // For ANY quarter (including Q4), we just write quarter_end and
  // revalidate. The Q4 → game_finalised + status=completed transition
  // is now an explicit second step (`finaliseGame` below) so the
  // coach can review and fix scores at full time before the summary
  // locks in. Without this split, "End game" auto-finalised the game
  // and skipped the review window Steve wanted.
  if (auth.kind === "team") {
    const w = await resolveWriter(auth, gameId);
    if (w.error) return { success: false, error: w.error };
    revalidatePath(`/teams/${w.teamId}/games/${gameId}/live`);
  } else {
    revalidatePath(`/run/${auth.token}`, "layout");
  }
  return { success: true };
}

// ─── finaliseGame ────────────────────────────────────────────
// Writes the `game_finalised` event and flips the games row to
// "completed". Called by the Full-Time review screen after the coach
// has had a chance to fix any missed / wrong scores. Idempotent:
// re-firing on an already-finalised game is a no-op (insert just
// adds another event; status stays completed).
export async function finaliseGame(
  auth: LiveAuth,
  gameId: string,
  elapsedMs: number,
  /** The same for every retry of one Finish, so a retry can't finalise twice. */
  idempotencyKey?: string,
): Promise<ActionResult> {
  // Both phones tapping Finish: the second finds it done.
  const first = await resolveWriter(auth, gameId);
  if (first.error) return { success: false, error: first.error };
  const verdict = await checkPeriodWrite(first.supabase, gameId, { kind: "finalise" }, "quarter");
  if (verdict.kind === "duplicate") {
    revalidateLivePage(auth, first.teamId, gameId);
    return { success: true };
  }

  const finalise = await insertEvent(auth, gameId, "game_finalised", {
    metadata: { quarter: 4, elapsed_ms: elapsedMs },
  }, idempotencyKey);
  if (!finalise.success) return finalise;

  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };
  const { error: updateError } = await updateLiveGame(w.supabase, gameId, { status: "completed" });
  if (updateError) return { success: false, error: updateError.message };

  // Season time rollup for stats and season balance (UX plan 4.5).
  await writeGameRollup(w.supabase, gameId);

  if (auth.kind === "team") {
    // Perf phase 6: finalising affects the game detail page (status
    // pill), /live (FT review surface), the games list (shows
    // result), and stats (incorporates new game). Was `, "layout"`
    // which dragged in squad/settings/dashboard/setup too —
    // unnecessary, those pages don't read game.status.
    revalidatePath(`/teams/${w.teamId}/games/${gameId}`);
    revalidatePath(`/teams/${w.teamId}/games/${gameId}/live`);
    revalidatePath(`/teams/${w.teamId}/games`);
    revalidatePath(`/teams/${w.teamId}/stats`);
  } else {
    revalidatePath(`/run/${auth.token}`, "layout");
  }
  return { success: true };
}

export async function addLateArrival(
  auth: LiveAuth,
  gameId: string,
  input: { player_id: string; quarter: number; elapsed_ms: number },
  idempotencyKey?: string,
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
  return insertEvent(
    auth,
    gameId,
    "player_arrived",
    {
      player_id: input.player_id,
      metadata: { quarter: input.quarter, elapsed_ms: input.elapsed_ms },
    },
    idempotencyKey,
  );
}

export async function recordGoal(
  auth: LiveAuth,
  gameId: string,
  input: {
    /** Null when the coach didn't see who kicked it — the goal counts
     *  for the team but skips the per-player tally, mirroring rushed
     *  behinds. Tagged `unattributed` in metadata so reporting can
     *  distinguish it from a normal scorer-credited goal. */
    player_id: string | null;
    quarter: number;
    elapsed_ms: number;
    unattributed?: boolean;
  },
  idempotencyKey?: string,
): Promise<ActionResult> {
  return insertEvent(
    auth,
    gameId,
    "goal",
    {
      player_id: input.player_id,
      metadata: {
        quarter: input.quarter,
        elapsed_ms: input.elapsed_ms,
        ...(input.unattributed ? { unattributed: true } : {}),
      },
    },
    idempotencyKey,
  );
}

export async function recordBehind(
  auth: LiveAuth,
  gameId: string,
  input: {
    player_id: string | null;
    quarter: number;
    elapsed_ms: number;
    /** True when the behind was rushed (deflected through by the
     *  opposition or self-rushed). Counts for our team but has no
     *  scorer — `player_id` will be null. Tagged in metadata so
     *  reporting can distinguish "Smith kicked a behind" from "the
     *  defender rushed it". */
    rushed?: boolean;
  },
  idempotencyKey?: string,
): Promise<ActionResult> {
  return insertEvent(
    auth,
    gameId,
    "behind",
    {
      player_id: input.player_id,
      metadata: {
        quarter: input.quarter,
        elapsed_ms: input.elapsed_ms,
        ...(input.rushed ? { rushed: true } : {}),
      },
    },
    idempotencyKey,
  );
}

export async function recordOpponentScore(
  auth: LiveAuth,
  gameId: string,
  input: { kind: "goal" | "behind"; quarter: number; elapsed_ms: number },
  idempotencyKey?: string,
): Promise<ActionResult> {
  return insertEvent(
    auth,
    gameId,
    input.kind === "goal" ? "opponent_goal" : "opponent_behind",
    { metadata: { quarter: input.quarter, elapsed_ms: input.elapsed_ms } },
    idempotencyKey,
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
    /**
     * Optional reason flag distinguishing WHY the player is sidelined.
     * "out" = the coach marked them out for the rest of the game at a
     * break (left early, parent pulled them, etc.) via the
     * Manage-availability entry. Absent = a genuine injury. The flag is
     * display-recoverable (jsonb metadata, no migration, fully
     * backward-compatible) so the UI can show "Out" vs "Injured". The
     * underlying mechanic — sideline + force a replacement pick — is
     * identical (D-09).
     */
    reason?: string;
  },
  idempotencyKey?: string,
): Promise<ActionResult> {
  return insertEvent(
    auth,
    gameId,
    "injury",
    {
      player_id: input.player_id,
      metadata: {
        injured: input.injured,
        quarter: input.quarter,
        elapsed_ms: input.elapsed_ms,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    },
    idempotencyKey,
  );
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
  },
  idempotencyKey?: string,
): Promise<ActionResult> {
  return insertEvent(
    auth,
    gameId,
    "player_loan",
    {
      player_id: input.player_id,
      metadata: {
        loaned: input.loaned,
        quarter: input.quarter,
        elapsed_ms: input.elapsed_ms,
      },
    },
    idempotencyKey,
  );
}

/**
 * Save a coach's hold on a player (Keep on / Keep in {zone} / Keep in
 * {position}); a null lock clears it. Replayed by lib/live/locks.ts so
 * the hold survives a reload and shows on a co-manager's phone.
 */
export async function recordPlayerLock(
  auth: LiveAuth,
  gameId: string,
  input: {
    player_id: string;
    lock: PlayerLock | null;
    quarter: number;
    elapsed_ms: number;
  },
  idempotencyKey?: string,
): Promise<ActionResult> {
  if (input.lock !== null && !isPlayerLock(input.lock)) {
    return { success: false, error: "That hold isn't one we know." };
  }
  return insertEvent(
    auth,
    gameId,
    "player_lock",
    {
      player_id: input.player_id,
      metadata: {
        lock: input.lock,
        quarter: input.quarter,
        elapsed_ms: input.elapsed_ms,
      },
    },
    idempotencyKey,
  );
}

/**
 * Save a clock pause or resume, in any sport (lib/live/clockPause.ts),
 * so a reload or a second phone rebuilds the paused clock.
 */
export async function recordClockPause(
  auth: LiveAuth,
  gameId: string,
  input: ClockPauseInput,
  idempotencyKey?: string,
): Promise<ActionResult> {
  if (!isClockPauseInput(input)) {
    return { success: false, error: "That pause isn't one we know.", rejected: true };
  }
  return insertEvent(
    auth,
    gameId,
    "clock_pause",
    {
      metadata: {
        quarter: input.quarter,
        paused: input.paused,
        elapsed_ms: input.elapsed_ms,
        at_ms: input.at_ms,
      },
    },
    idempotencyKey,
  );
}

export async function recordLineupSet(
  auth: LiveAuth,
  gameId: string,
  lineup: Lineup,
  idempotencyKey?: string,
): Promise<ActionResult> {
  return insertEvent(
    auth,
    gameId,
    "lineup_set",
    { metadata: { lineup } },
    idempotencyKey,
    // The break's lineup for the next quarter (AFL's only whole-lineup write).
    { kind: "break_lineup" },
  );
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
    /** By hand, off the rotation's cadence: the sub clock doesn't restart (lib/live/subAnchor). */
    manual?: boolean;
    /** One swap of a due batch, with this many still to make. */
    batch_left?: number;
  },
  idempotencyKey?: string,
): Promise<ActionResult> {
  return insertEvent(
    auth,
    gameId,
    "swap",
    { player_id: input.on_player_id, metadata: input },
    idempotencyKey,
  );
}

// Takes back the score this phone's undo strip named (`target`: the
// score's event id, or its write's key while it's still on the way), and
// only that one: with two phones scoring, "the latest goal" may be the
// other phone's (UX round 2). It runs on the game's write-queue lane, so
// it never lands before its score. Already taken back on the other phone:
// say so, write nothing. An undo with no target (queued by an older
// client) takes back the latest standing score of its kind, as before.
const AFL_SCORE_TYPES: ReadonlySet<string> = new Set(["goal", "behind", "opponent_goal", "opponent_behind"]);

export async function undoLastScore(
  auth: LiveAuth,
  gameId: string,
  input: {
    kind: "goal" | "behind" | "opponent_goal" | "opponent_behind";
    quarter: number;
    playerId: string | null;
    target?: UndoTargetRef | null;
  },
  idempotencyKey?: string,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  const { ref } = undoArgs(input.target ?? null, idempotencyKey);
  const rows = await scoreRowsOf(w.supabase, gameId, AFL_SCORE_TYPES);
  const found = resolveUndoTarget(rows, AFL_SCORE_TYPES, ref, {
    ownKey: idempotencyKey,
    fallbackTypes: new Set([input.kind]),
  });
  if (found.kind === "gone") return staleRefusal(auth, w.teamId, gameId, found.message);
  if (found.kind !== "target") return { success: true };
  const t = found.target;

  // The replays take an undo off by its own type, quarter and player, so
  // they come from the score it names.
  return insertEvent(
    auth,
    gameId,
    "score_undo",
    {
      player_id: t.player_id,
      metadata: {
        target_event_id: t.id,
        original_type: t.type,
        quarter: (t.metadata as { quarter?: number } | null)?.quarter ?? input.quarter,
      },
    },
    idempotencyKey,
  );
}

// ─── Score-log fetch / delete-any / retro-add ────────────────
// Powers the QuarterBreak "Fix scores" panel. Three actions, all
// auth-checked through the same resolveWriter path as the live
// scoring flow above.
export interface ScoreLogEntry {
  id: string;
  type: "goal" | "behind" | "opponent_goal" | "opponent_behind" | "score_undo";
  player_id: string | null;
  /** For score_undo: the original_type from metadata. */
  original_type: string | null;
  /** Quarter the event was booked to. For undo, copied from the original's metadata.quarter. */
  quarter: number | null;
  /** Whether this was added retroactively from the Fix-scores panel. */
  retro: boolean;
  /** A rushed behind (ours, no scorer). */
  rushed: boolean;
  /** A goal of ours nobody was credited with. */
  unattributed: boolean;
  /** target_event_id for score_undo entries — lets the UI grey-out the row it cancelled. */
  target_event_id: string | null;
  created_at: string;
}

export async function getGameScoreLog(
  auth: LiveAuth,
  gameId: string,
): Promise<ActionResult & { entries?: ScoreLogEntry[] }> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  const { data, error } = await w.supabase
    .from("game_events")
    .select("id, type, player_id, metadata, created_at")
    .eq("game_id", gameId)
    .in("type", ["goal", "behind", "opponent_goal", "opponent_behind", "score_undo"])
    .order("created_at", { ascending: true });
  if (error) return { success: false, error: error.message };

  const entries: ScoreLogEntry[] = (data ?? []).map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const isUndo = row.type === "score_undo";
    return {
      id: row.id as string,
      type: row.type as ScoreLogEntry["type"],
      player_id: (row.player_id as string | null) ?? null,
      original_type: isUndo ? ((meta.original_type as string) ?? null) : null,
      quarter:
        typeof meta.quarter === "number"
          ? (meta.quarter as number)
          : typeof meta.intended_quarter === "number"
          ? (meta.intended_quarter as number)
          : null,
      retro: meta.retro === true,
      rushed: meta.rushed === true,
      unattributed: meta.unattributed === true,
      target_event_id: isUndo ? ((meta.target_event_id as string) ?? null) : null,
      created_at: row.created_at as string,
    };
  });
  // Older netball undos don't name their target; pair them the way the
  // replay does (pairScoreUndos), so the review matches the header.
  const pairs = pairScoreUndos(
    (data ?? []).map((row) => ({ id: row.id as string, type: row.type as string, metadata: row.metadata })),
    new Set(["goal", "behind", "opponent_goal", "opponent_behind"]),
  );
  for (const e of entries) {
    if (e.type === "score_undo" && !e.target_event_id) e.target_event_id = pairs.get(e.id) ?? null;
  }
  return { success: true, entries };
}

// Delete any past scoring event by inserting a score_undo that
// targets it. Mirrors undoLastScore but lets the caller pick which
// event to reverse — used by the "Fix scores" panel's × button.
export async function deleteScore(
  auth: LiveAuth,
  gameId: string,
  eventId: string,
): Promise<ActionResult> {
  const w = await resolveWriter(auth, gameId);
  if (w.error) return { success: false, error: w.error };

  const { data: target } = await w.supabase
    .from("game_events")
    .select("id, type, player_id, metadata")
    .eq("id", eventId)
    .eq("game_id", gameId)
    .maybeSingle();
  if (!target) return { success: false, error: "Score event not found." };

  const validTypes = ["goal", "behind", "opponent_goal", "opponent_behind"];
  if (!validTypes.includes(target.type as string)) {
    return { success: false, error: "Only scoring events can be deleted." };
  }
  const meta = (target.metadata ?? {}) as Record<string, unknown>;
  // Preserve the original event's quarter attribution so the replay
  // correctly decrements the right per-quarter slot.
  const quarter =
    typeof meta.quarter === "number"
      ? (meta.quarter as number)
      : typeof meta.intended_quarter === "number"
      ? (meta.intended_quarter as number)
      : null;

  return insertEvent(auth, gameId, "score_undo", {
    player_id: target.player_id as string | null,
    metadata: {
      target_event_id: target.id,
      original_type: target.type,
      quarter: quarter ?? undefined,
    },
  });
}

// Add a missed score retroactively. Records a goal/behind/opp_goal/
// opp_behind event with `metadata.retro = true` and
// `metadata.intended_quarter` so replayGame attributes it to the
// quarter the coach picks, even though we're recording it later.
export async function addRetroScore(
  auth: LiveAuth,
  gameId: string,
  input: {
    kind: "goal" | "behind" | "opponent_goal" | "opponent_behind";
    playerId: string | null;
    intendedQuarter: number;
  },
): Promise<ActionResult> {
  if (input.intendedQuarter < 1 || input.intendedQuarter > 4) {
    return { success: false, error: "Quarter must be 1–4." };
  }
  const isOurs = input.kind === "goal" || input.kind === "behind";
  if (isOurs && !input.playerId) {
    return { success: false, error: "Pick a player." };
  }
  return insertEvent(auth, gameId, input.kind, {
    player_id: isOurs ? input.playerId : null,
    metadata: {
      retro: true,
      intended_quarter: input.intendedQuarter,
      // Mirror the live-scoring metadata shape so anything that
      // reads quarter from metadata (eventReplay, dashboard, future
      // exports) gets the right number too.
      quarter: input.intendedQuarter,
    },
  });
}

export async function recordFieldZoneSwap(
  auth: LiveAuth,
  gameId: string,
  input: {
    player_a_id: string;
    zone_a: string;
    /**
     * `null` = move-into-empty. Player A leaves `zone_a` and lands in
     * `zone_b` with no partner moving the other way — used when the
     * coach is playing a short squad and wants to shift the blank
     * slot to a different zone (e.g. send a Back into an empty
     * Forward, leaving the Back zone with the blank). When non-null,
     * standard two-player zone swap as before.
     */
    player_b_id: string | null;
    zone_b: string;
    quarter: number;
    elapsed_ms: number;
  },
  idempotencyKey?: string,
): Promise<ActionResult> {
  return insertEvent(
    auth,
    gameId,
    "field_zone_swap",
    { player_id: input.player_a_id, metadata: input },
    idempotencyKey,
  );
}
