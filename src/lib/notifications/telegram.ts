const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatSignupMessage(email: string, time: string): string {
  return `🎉 <b>New Siren Footy signup</b>\n\nEmail: ${escapeHtml(email)}\nTime: ${time}`;
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
