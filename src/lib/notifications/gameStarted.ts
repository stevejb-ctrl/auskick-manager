import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatGameStartedMessage,
  sendTelegramNotification,
} from "@/lib/notifications/telegram";

/**
 * Looks up the team/game/starter triplet needed to format a
 * "Game started" Telegram message and dispatches it. Shared between
 * AFL `startGame` and netball `startNetballGame` so the message
 * shape stays identical across sports.
 *
 * Skips the demo team so exploration on /demo doesn't pollute the
 * signal Steve is using to count real weekend kickoffs, and quietly
 * no-ops if any lookup or the Telegram call fails — observability,
 * not core flow, must never block a real game start.
 *
 * Lives in lib/ (not in the action file) because Next.js's
 * `"use server"` directive turns every export into a remote-
 * callable server action; this helper is a private dispatcher that
 * shouldn't be exposed as RPC, so it sits in a regular module that
 * both action files can import.
 */
export async function notifyGameStarted(
  supabase: SupabaseClient,
  teamId: string,
  gameId: string,
  /**
   * Null when the kickoff came in via a share-link / runner token
   * rather than a signed-in coach. Rare but real (parents running
   * the game on the coach's behalf use the token path), so we still
   * fire the notification — just label the starter "Share-link
   * runner" so the count doesn't lose those.
   */
  userId: string | null,
): Promise<void> {
  try {
    const [{ data: team }, { data: game }, { data: profile }] =
      await Promise.all([
        supabase
          .from("teams")
          .select("name, sport, is_demo")
          .eq("id", teamId)
          .maybeSingle(),
        supabase
          .from("games")
          .select("opponent")
          .eq("id", gameId)
          .maybeSingle(),
        userId
          ? supabase
              .from("profiles")
              .select("full_name, email")
              .eq("id", userId)
              .maybeSingle()
          : Promise.resolve({ data: null as null }),
      ]);
    if (!team || team.is_demo) return;
    const text = formatGameStartedMessage({
      teamName: team.name ?? "Unknown team",
      opponent: game?.opponent ?? "Unknown opponent",
      sport: (team.sport as string | null) ?? "afl",
      startedBy:
        profile?.full_name?.trim() ||
        profile?.email ||
        (userId ? "Unknown coach" : "Share-link runner"),
      time: new Date().toISOString(),
    });
    await sendTelegramNotification(text);
  } catch {
    // Swallow — see jsdoc above.
  }
}
