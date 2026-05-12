"use server";

import { CONTACT_FROM, CONTACT_TO, getResend } from "@/lib/resend";
import type { ActionResult } from "@/lib/types";

// Rough RFC-5322-lite check — good enough to catch typos without
// rejecting anything a real inbox would accept.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NAME_MAX = 100;
const EMAIL_MAX = 200;
const SUBJECT_MAX = 150;
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 5000;

export interface ContactFormInput {
  name: string;
  email: string;
  subject: string;
  message: string;
  // Honeypot — real humans leave this blank. Bots fill every field.
  // We silently succeed without sending when it's non-empty.
  website?: string;
}

function trimTo(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

// Escape HTML so user content can't smuggle markup into the email body.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendContactMessage(
  input: ContactFormInput
): Promise<ActionResult> {
  const name = trimTo(input.name, NAME_MAX);
  const email = trimTo(input.email, EMAIL_MAX);
  const subject = trimTo(input.subject, SUBJECT_MAX);
  const message = trimTo(input.message, MESSAGE_MAX);
  const honeypot = trimTo(input.website, 200);

  // Silent success on honeypot — don't tip off the bot.
  if (honeypot) {
    return { success: true };
  }

  if (!name) {
    return { success: false, error: "Please add your name." };
  }
  if (!email || !EMAIL_RE.test(email)) {
    return { success: false, error: "Please use a valid email address." };
  }
  if (!message || message.length < MESSAGE_MIN) {
    return {
      success: false,
      error: `Message should be at least ${MESSAGE_MIN} characters.`,
    };
  }

  const finalSubject = subject || `New contact form message from ${name}`;

  try {
    const resend = getResend();
    const result = await resend.emails.send({
      from: CONTACT_FROM,
      to: CONTACT_TO,
      replyTo: email,
      subject: `[Siren Contact] ${finalSubject}`,
      text: [
        `From: ${name} <${email}>`,
        subject ? `Subject: ${subject}` : null,
        "",
        message,
      ]
        .filter(Boolean)
        .join("\n"),
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; color: #333; line-height: 1.5;">
          <p style="margin: 0 0 8px;"><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
          ${subject ? `<p style="margin: 0 0 8px;"><strong>Subject:</strong> ${escapeHtml(subject)}</p>` : ""}
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
          <div style="white-space: pre-wrap;">${escapeHtml(message)}</div>
        </div>
      `,
    });

    if (result.error) {
      console.error("[contact] resend error:", result.error);
      return {
        success: false,
        error: "Sorry, we couldn't send that just now. Please try again in a moment.",
      };
    }

    return { success: true };
  } catch (err) {
    console.error("[contact] send failed:", err);
    return {
      success: false,
      error: "Sorry, we couldn't send that just now. Please try again in a moment.",
    };
  }
}
