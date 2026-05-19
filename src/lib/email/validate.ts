// Shared email-validation helpers. Single source of truth so the
// invite send path and the contact form agree on what counts as a
// well-formed address. Server-side check; the client mirrors the
// regex via `isEmail` for inline form feedback.
//
// Deliberately permissive — closer to "did the user typo?" than
// strict RFC 5322. Real deliverability is determined by the inbox,
// not by us.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string | null | undefined): value is string {
  if (typeof value !== "string") return false;
  return EMAIL_RE.test(value.trim());
}

/**
 * Mask an email for log lines so a stray Resend error doesn't dump a
 * recipient's address into shared logs. `alice@example.com` becomes
 * `a***@example.com`.
 */
export function maskEmail(value: string): string {
  const at = value.indexOf("@");
  if (at <= 1) return "***" + value.slice(at);
  return value[0] + "***" + value.slice(at);
}
