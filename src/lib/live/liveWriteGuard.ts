// ─── The live actions' checks against the game as it stands ──
// Server side of periodGuard.ts and undoTarget.ts: reads what the check
// needs, and words the refusal a phone that's behind the game gets. The
// refusal re-renders that phone's live page (so it shows the game as it
// is now) and comes back `rejected` (the write queue drops it rather than
// retrying) and `stale` (the screen says why: liveSync.ts).

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult, LiveAuth } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  periodStateOf,
  periodWriteVerdict,
  uniqueRaceVerdict,
  type PeriodVerdict,
  type PeriodWord,
  type PeriodWrite,
} from "@/lib/live/periodGuard";

export { periodWordOf } from "@/lib/live/periodGuard";

const PERIOD_EVENT_TYPES = ["lineup_set", "quarter_start", "quarter_end", "game_finalised"];

/**
 * Whether `write` fits the game as it stands. A write the queue is
 * replaying (its key already landed) is `duplicate`: it's done.
 */
export async function checkPeriodWrite(
  supabase: SupabaseClient,
  gameId: string,
  write: PeriodWrite,
  word: PeriodWord,
  idempotencyKey?: string | null,
): Promise<PeriodVerdict> {
  const [{ data: game }, { data: events }, replay] = await Promise.all([
    supabase.from("games").select("status").eq("id", gameId).maybeSingle(),
    supabase.from("game_events").select("type, metadata").eq("game_id", gameId).in("type", PERIOD_EVENT_TYPES),
    idempotencyKey
      ? supabase.from("game_events").select("id").eq("game_id", gameId).eq("idempotency_key", idempotencyKey).limit(1)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  if ((replay.data ?? []).length > 0) return { kind: "duplicate" };
  const status = (game as { status?: string } | null)?.status ?? null;
  return periodWriteVerdict(periodStateOf(status, (events ?? []) as { type: string; metadata: unknown }[]), write, word);
}

/**
 * What a refused event insert means when it lost a race the guard
 * couldn't see: the other phone's start or Finish landed between this
 * phone's check and its write, and 0075's unique index refused this one.
 * Null for any other error. A retry of this phone's own write (same key)
 * can trip the period index before the key's: that's done, not stale.
 */
export async function raceVerdictOf(
  supabase: SupabaseClient,
  gameId: string,
  error: { code?: string | null; message?: string | null; details?: string | null },
  event: { type: string; guard?: PeriodWrite },
  word: PeriodWord,
  idempotencyKey?: string | null,
): Promise<PeriodVerdict | null> {
  const write: PeriodWrite | undefined = event.guard ?? (event.type === "game_finalised" ? { kind: "finalise" } : undefined);
  if (!write) return null;
  const verdict = uniqueRaceVerdict(error, write, word);
  if (verdict?.kind === "stale" && idempotencyKey) {
    const { data } = await supabase.from("game_events").select("id").eq("game_id", gameId).eq("idempotency_key", idempotencyKey).limit(1);
    if ((data ?? []).length > 0) return { kind: "duplicate" };
  }
  return verdict;
}

/**
 * A kickoff writes its lineup_set (and touch its roster_shrink), then the
 * first period's start. When the other phone kicked off in the same
 * instant, the database refuses this phone's start (0075); what this
 * phone wrote before it then comes back out, so its lineup can't stand
 * over the other phone's (the overwritten lineup of UX round 2). The
 * service role deletes them: coaches can't delete events. Returns the
 * refusal's words, or null when `error` isn't that race.
 */
export async function kickoffRaceRefusal(
  gameId: string,
  writtenIds: string[],
  error: { code?: string | null; message?: string | null; details?: string | null },
  word: PeriodWord,
): Promise<string | null> {
  const verdict = uniqueRaceVerdict(error, { kind: "kickoff" }, word);
  if (verdict?.kind !== "stale") return null;
  if (writtenIds.length > 0) {
    await createAdminClient().from("game_events").delete().eq("game_id", gameId).in("id", writtenIds);
  }
  return verdict.message;
}

/** Re-render the live page the caller is on (coach's or runner's). */
export function revalidateLivePage(auth: LiveAuth, teamId: string, gameId: string): void {
  if (auth.kind === "team") revalidatePath(`/teams/${teamId}/games/${gameId}/live`);
  else revalidatePath(`/run/${auth.token}`, "layout");
}

/** The refusal for a phone that's behind the game. */
export function staleRefusal(auth: LiveAuth, teamId: string, gameId: string, message: string): ActionResult {
  revalidateLivePage(auth, teamId, gameId);
  return { success: false, error: message, rejected: true, stale: true };
}

/** The game's scores and undos in the order they landed, for undoTarget. */
export async function scoreRowsOf(
  supabase: SupabaseClient,
  gameId: string,
  scoreTypes: ReadonlySet<string>,
): Promise<{ id: string; type: string; player_id: string | null; metadata: unknown; idempotency_key: string | null }[]> {
  const { data } = await supabase
    .from("game_events")
    .select("id, type, player_id, metadata, idempotency_key, created_at")
    .eq("game_id", gameId)
    .in("type", [...Array.from(scoreTypes), "score_undo"])
    .order("created_at", { ascending: true });
  return ((data ?? []) as { id: string; type: string; player_id: string | null; metadata: unknown; idempotency_key: string | null }[]).map(
    (r) => ({ id: r.id, type: r.type, player_id: r.player_id ?? null, metadata: r.metadata, idempotency_key: r.idempotency_key ?? null }),
  );
}
