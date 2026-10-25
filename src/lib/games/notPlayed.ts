// A game the coach never ran. Round 3 edge testing (24 Oct 2026): last
// Saturday's game, washed out or played without the app, stayed "Next
// up" on Today and the dashboard forever, over the game that really was
// next. Once it's well past its start and was never started, it moves
// out of Next up into a "Not played" list: delete it, or mark it played.
//
// "Well past" is twelve hours, not "before today": servers run in UTC,
// and a 9 am Saturday game in Sydney is Friday night there.

const NOT_PLAYED_AFTER_MS = 12 * 3_600_000;

interface Scheduled {
  status: string;
  scheduled_at: string;
}

/** The scheduled time before which a never-started game is "not played". */
export function notPlayedCutoffIso(now: number = Date.now()): string {
  return new Date(now - NOT_PLAYED_AFTER_MS).toISOString();
}

export function isNotPlayed(g: Scheduled, now: number = Date.now()): boolean {
  return g.status === "upcoming" && new Date(g.scheduled_at).getTime() < now - NOT_PLAYED_AFTER_MS;
}

/** Live and still-to-come games (in their order), and the missed ones. */
export function splitByNotPlayed<G extends Scheduled>(games: G[], now: number = Date.now()): { next: G[]; notPlayed: G[] } {
  const next: G[] = [];
  const notPlayed: G[] = [];
  for (const g of games) {
    if (g.status === "completed") continue;
    (isNotPlayed(g, now) ? notPlayed : next).push(g);
  }
  return { next, notPlayed };
}

/**
 * The game was run in Siren: it kicked off. A game marked played (it
 * happened, without the app) has no events, so no score or minutes: it
 * isn't a 0–0 draw.
 */
export function playedInSiren(events: { type: string }[]): boolean {
  return events.some((e) => e.type === "quarter_start" || e.type === "game_finalised");
}
