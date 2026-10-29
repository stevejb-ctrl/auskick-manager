// ─── Scores from the other phone ─────────────────────────────
// Two parents on one link each saw scores change "by themselves" and
// undid them as mistakes: nothing said another phone was scoring
// (Stagehand round 8, #6). This phone remembers the writes it made (the
// write queue's keys); a score that syncs in with any other key, after
// the page opened, came from another phone.

interface ScoreEventLike {
  id: string;
  type: string;
  idempotency_key?: string | null;
  created_at: string;
}

const own = new Set<string>();

/** The write queue's key for a write this phone made. */
export function rememberOwnWrite(key: string): void {
  own.add(key);
}

export function isOwnWrite(key: string | null | undefined): boolean {
  return !!key && own.has(key);
}

// Fix scores writes without the queue (no key): its scores are this
// phone's, so the notice keeps quiet while they sync back.
let quietUntil = 0;
export function quietOtherPhoneNotices(forMs = 15_000, nowMs = Date.now()): void {
  quietUntil = nowMs + forMs;
}
export function otherPhoneNoticesQuiet(nowMs = Date.now()): boolean {
  return nowMs < quietUntil;
}

/**
 * The score events in `events` not seen before, from another phone, since
 * `sinceIso` (the page opening). Marks every score seen.
 */
export function newOtherPhoneScores<E extends ScoreEventLike>(
  events: readonly E[],
  scoreTypes: ReadonlySet<string>,
  seen: Set<string>,
  sinceIso: string,
  ownWrite: (key: string | null | undefined) => boolean = isOwnWrite,
): E[] {
  const out: E[] = [];
  for (const ev of events) {
    if (!scoreTypes.has(ev.type) || seen.has(ev.id)) continue;
    seen.add(ev.id);
    // A phone's own optimistic copy has no saved id yet; skip both.
    if (ev.id.startsWith("optimistic") || ownWrite(ev.idempotency_key)) continue;
    if (ev.created_at < sinceIso) continue;
    out.push(ev);
  }
  return out;
}

/** "Sharks goal", "Roos 2-pointer": a score event, in plain words. */
export function describeScoreEvent(type: string, teamName: string, opponentName: string): string {
  const theirs = type.startsWith("opponent_");
  const what = type
    .replace(/^opponent_/, "")
    .replace("two_pointer", "2-pointer")
    .replace("three_pointer", "3-pointer")
    .replace("conversion_attempt", "conversion")
    .replace(/_/g, " ");
  return `${theirs ? opponentName : teamName} ${what}`;
}
