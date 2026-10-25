/**
 * A whole number typed into a form, or why it isn't one. Round 3 edge
 * testing (24 Oct 2026): parseInt quietly turned jersey "1.5" into #1,
 * "e" into no number, and a 1.5-minute quarter into 1, all without a
 * word. Blank is no number (fields that are optional).
 */
export function parseWholeNumber(
  raw: string,
  opts: { min: number; max: number; what: string },
): { value: number | null; error?: string } {
  const s = raw.trim();
  if (s === "") return { value: null };
  const n = /^\d+$/.test(s) ? Number(s) : NaN;
  if (!Number.isInteger(n) || n < opts.min || n > opts.max) {
    return { value: null, error: `${opts.what} must be a whole number from ${opts.min} to ${opts.max}.` };
  }
  return { value: n };
}
