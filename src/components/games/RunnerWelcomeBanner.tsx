// ─── Runner Welcome Banner ───────────────────────────────────
// First-screen orientation for a parent volunteer who got a
// share-link text from the coach and just tapped it. Without
// this banner, the parent lands on a page with a wordmark, a
// game-info strip, and a list of player names — and has no idea
// what app they're in or what they're supposed to do.
//
// Steve 2026-05-13 usability test: Lisa (parent-runner persona)
// flagged this as the single most damaging moment of her whole
// journey — she burned 15-20s scrolling, trying to figure out
// "am I in the right place?". Three-line plain-English
// orientation removes that.
//
// Rendered on every pre-kickoff screen of the game-day link, in every
// sport: it names the team and the game. UX round 2 (24 Oct 2026):
// netball's only showed when too few kids were marked in, so it never
// did, and the steps described a list and a "Ready" button that
// weren't on the screen. The steps now follow the screen: the list
// below, or the lineup's "Update availability" link; the sport's own
// Start button.
//
// Once the lineup is set + Q1 kicks off, the in-game chrome
// (LiveTopBar / scorebug) carries the orientation forward.

interface RunnerWelcomeBannerProps {
  /** Team name — surfaces "You're running today's game for {teamName}." */
  teamName: string;
  /** The opposition, so the parent knows it's the right game. */
  opponent?: string | null;
  /** False when the team has track_scoring off — copy drops "scores"
   *  so the message matches what the parent will actually be doing
   *  during the game. ("Scores", not "goals": league scores tries.) */
  trackScoring: boolean;
  /** The first period as the Start button says it ("Q1", "H1"). */
  firstPeriod?: string;
  /**
   * Where the parent marks who's here: the list under this banner, or
   * the "Update availability" link at the top of the lineup.
   */
  availability?: "list" | "link";
}

export function RunnerWelcomeBanner({
  teamName,
  opponent,
  trackScoring,
  firstPeriod = "Q1",
  availability = "list",
}: RunnerWelcomeBannerProps) {
  return (
    <section
      className="rounded-md border border-brand-200 bg-brand-50 p-4 text-sm text-ink"
      aria-label="Welcome — getting started"
    >
      <p className="font-semibold text-ink">
        You&apos;re running today&apos;s game for {teamName}
        {opponent ? ` vs ${opponent}` : ""}.
      </p>
      <p className="mt-1 text-ink-dim">
        Quick rundown — three steps:
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-dim">
        {availability === "list" ? (
          <li>
            <span className="font-medium text-ink">Mark who&apos;s here</span>{" "}
            using the list below. Tap &quot;In&quot; next to each kid who
            turned up.
          </li>
        ) : (
          <li>
            <span className="font-medium text-ink">Check who&apos;s here.</span>{" "}
            A player didn&apos;t turn up? Tap &quot;Update availability&quot;
            above the lineup to mark them out.
          </li>
        )}
        <li>
          <span className="font-medium text-ink">Set the starting
          lineup</span>{" "}
          — we&apos;ll suggest a fair one. You can swap players if you
          like, or just tap Start {firstPeriod}.
        </li>
        <li>
          <span className="font-medium text-ink">
            {trackScoring
              ? "Tap scores + substitutions"
              : "Tap substitutions"}
          </span>{" "}
          as they happen. Everything saves automatically — you can
          close the tab and come back if you need to.
        </li>
      </ol>
    </section>
  );
}
