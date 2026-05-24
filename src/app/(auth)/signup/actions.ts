"use server";

import {
  formatSignupMessage,
  sendTelegramNotification,
} from "@/lib/notifications/telegram";

// `provider` was added 2026-05-17 so the /auth/callback route
// (OAuth path) and SignupForm (email path) can both call this
// while making the channel visible in the Telegram message. Old
// callers can omit it for backwards compat.
export async function notifySignup(
  email: string,
  provider?: string,
): Promise<void> {
  const text = formatSignupMessage(email, new Date().toISOString(), provider);
  await sendTelegramNotification(text);
}
