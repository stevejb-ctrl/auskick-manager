// ─── The live actions' checks against the game as it stands ──
// Server side of periodGuard.ts and undoTarget.ts: reads what the check
// needs, and words the refusal a phone that's behind the game gets. The
// refusal re-renders that phone's live page (so it shows the game as it
// is now) and comes back `rejected` (the write queue drops it rather than
// retrying) and `stale` (the screen says why: liveSync.ts).

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult, LiveAuth } from "@/lib/types";
import { periodStateOf, periodWriteVerdict, type PeriodVerdict, type PeriodWord, type PeriodWrite } from "@/lib/live/periodGuard";

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
