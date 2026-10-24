// ─── A team member's name ────────────────────────────────────
// Email sign-ups get profiles.full_name = '' (not null), so the members
// list can't use `full_name ?? email`: a blank name is no name (round 2
// usability, 24 Oct 2026: "Remove  from the team?").

const MAX_NAME = 60;

export function hasDisplayName(fullName: string | null | undefined): boolean {
  return !!fullName && fullName.trim().length > 0;
}

/** The name, else the email: never an empty label. */
export function memberDisplayName(person: {
  full_name?: string | null;
  email?: string | null;
}): string {
  if (hasDisplayName(person.full_name)) return person.full_name!.trim();
  return person.email?.trim() || "A team member";
}

/** A name someone typed: trimmed, single-spaced, and not too long. */
export function cleanDisplayName(
  raw: string,
): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Please add your name." };
  if (name.length > MAX_NAME) return { ok: false, error: `Keep your name under ${MAX_NAME} characters.` };
  return { ok: true, name };
}
