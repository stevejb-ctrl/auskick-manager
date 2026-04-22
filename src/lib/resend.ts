import { Resend } from "resend";

// Lazy singleton — throws a friendly error at call-time if RESEND_API_KEY
// isn't set, rather than crashing the whole build. That way deployments
// without email configured still work; only the /contact action fails.
let _client: Resend | null = null;

export function getResend(): Resend {
  if (_client) return _client;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY is not configured — contact form cannot send email."
    );
  }
  _client = new Resend(apiKey);
  return _client;
}

// Sender identity. Must be on a domain verified in Resend. During initial
// setup before domain verification, use the built-in onboarding sender
// `onboarding@resend.dev` — Resend accepts it without verification but
// caps you at sending to the email on the Resend account.
export const CONTACT_FROM =
  process.env.RESEND_FROM_EMAIL ?? "Siren Footy <hello@sirenfooty.com.au>";

// Inbox for contact-form submissions.
export const CONTACT_TO =
  process.env.RESEND_TO_EMAIL ?? "hello@sirenfooty.com.au";
