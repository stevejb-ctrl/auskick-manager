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
