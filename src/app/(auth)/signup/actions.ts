"use server";

import {
  formatSignupMessage,
  sendTelegramNotification,
} from "@/lib/notifications/telegram";

export async function notifySignup(email: string): Promise<void> {
  const text = formatSignupMessage(email, new Date().toISOString());
  await sendTelegramNotification(text);
}
