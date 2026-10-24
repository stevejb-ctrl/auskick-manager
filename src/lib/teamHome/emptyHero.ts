// ─── Team home with nothing upcoming ─────────────────────────
// Only the coach adds games, so only the coach gets the button (round 2
// usability, 24 Oct 2026: a parent's "Add a game" dead-ended on a games
// list they can't add to). After a game it's the next one, never the
// first, and it's the page's only "add a game" button.

export interface EmptyHeroCopy {
  title: string;
  body: string;
  /** The button's label, or null for people who can't add games. */
  cta: string | null;
}

export function emptyHeroCopy(input: { canAddGames: boolean; hasPlayed: boolean }): EmptyHeroCopy {
  if (!input.canAddGames) {
    return {
      title: "No upcoming games",
      body: "Your coach will add the next one, and it'll show here.",
      cta: null,
    };
  }
  if (input.hasPlayed) {
    return {
      title: "No upcoming games",
      body: "Add your next game to plan its lineup and ask parents who's in.",
      cta: "Add your next game",
    };
  }
  return {
    title: "No upcoming games",
    body: "Add your first game to start tracking availability and lineups.",
    cta: "Add a game",
  };
}
