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
  time: string
): string {
  return `🏉 <b>New team created</b>\n\nName: ${escapeHtml(name)}\nAge group: ${ageGroup}\nCreated by: ${escapeHtml(createdBy)}\nTime: ${time}`;
}

export async function sendTelegramNotification(text: string): Promise<void> {
  if (!TOKEN || !CHAT_ID) return;

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
    }
  } catch (err) {
    console.error("[telegram] sendMessage threw", err);
  }
}
