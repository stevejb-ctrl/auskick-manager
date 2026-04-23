import Link from "next/link";
import { SetupProgress } from "@/components/setup/SetupProgress";
import { AddGameSection } from "@/components/games/AddGameSection";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import type { AgeGroupConfig } from "@/lib/sports/types";

interface GameSummary {
  id: string;
  opponent: string;
  scheduled_at: string;
  round_number: number | null;
  location: string | null;
}

interface GamesStepProps {
  teamId: string;
  ageGroup: AgeGroupConfig;
  existingExternalIds: string[];
  playhqUrl: string;
  games: GameSummary[];
}

export function GamesStep({
  teamId,
  ageGroup,
  existingExternalIds,
  playhqUrl,
  games,
}: GamesStepProps) {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <SetupProgress current="games" teamId={teamId} />

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-ink">Add games</h1>
        <p className="text-sm text-ink-dim">
          Importing from PlayHQ pulls in rounds, opponents, and kickoff times
          in one go and keeps them in sync if the league reschedules. Use
          &ldquo;Create manually&rdquo; for friendlies or pre-season hit-outs.
          You can always add more games later from the Games tab.
        </p>
      </div>

      <AddGameSection
        teamId={teamId}
        ageGroup={ageGroup}
        existingExternalIds={existingExternalIds}
        initialUrl={playhqUrl}
      />

      <div className="rounded-lg border border-hairline bg-surface shadow-card">
        <div className="border-b border-hairline px-4 py-3">
          <h2 className="text-base font-semibold text-ink">
            Scheduled ({games.length})
          </h2>
        </div>
        {games.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-mute">
            No games yet — import from PlayHQ or create one manually above.
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

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Link
          href={`/teams/${teamId}`}
          className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-surface-alt hover:text-ink"
        >
          Skip for now
        </Link>
        <Link
          href={`/teams/${teamId}/setup?step=done`}
          className="inline-flex items-center justify-center rounded-md bg-brand-600 px-5 py-2.5 text-sm font-medium text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
        >
          Continue
        </Link>
      </div>
    </div>
  );
}
