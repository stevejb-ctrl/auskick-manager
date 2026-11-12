// ─── A second tap on the same score chip ─────────────────────
// The other team's score chips write at once (ours open a scorer
// picker), so an anxious double tap recorded two goals at the same
// moment without a word (Stagehand round 8, 29 Oct 2026). No junior
// game scores twice for one team within a second, so a repeat of the
// same chip that soon is the same tap.

export const REPEAT_TAP_MS = 900;

/** A gate for chip taps: true lets the tap through, false is a repeat. */
export function repeatTapGate(windowMs = REPEAT_TAP_MS): (key: string, nowMs: number) => boolean {
  let last: { key: string; at: number } | null = null;
  return (key, nowMs) => {
    if (last && last.key === key && nowMs - last.at < windowMs) return false;
    last = { key, at: nowMs };
    return true;
  };
}
