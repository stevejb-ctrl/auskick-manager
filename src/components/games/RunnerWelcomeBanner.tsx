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
// Only rendered on the pre-kickoff state (game not yet started).
// Once the lineup is set + Q1 kicks off, the in-game chrome
// (LiveTopBar / scorebug) carries the orientation forward.

interface RunnerWelcomeBannerProps {
  /** Team name — surfaces "You're running scoring for {teamName} today." */
  teamName: string;
  /** True when the team has track_scoring off — copy flips from
   *  "tap goals" to "track substitutions" so the message matches
   *  what the parent will actually be doing during the game. */
  trackScoring: boolean;
}

export function RunnerWelcomeBanner({
  teamName,
  trackScoring,
}: RunnerWelcomeBannerProps) {
  return (
    <section
      className="rounded-md border border-brand-200 bg-brand-50 p-4 text-sm text-ink"
      aria-label="Welcome — getting started"
    >
      <p className="font-semibold text-ink">
        You&apos;re running today&apos;s game for {teamName}.
      </p>
      <p className="mt-1 text-ink-dim">
        Quick rundown — three steps:
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-dim">
        <li>
          <span className="font-medium text-ink">Mark who&apos;s here</span>{" "}
          using the list below. Tap &quot;Mark available&quot; next to each
          kid who turned up.
        </li>
        <li>
          <span className="font-medium text-ink">Set the starting
          lineup</span>{" "}
          — we&apos;ll suggest a fair one. You can swap players if you
          like, or just tap Ready.
        </li>
        <li>
          <span className="font-medium text-ink">
            {trackScoring
              ? "Tap goals + substitutions"
              : "Tap substitutions"}
          </span>{" "}
          as they happen. Everything saves automatically — you can
          close the tab and come back if you need to.
        </li>
      </ol>
    </section>
  );
}
