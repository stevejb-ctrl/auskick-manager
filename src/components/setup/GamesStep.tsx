import Link from "next/link";
import { SetupProgress } from "@/components/setup/SetupProgress";
import { AddGameSection } from "@/components/games/AddGameSection";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";

interface GameSummary {
  id: string;
  opponent: string;
  scheduled_at: string;
  round_number: number | null;
  location: string | null;
}

interface GamesStepProps {
  teamId: string;
  existingExternalIds: string[];
  playhqUrl: string;
  /** The sport's PlayHQ tenant; null where the sport isn't on PlayHQ (league). */
  playhqTenant: string | null;
  games: GameSummary[];
}

export function GamesStep({
  teamId,
  existingExternalIds,
  playhqUrl,
  playhqTenant,
  games,
}: GamesStepProps) {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <SetupProgress current="games" teamId={teamId} />

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-ink">Add games</h1>
        <p className="text-sm text-ink-dim">
          {playhqTenant ? (
            <>
              Importing from PlayHQ pulls in rounds, opponents, and kickoff times
              in one go and keeps them in sync if the league reschedules. Use
              &ldquo;Create manually&rdquo; for friendlies or pre-season hit-outs.
            </>
          ) : (
            <>Add the games from your fixture: opponent, round and kickoff time.</>
          )}{" "}
          You can always add more games later from the Games tab.
        </p>
      </div>

      <AddGameSection
        teamId={teamId}
        existingExternalIds={existingExternalIds}
        initialUrl={playhqUrl}
        playhqTenant={playhqTenant}
        afterCreate="stay"
      />

      <div className="rounded-lg border border-hairline bg-surface shadow-card">
        <div className="border-b border-hairline px-4 py-3">
          <h2 className="text-base font-semibold text-ink">
            Scheduled ({games.length})
          </h2>
        </div>
        {games.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-mute">
            {playhqTenant
              ? "No games yet — import from PlayHQ or create one manually above."
              : "No games yet — create one above."}
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {games.map((game) => (
              <li
                key={game.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {game.round_number != null && (
                      <span className="text-[11px] font-semibold uppercase tracking-micro text-brand-600">
                        Rnd {game.round_number}
                      </span>
                    )}
                    <span className="truncate font-medium text-ink">
                      vs {game.opponent}
                    </span>
                  </div>
                  <p className="text-xs text-ink-mute">
                    <FormattedDateTime iso={game.scheduled_at} mode="short" />
                    {game.location && ` · ${game.location}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end">
        <Link
          href={`/teams/${teamId}/setup?step=done`}
          className="inline-flex items-center justify-center rounded-md bg-brand-600 px-5 py-2.5 text-sm font-medium text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
        >
          Continue
        </Link>
      </div>

      {/* Skip-for-now — small ghost link separated from the
          Continue CTA so it doesn't read as a competing primary
          action and can't be mistapped on mobile. Steve 2026-05-20. */}
      <div className="flex justify-center pt-2">
        <Link
          href={`/teams/${teamId}`}
          className="text-xs font-medium text-ink-mute underline-offset-4 hover:text-ink hover:underline"
        >
          Skip onboarding for now
        </Link>
      </div>
    </div>
  );
}
