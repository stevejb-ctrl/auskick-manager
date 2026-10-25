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

/** A team name's longest, at create and at rename alike (UTF-16 units, as an input's maxLength counts). */
export const TEAM_NAME_MAX = 80;

/**
 * Why a team name won't do, or null. Round 3 edge testing (24 Oct 2026):
 * create took a 98-character name, then rename refused any edit to it.
 */
export function teamNameError(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "Team name is required.";
  if (trimmed.length > TEAM_NAME_MAX) return `Name is too long (${TEAM_NAME_MAX} characters max).`;
  return null;
}

/**
 * The delete-team retype: what the coach typed matches the name once
 * case, curly quotes, emoji and spacing don't count. Round 3: an exact,
 * case-sensitive retype of "Zoë’s 🦘 …" was hard on an Android keyboard.
 */
export function teamNameMatches(typed: string, name: string): boolean {
  const loose = (s: string) =>
    s
      .normalize("NFKC")
      .replace(/[‘’‛′]/g, "'")
      .replace(/[“”″]/g, '"')
      .replace(new RegExp("[^\\p{L}\\p{N}'\" ]", "gu"), " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase();
  const want = loose(name);
  // A name with nothing but emoji or symbols: type it as it is.
  if (want === "") return typed.trim() !== "" && typed.trim() === name.trim();
  return loose(typed) === want;
}
