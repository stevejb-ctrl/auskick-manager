import Link from "next/link";
import { SetupProgress } from "@/components/setup/SetupProgress";

interface DoneStepProps {
  teamId: string;
  teamName: string;
  playerCount: number;
  gameCount: number;
  scoringEnabled: boolean;
}

export function DoneStep({
  teamId,
  teamName,
  playerCount,
  gameCount,
  scoringEnabled,
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
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-micro text-ink-mute">
            {playerCount === 1 ? "Player" : "Players"}
          </p>
        </div>
        <div className="rounded-lg border border-hairline bg-surface p-4 text-center shadow-card">
          <p className="text-2xl font-bold text-ink">{gameCount}</p>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-micro text-ink-mute">
            {gameCount === 1 ? "Game" : "Games"}
          </p>
        </div>
        <div className="rounded-lg border border-hairline bg-surface p-4 text-center shadow-card">
          <p className="text-2xl font-bold text-ink">
            {scoringEnabled ? "On" : "Off"}
          </p>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-micro text-ink-mute">
            Scoring
          </p>
        </div>
      </div>

      {/* Next steps card */}
      <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
        <h2 className="text-base font-semibold text-ink">
          Two quick wins before Saturday
        </h2>
        <ul className="mt-3 space-y-3 text-sm text-ink-dim">
          <li className="flex gap-2">
            <span aria-hidden className="mt-0.5 text-brand-600">•</span>
            <span>
              <strong className="text-ink">Invite a co-manager</strong> so
              you&rsquo;ve got backup when you can&rsquo;t be on the sideline.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="mt-0.5 text-brand-600">•</span>
            <span>
              <strong className="text-ink">Share availability</strong> with
              parents so you know who&rsquo;s playing before match day.
            </span>
          </li>
        </ul>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Link
          href={`/teams/${teamId}/settings`}
          className="inline-flex items-center justify-center rounded-md border border-hairline bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
        >
          Invite a co-manager
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
