const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatSignupMessage(
  email: string,
  time: string,
  provider?: string,
): string {
  // Provider arg added 2026-05-17: OAuth signups (Google / Apple)
  // were silently bypassing the notify path because only the
  // email/password SignupForm called notifySignup. The /auth/
  // callback route now fires it too — including the provider here
  // disambiguates "new email signup" vs "new OAuth signup".
  // Pre-existing callers (just the email/password form) can omit
  // the arg and the line is suppressed for backwards compat.
  const providerLine = provider ? `\nProvider: ${escapeHtml(provider)}` : "";
  return `🎉 <b>New Siren Footy signup</b>\n\nEmail: ${escapeHtml(email)}${providerLine}\nTime: ${time}`;
}

export function formatTeamMessage(
  name: string,
  ageGroup: string,
  createdBy: string,
  time: string,
  sport?: string,
): string {
  // `sport` added 2026-05-17 — Steve wanted to see at a glance
  // whether new teams were AFL or netball as both brands launch.
  // Optional for backwards compat; the column has been on `teams`
  // forever but the message only showed name + age + creator
  // before. Suffix line so the existing message shape doesn't
  // change for old callers.
  const sportLine = sport ? `\nSport: ${escapeHtml(sport)}` : "";
  return `🏉 <b>New team created</b>\n\nName: ${escapeHtml(name)}\nAge group: ${ageGroup}${sportLine}\nCreated by: ${escapeHtml(createdBy)}\nTime: ${time}`;
}

export function formatGameStartedMessage(input: {
  teamName: string;
  opponent: string;
  sport: string;
  startedBy: string;
  time: string;
}): string {
  // Fires once per game on Q1 kickoff (gated by `startQuarterToo` in
  // startGame / startNetballGame). Q2–Q4 starts don't ping — they're
  // continuations of the same game, and Steve wants a count of
  // distinct games being played, not a buzzing phone every break.
  // Demo team is filtered out at the call site so exploration on
  // /demo doesn't pollute the signal.
  const { teamName, opponent, sport, startedBy, time } = input;
  return [
    `🏁 <b>Game started</b>`,
    ``,
    `Team: ${escapeHtml(teamName)} (${escapeHtml(sport)})`,
    `vs: ${escapeHtml(opponent)}`,
    `Started by: ${escapeHtml(startedBy)}`,
    `Time: ${time}`,
  ].join("\n");
}

export function formatFeedbackMessage(input: {
  kind: "feedback" | "presales";
  message: string;
  email: string | null;
  pageUrl: string | null;
  userLabel: string;
  time: string;
}): string {
  // Two prompts feed one Telegram surface, distinguished by header so
  // Steve's eye knows immediately whether a tap is a product-feedback
  // ping (already-paying coach) vs a presales question (prospect on
  // the marketing site). Both share the same body shape — message
  // first because that's what Steve reads, metadata lines below.
  // Backed by the feedback table (migration 0042) so the message is
  // safe even if the Telegram delivery later fails.
  const { kind, message, email, pageUrl, userLabel, time } = input;
  const header =
    kind === "feedback"
      ? "💬 <b>New product feedback</b>"
      : "❓ <b>New presales question</b>";
  const lines = [
    header,
    "",
    escapeHtml(message),
    "",
    `From: ${escapeHtml(userLabel)}`,
  ];
  if (email) lines.push(`Email: ${escapeHtml(email)}`);
  if (pageUrl) lines.push(`Page: ${escapeHtml(pageUrl)}`);
  lines.push(`Time: ${time}`);
  return lines.join("\n");
}

/**
 * Sends `text` to the admin Telegram chat. Returns `true` if Telegram
 * responded 2xx, `false` if delivery failed, missing env vars, or the
 * fetch threw. Never rejects — callers that don't care about the
 * outcome can keep the existing `sendTelegramNotification(text).catch(
 * () => {})` shape; widening `void` to `boolean` is backwards-
 * compatible because the discarded value just becomes `undefined`
 * from the caller's perspective.
 *
 * Used by feedback/actions.ts to backfill `feedback.telegram_ok` so
 * a future inbox view can flag deliveries Steve never received.
 */
export async function sendTelegramNotification(text: string): Promise<boolean> {
  if (!TOKEN || !CHAT_ID) return false;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
      }
    );
    if (!res.ok) {
      console.error("[telegram] sendMessage failed", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[telegram] sendMessage threw", err);
    return false;
  }
}
