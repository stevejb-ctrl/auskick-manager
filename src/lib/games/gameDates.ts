// A game's date: the range a coach can pick, and how lists show it.
// Round 3 edge testing (24 Oct 2026): 9999-12-31 was accepted, lists
// showed "Fri 31 Dec · 23:59" under "2026 Season" with nothing to say it
// was 7,973 years away, and the mistyped year then owned the Stats
// season picker.

const DAY_MS = 86_400_000;
/** Last season's games can still go in (and be fixed). */
export const GAME_DATE_PAST_DAYS = 730;
/** Next season's opener, not a typo'd year. */
export const GAME_DATE_FUTURE_DAYS = 548;

/** Why this date can't be a game's, or null. */
export function gameDateError(iso: string, now: number = Date.now()): string | null {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(t)) return "Date and time are required.";
  if (t > now + GAME_DATE_FUTURE_DAYS * DAY_MS) return "That date is more than 18 months away. Check the year.";
  if (t < now - GAME_DATE_PAST_DAYS * DAY_MS) return "That date is more than 2 years ago. Check the year.";
  return null;
}

/** A datetime-local input's value for a moment, in local time. */
export function toLocalInputValue(t: number | string): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The date input's min and max (the browser stops a typo'd year too). */
export function gameDateRange(now: number = Date.now()): { min: string; max: string } {
  return {
    min: toLocalInputValue(now - GAME_DATE_PAST_DAYS * DAY_MS),
    max: toLocalInputValue(now + GAME_DATE_FUTURE_DAYS * DAY_MS),
  };
}

/**
 * "Sat 7 Nov · 9:00 am" — with the year when it isn't this year's
 * ("Sat 6 Mar 2027 · …"). Long form always has it.
 */
export function formatGameDateTime(
  d: Date,
  mode: "short" | "long",
  now: number = Date.now(),
  locale?: string,
): string {
  const otherYear = d.getFullYear() !== new Date(now).getFullYear();
  const dateOpts: Intl.DateTimeFormatOptions =
    mode === "long"
      ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
      : { weekday: "short", day: "numeric", month: "short", ...(otherYear ? { year: "numeric" } : {}) };
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return `${d.toLocaleDateString(locale, dateOpts)} · ${d.toLocaleTimeString(locale, timeOpts)}`;
}
