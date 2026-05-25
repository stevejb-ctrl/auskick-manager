// Shared string helpers used by server actions that accept untrusted
// user input. Lifted here once both contact/actions.ts and
// feedback/actions.ts needed `trimTo` — same precedent as
// src/lib/email/validate.ts hoisting EMAIL_RE out of contact/actions
// when the team-invite email send needed it too.

/**
 * Coerces `value` to a string, trims whitespace, and clips to `max`
 * chars. Returns `""` for non-string input so server actions can run
 * a simple length-or-empty check without per-field unknown-narrowing.
 *
 * Length clip is a safety bound, not a UX bound — the form layer
 * should still surface a "too long" error before the action runs.
 */
export function trimTo(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}
