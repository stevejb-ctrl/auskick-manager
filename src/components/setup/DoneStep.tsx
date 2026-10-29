import Link from "next/link";
import { SetupProgress } from "@/components/setup/SetupProgress";

interface DoneStepProps {
  teamId: string;
  teamName: string;
  playerCount: number;
  gameCount: number;
  scoringEnabled: boolean;
  /**
   * A touch or Oztag mixed team: how many of the squad are marked Girl
   * or Boy (the rule can't keep its cap without it). Null otherwise.
   */
  mixedMarked?: number | null;
}

export function DoneStep({
  teamId,
  teamName,
  playerCount,
  gameCount,
  scoringEnabled,
  mixedMarked = null,
}: DoneStepProps) {
  // Pluralisation helper — keeps the summary copy natural.
  const pl = (n: number, s: string, p: string = s + "s") =>
    `${n} ${n === 1 ? s : p}`;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <SetupProgress current="done" teamId={teamId} />

      <div className="space-y-3 text-center">
        <div
          aria-hidden
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-3xl"
        >
          🎉
        </div>
        <h1 className="text-3xl font-bold tracking-tightest text-ink">
          You&rsquo;re all set, Coach
        </h1>
        <p className="mx-auto max-w-md text-base text-ink-dim">
          <strong className="text-ink">{teamName}</strong> is ready for
          round 1. Here&rsquo;s what you locked in:
        </p>
      </div>

      {/* Summary card */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-hairline bg-surface p-4 text-center shadow-card">
          <p className="text-2xl font-bold text-ink">{playerCount}</p>
          <p className="mt-0.5 text-micro font-medium uppercase tracking-micro text-ink-mute">
            {playerCount === 1 ? "Player" : "Players"}
          </p>
        </div>
        <div className="rounded-lg border border-hairline bg-surface p-4 text-center shadow-card">
          <p className="text-2xl font-bold text-ink">{gameCount}</p>
          <p className="mt-0.5 text-micro font-medium uppercase tracking-micro text-ink-mute">
            {gameCount === 1 ? "Game" : "Games"}
          </p>
        </div>
        <div className="rounded-lg border border-hairline bg-surface p-4 text-center shadow-card">
          <p className="text-2xl font-bold text-ink">
            {scoringEnabled ? "On" : "Off"}
          </p>
          <p className="mt-0.5 text-micro font-medium uppercase tracking-micro text-ink-mute">
            Scoring
          </p>
        </div>
      </div>

      {/* A mixed team with kids not yet marked: the rule needs it
          before the first game (the lineup asks again if not). */}
      {mixedMarked !== null && playerCount > 0 && mixedMarked < playerCount && (
        <div
          data-testid="setup-mixed-nudge"
          className="rounded-lg border border-warn/40 bg-warn-soft/60 p-5 shadow-card"
        >
          <h2 className="text-base font-semibold text-ink">
            {mixedMarked} of {playerCount} marked Girl or Boy
          </h2>
          <p className="mt-1 text-sm text-ink-dim">
            The mixed rule caps the boys on the field, so Siren needs to know who
            counts as which. It&rsquo;s only used for the rule, and shows nowhere else.
          </p>
          <Link
            href={`/teams/${teamId}/setup?step=squad`}
            className="mt-3 inline-flex items-center justify-center rounded-md border border-hairline bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
          >
            Mark the squad
          </Link>
        </div>
      )}

      {/* Next steps card */}
      <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
        <h2 className="text-base font-semibold text-ink">
          Two quick wins before Saturday
        </h2>
        <ul className="mt-3 space-y-3 text-sm text-ink-dim">
          <li className="flex gap-2">
            <span aria-hidden className="mt-0.5 text-brand-600">•</span>
            <span>
              <strong className="text-ink">Invite a manager</strong> so
              you&rsquo;ve got backup when you can&rsquo;t be on the sideline.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="mt-0.5 text-brand-600">•</span>
            <span>
              <strong className="text-ink">Ask parents who&rsquo;s in.</strong>{" "}
              Each game has an availability link to share in the group chat:
              parents tap In or Out for their child, no account needed. Find
              it on the game&rsquo;s page under &ldquo;Ask parents who&rsquo;s in&rdquo;.
            </span>
          </li>
        </ul>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        {/* Straight to People with the invite form open: it used to land
            at the top of Team settings, three screens above People. */}
        <Link
          href={`/teams/${teamId}/settings?invite=1#people`}
          className="inline-flex items-center justify-center rounded-md border border-hairline bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
        >
          Invite a manager
        </Link>
        <Link
          href={`/teams/${teamId}`}
          className="inline-flex items-center justify-center rounded-md bg-brand-600 px-5 py-2.5 text-sm font-medium text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
        >
          Open {teamName}
        </Link>
      </div>

      {/* Low-signal guard: keep `pl` referenced so the helper doesn't
          get stripped by unused-var lint. Used in title copy below. */}
      <p className="sr-only">
        Summary: {pl(playerCount, "player")}, {pl(gameCount, "game")},
        scoring {scoringEnabled ? "on" : "off"}.
      </p>
    </div>
  );
}
