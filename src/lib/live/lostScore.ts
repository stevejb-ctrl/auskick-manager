// ─── A score the other phone's period end cut off ────────────
// Two parents on one link: one ends the quarter while the other has the
// "Who scored?" sheet open. The second phone's live screen became the
// break, the sheet went with it, and the goal they were picking was
// never saved, without a word (Stagehand round 8, 29 Oct 2026, #3). A
// scorer sheet that closes without a pick or a cancel notes it here,
// and the break says so.

let lost: { what: string; at: number } | null = null;

/** The sheet for `what` ("goal", "try") closed with nobody picked. */
export function markLostScore(what: string, nowMs = Date.now()): void {
  lost = { what, at: nowMs };
}

/** The score cut off in the last `maxAgeMs`, once: the break shows it, then it's gone. */
export function takeLostScore(maxAgeMs = 30_000, nowMs = Date.now()): string | null {
  const l = lost;
  lost = null;
  return l && nowMs - l.at <= maxAgeMs ? l.what : null;
}

/** The break's words for it. */
export function lostScoreText(what: string): string {
  // The other phone, or this one's own clock at the hooter: either way.
  return `The period ended while you were adding a ${what}, so it wasn't saved. Add it with Fix scores.`;
}
