"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getMembership } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearGameRollup } from "@/lib/playbook/rollupStore";
import { readValidatedUserId } from "@/lib/auth/userIdHeader";
import { gameBelongsToTeam } from "@/lib/auth/gameOwnership";
import { invalidateSeasonEvents } from "@/lib/season";
import type { ActionResult, AvailabilityStatus, GameEvent, LiveAuth } from "@/lib/types";
import { finishedScoreLog, scoreFixRows, scoreKinds, type ScoreFix } from "@/lib/games/finishedScores";
import { periodLabels, teamSport } from "@/lib/sports";
import { teamAgeGroup } from "@/lib/sports/teamAgeGroup";
import { teamMixedRule } from "@/lib/sports/touch/mixed";
import { distinctFullNames } from "@/lib/names";
import type { FixScoresProps } from "@/components/games/FixScoresDialog";

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
  // A Parent member's answer counts as a reply, as one through the
  // game's availability link does (migration 0072): the coach's list
  // says who's replied.
  const isParent = membership?.role === "parent";
  const { error } = await writer.from("game_availability").upsert(
    playerIds.map((playerId) => ({
      game_id: gameId,
      player_id: playerId,
      status,
      updated_by: userId,
      updated_at: now,
      ...(isParent ? { replied_at: now } : {}),
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

  // Authorise: a team admin only. game_managers can run the game but not
  // destroy its history, and neither can a game-day link: it's shared in
  // group chats, and a Manager could open it to do what their role
  // forbids (UX round 2, 24 Oct 2026: a runner's Restart wiped a live
  // game). The runner screens don't offer Restart.
  if (auth.kind === "token") {
    return {
      success: false,
      error: "Only a team admin can restart a game, from the game page.",
      rejected: true,
    };
  }
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
  const teamId = auth.teamId;

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
  // availability + fill-in management surface entirely.
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
 * Fix a finished game's scores (round 3 edge testing, 24 Oct 2026: the
 * game page promised a fix and opened a read-only summary). Add a missed
 * score, take one off, or change who scored: each is written as events
 * (lib/games/finishedScores), so the summary, scorers and Stats
 * recompute. Coaches and managers only, on a finished game.
 */
/**
 * The live screen's Fix scores: the game's scores so far and what the
 * sheet needs to fix them, read when it opens (the screen's own score
 * stores don't hold a log). Coaches only, as fixFinishedScore.
 */
export async function loadScoreFix(teamId: string, gameId: string): Promise<ActionResult<FixScoresProps>> {
  const userId = readValidatedUserId();
  if (!userId) return { success: false, error: "Unauthenticated." };
  const membership = await getMembership(teamId, userId);
  if (!membership || (membership.role !== "admin" && membership.role !== "game_manager")) {
    return { success: false, error: "Only the team's coaches can fix scores." };
  }
  const supabase = createClient();
  const [{ data: game }, { data: team }, { data: events }, { data: players }, { data: fillIns }] = await Promise.all([
    supabase.from("games").select("opponent").eq("id", gameId).eq("team_id", teamId).maybeSingle(),
    supabase
      .from("teams")
      .select("name, sport, age_group, period_count, mixed_max_boys, mixed_min_girls, mixed_min_boys")
      .eq("id", teamId)
      .maybeSingle(),
    supabase.from("game_events").select("*").eq("game_id", gameId).order("created_at"),
    supabase.from("players").select("id, full_name, jersey_number").eq("team_id", teamId),
    supabase.from("game_fill_ins").select("id, full_name, jersey_number").eq("game_id", gameId),
  ]);
  if (!game || !team) return { success: false, error: "Game not found for this team." };
  const sport = teamSport(team.sport as string);
  const age = teamAgeGroup(sport, team.age_group as string | undefined, team.period_count as number | null | undefined);
  type Kid = { id: string; full_name: string; jersey_number: number | null };
  const squad = [...((players ?? []) as Kid[]), ...((fillIns ?? []) as Kid[])];
  const names = distinctFullNames(squad);
  return {
    success: true,
    data: {
      teamId,
      gameId,
      kinds: scoreKinds(sport, {
        goalsFromPlay: (age as { goalsFromPlay?: boolean }).goalsFromPlay ?? true,
        girlsTry: sport === "oztag" && teamMixedRule(team) !== null,
      }),
      log: finishedScoreLog(sport, (events ?? []) as GameEvent[]),
      players: squad.map((p) => ({ id: p.id, name: names.get(p.id) ?? p.full_name })),
      periodCount: age.periodCount,
      periodLetter: periodLabels(sport, age).label.charAt(0).toUpperCase(),
      teamName: (team.name as string | null) ?? "Us",
      opponentName: game.opponent as string,
    },
  };
}

export async function fixFinishedScore(teamId: string, gameId: string, fix: ScoreFix): Promise<ActionResult> {
  const userId = readValidatedUserId();
  if (!userId) return { success: false, error: "Unauthenticated." };
  const membership = await getMembership(teamId, userId);
  if (!membership || (membership.role !== "admin" && membership.role !== "game_manager")) {
    return { success: false, error: "Only the team's coaches can fix scores." };
  }

  const supabase = createClient();
  const [{ data: game }, { data: team }, { data: events }] = await Promise.all([
    supabase.from("games").select("status").eq("id", gameId).eq("team_id", teamId).maybeSingle(),
    supabase.from("teams").select("sport").eq("id", teamId).maybeSingle(),
    supabase.from("game_events").select("*").eq("game_id", gameId).order("created_at"),
  ]);
  if (!game || !team) return { success: false, error: "Game not found for this team." };
  // A game that's on, too: from the live screen's Fix scores (a usability
  // pass, 26 Oct 2026: a wrong score stayed until the break).
  if (game.status === "upcoming") return { success: false, error: "There are no scores to fix until the game starts." };

  const rows = scoreFixRows(teamSport(team.sport as string), (events ?? []) as GameEvent[], fix, {
    finished: game.status === "completed",
  });
  if ("error" in rows) return { success: false, error: rows.error };

  // A named scorer is one of the squad or the game's fill-ins.
  const scorer = fix.op === "delete" ? null : fix.playerId;
  if (scorer) {
    const [{ data: kid }, { data: fillIn }] = await Promise.all([
      supabase.from("players").select("id").eq("id", scorer).eq("team_id", teamId).maybeSingle(),
      supabase.from("game_fill_ins").select("id").eq("id", scorer).eq("game_id", gameId).maybeSingle(),
    ]);
    if (!kid && !fillIn) return { success: false, error: "Pick a player from this game." };
  }

  // A millisecond apart, so the undo lands before the score that replaces it.
  const now = Date.now();
  const { error: insertError } = await supabase.from("game_events").insert(
    rows.map((r, i) => ({
      game_id: gameId,
      type: r.type,
      player_id: r.player_id,
      metadata: r.metadata,
      created_by: userId,
      created_at: new Date(now + i).toISOString(),
    })),
  );
  if (insertError) return { success: false, error: insertError.message };

  invalidateSeasonEvents(teamId);
  revalidatePath(`/teams/${teamId}/games/${gameId}`);
  revalidatePath(`/teams/${teamId}/games`);
  revalidatePath(`/teams/${teamId}/stats`);
  revalidatePath(`/teams/${teamId}`);
  return { success: true };
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

// ─── newGameDayLink ──────────────────────────────────────────
// Replaces the game's game-day link: the old /run/<token> stops working
// at once (its phone's next sync check finds nothing and the page says
// so), and the coach shares the new one. There was no way to take a link
// back once it was in a group chat, or from a helper who'd been removed
// (UX round 2, 24 Oct 2026). Team admins only.
export async function newGameDayLink(
  teamId: string,
  gameId: string,
): Promise<ActionResult<{ token: string }>> {
  const userId = readValidatedUserId();
  if (!userId) return { success: false, error: "Unauthenticated." };
  const membership = await getMembership(teamId, userId);
  if (!membership || membership.role !== "admin") {
    return { success: false, error: "Only a team admin can replace the game-day link." };
  }

  const admin = createAdminClient();
  const { data: before } = await admin
    .from("games")
    .select("team_id, share_token")
    .eq("id", gameId)
    .maybeSingle();
  if (!before || !gameBelongsToTeam(before.team_id, teamId)) {
    return { success: false, error: "Game not found for this team." };
  }
  const token = randomUUID();
  const { error } = await admin
    .from("games")
    .update({ share_token: token })
    .eq("id", gameId)
    .eq("team_id", teamId);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/teams/${teamId}/games/${gameId}`);
  revalidatePath(`/run/${before.share_token}`, "layout");
  return { success: true, data: { token } };
}
