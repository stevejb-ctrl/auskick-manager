"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMAIL_RE } from "@/lib/email/validate";
import { trimTo } from "@/lib/strings";
import {
  formatFeedbackMessage,
  sendTelegramNotification,
} from "@/lib/notifications/telegram";
import type { ActionResult } from "@/lib/types";

const MESSAGE_MIN = 5;
const MESSAGE_MAX = 5000;
const EMAIL_MAX = 200;
const PAGE_URL_MAX = 500;
const USER_AGENT_MAX = 500;
const APP_VERSION_MAX = 64;

export interface SubmitFeedbackInput {
  kind: "feedback" | "presales";
  message: string;
  /**
   * Required for presales (anonymous flow — Steve needs an address to
   * reply to). Ignored for authenticated feedback because we read
   * the user's verified email off their auth profile.
   */
  email?: string;
  pageUrl: string;
  userAgent: string;
  appVersion?: string;
  /**
   * Honeypot — the FeedbackFab renders a visually-hidden `website`
   * input. Real users leave it blank; bots fill every field. Non-
   * empty value returns silent success without persisting or pinging
   * Telegram, so the bot can't tell its submission was rejected.
   */
  website?: string;
}

/**
 * Captures in-app feedback / presales questions. Dual-purpose entry
 * point — same table, same Telegram chat, distinguished by `kind`.
 *
 * Flow:
 *   1. Honeypot check (silent success if filled).
 *   2. Length-bound + format validation.
 *   3. Auth branch — `feedback` requires an authed user; `presales`
 *      runs anonymous with the typed email.
 *   4. INSERT into `feedback` (RLS allows anon + authenticated).
 *   5. Best-effort team + game context: parse pageUrl for
 *      /teams/<uuid>/ and /teams/<uuid>/games/<uuid>/, fetch metadata
 *      so the Telegram message names the team / sport / age / game
 *      directly. RLS-guarded SELECT — silently drops the context if
 *      the user can't read the team (won't happen in normal flow but
 *      defensive against stale tabs).
 *   6. AWAIT `sendTelegramNotification` — see telegram.ts; widened
 *      to `Promise<boolean>` so we know whether delivery succeeded.
 *      Awaiting (rather than fire-and-forget) ensures the boolean
 *      lands in the DB before the serverless runtime can tear down
 *      the function — Vercel/Cloudflare aren't reliable hosts for
 *      post-response background work.
 *   7. UPDATE telegram_ok via admin client. Best-effort: if the
 *      service-role key isn't set (some preview deploys), the column
 *      stays NULL but the row + Telegram both already landed.
 */
export async function submitFeedback(
  input: SubmitFeedbackInput,
): Promise<ActionResult> {
  // ─── 1. Honeypot ───────────────────────────────────────────────
  if (trimTo(input.website, 200)) {
    return { success: true };
  }

  // ─── 2. Validation ─────────────────────────────────────────────
  if (input.kind !== "feedback" && input.kind !== "presales") {
    return { success: false, error: "Invalid feedback kind." };
  }

  const message = trimTo(input.message, MESSAGE_MAX);
  if (message.length < MESSAGE_MIN) {
    return {
      success: false,
      error: `Message must be at least ${MESSAGE_MIN} characters.`,
    };
  }

  const pageUrl = trimTo(input.pageUrl, PAGE_URL_MAX) || null;
  const userAgent = trimTo(input.userAgent, USER_AGENT_MAX) || null;
  const appVersion = trimTo(input.appVersion, APP_VERSION_MAX) || null;

  // ─── 3. Auth branch ────────────────────────────────────────────
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userId: string | null = null;
  let email: string | null = null;
  let userLabel: string;

  if (input.kind === "feedback") {
    if (!user) {
      // Should never happen — the in-app FAB only mounts under
      // (app)/layout which itself redirects unauthenticated requests
      // to /login. Guarded server-side anyway so a stale tab that
      // lost its session can't submit feedback as null.
      return {
        success: false,
        error: "You need to be signed in to send feedback.",
      };
    }
    userId = user.id;
    email = user.email ?? null;
    userLabel = email ?? user.id;
  } else {
    // presales — anonymous; require a typed email so Steve can reply
    const typedEmail = trimTo(input.email, EMAIL_MAX);
    if (!typedEmail || !EMAIL_RE.test(typedEmail)) {
      return {
        success: false,
        error: "Please add a valid email so we can reply.",
      };
    }
    email = typedEmail;
    userLabel = "anonymous";
  }

  // ─── 4. Insert ─────────────────────────────────────────────────
  const { data: inserted, error: insertError } = await supabase
    .from("feedback")
    .insert({
      kind: input.kind,
      user_id: userId,
      email,
      page_url: pageUrl,
      message,
      user_agent: userAgent,
      app_version: appVersion,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[submitFeedback] insert failed", insertError);
    return {
      success: false,
      error: "Couldn't send your message. Please try again.",
    };
  }

  // ─── 5. Resolve team / game context from the pageUrl ──────────
  // Steve 2026-05-25: a real-time bug ping is hard to reproduce
  // without knowing "which team, which sport, which game". Parse the
  // URL we already capture and best-effort fetch the metadata.
  // Failures (RLS denied, FK missing, malformed UUID) silently drop
  // the context — the feedback row + Telegram message still go out
  // with whatever we have.
  let team: { name: string; sport: string; ageGroup: string } | null = null;
  let game: { opponent: string; roundNumber: number | null } | null = null;
  if (pageUrl) {
    const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
    const teamMatch = pageUrl.match(new RegExp(`^/teams/(${UUID_RE})`));
    const gameMatch = pageUrl.match(
      new RegExp(`^/teams/${UUID_RE}/games/(${UUID_RE})`),
    );
    if (teamMatch) {
      const { data: teamRow } = await supabase
        .from("teams")
        .select("name, sport, age_group")
        .eq("id", teamMatch[1])
        .maybeSingle<{ name: string; sport: string; age_group: string }>();
      if (teamRow) {
        team = {
          name: teamRow.name,
          sport: teamRow.sport,
          ageGroup: teamRow.age_group,
        };
      }
    }
    if (gameMatch) {
      const { data: gameRow } = await supabase
        .from("games")
        .select("opponent, round_number")
        .eq("id", gameMatch[1])
        .maybeSingle<{ opponent: string; round_number: number | null }>();
      if (gameRow) {
        game = {
          opponent: gameRow.opponent,
          roundNumber: gameRow.round_number,
        };
      }
    }
  }

  // ─── 6. Telegram (awaited so the boolean is reliable) ─────────
  const text = formatFeedbackMessage({
    kind: input.kind,
    message,
    email,
    pageUrl,
    userLabel,
    time: new Date().toISOString(),
    team,
    game,
  });
  const telegramOk = await sendTelegramNotification(text);

  // ─── 7. Backfill telegram_ok ───────────────────────────────────
  // Admin client bypasses RLS (the UPDATE policy is super-admin only).
  // Best-effort: if SUPABASE_SERVICE_ROLE_KEY isn't set in this env,
  // we leave telegram_ok null. Row + delivery both already happened;
  // the column is purely an audit signal for a future inbox view.
  try {
    const admin = createAdminClient();
    await admin
      .from("feedback")
      .update({ telegram_ok: telegramOk })
      .eq("id", inserted.id);
  } catch (err) {
    console.warn(
      "[submitFeedback] telegram_ok backfill skipped",
      err instanceof Error ? err.message : err,
    );
  }

  return { success: true };
}
