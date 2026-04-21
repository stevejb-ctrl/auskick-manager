import Link from "next/link";
import { SetupProgress } from "@/components/setup/SetupProgress";
import { TrackScoringToggle } from "@/components/games/TrackScoringToggle";
import { AGE_GROUPS } from "@/lib/ageGroups";
import type { AgeGroup } from "@/lib/types";

interface ScoringStepProps {
  teamId: string;
  ageGroup: AgeGroup;
  initialEnabled: boolean;
}

export function ScoringStep({ teamId, ageGroup, initialEnabled }: ScoringStepProps) {
  const cfg = AGE_GROUPS[ageGroup];

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <SetupProgress current="config" teamId={teamId} />

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-ink">How we play</h1>
        <p className="text-sm text-ink-dim">
          Most AFL juniors don&apos;t keep score up to U10, then scoring comes
          in around U11. Flip this on if your league keeps a scoreboard —{" "}
          <strong className="text-ink">
            you can update it later in Settings if you change your mind
          </strong>
          .
        </p>
        <p className="text-xs text-ink-mute">
          Default for {cfg.label}: {cfg.tracksScoreDefault ? "on" : "off"}.
        </p>
      </div>

      <TrackScoringToggle
        teamId={teamId}
        initialEnabled={initialEnabled}
        isAdmin
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Link
          href={`/teams/${teamId}`}
          className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-surface-alt hover:text-ink"
        >
          Skip for now
        </Link>
        <Link
          href={`/teams/${teamId}/setup?step=squad`}
          className="inline-flex items-center justify-center rounded-md bg-brand-600 px-5 py-2.5 text-sm font-medium text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
        >
          Continue
        </Link>
      </div>
    </div>
  );
}
