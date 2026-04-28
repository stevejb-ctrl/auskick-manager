import Link from "next/link";
import { SetupProgress } from "@/components/setup/SetupProgress";
import { TrackScoringToggle } from "@/components/games/TrackScoringToggle";
import { QuarterLengthInput } from "@/components/team/QuarterLengthInput";
import type { AgeGroupConfig } from "@/lib/sports/types";

interface ScoringStepProps {
  teamId: string;
  ageGroup: AgeGroupConfig;
  initialEnabled: boolean;
  /** Sport-aware copy around scoring (AFL vs netball framing). */
  sportId?: "afl" | "netball";
  /** Current quarter-length override in seconds, or null to use age-group default. */
  initialQuarterLengthSeconds?: number | null;
}

export function ScoringStep({
  teamId,
  ageGroup,
  initialEnabled,
  sportId = "afl",
  initialQuarterLengthSeconds = null,
}: ScoringStepProps) {
  const blurb =
    sportId === "netball" ? (
      <>
        Modified-netball leagues often skip the scoreboard for the youngest age
        groups and switch it on once the kids move up. Flip this on if your
        league keeps a scoreboard —{" "}
        <strong className="text-ink">
          you can update it later in Settings if you change your mind
        </strong>
        .
      </>
    ) : (
      <>
        Most AFL juniors don&apos;t keep score up to U10, then scoring comes in
        around U11. Flip this on if your league keeps a scoreboard —{" "}
        <strong className="text-ink">
          you can update it later in Settings if you change your mind
        </strong>
        .
      </>
    );

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <SetupProgress current="config" teamId={teamId} />

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-ink">How we play</h1>
        <p className="text-sm text-ink-dim">{blurb}</p>
        <p className="text-xs text-ink-mute">
          Default for {ageGroup.label}: {ageGroup.tracksScoreDefault ? "on" : "off"}.
        </p>
      </div>

      <TrackScoringToggle
        teamId={teamId}
        initialEnabled={initialEnabled}
        isAdmin
        sportId={sportId}
      />

      {/* Quarter-length override is a netball-only knob today — junior
          netball leagues vary so much region-to-region that the
          age-group default rarely fits everyone. AFL keeps its
          age-group quarters as the source of truth. */}
      {sportId === "netball" && (
        <QuarterLengthInput
          teamId={teamId}
          ageGroupDefaultSeconds={ageGroup.periodSeconds}
          initialOverrideSeconds={initialQuarterLengthSeconds}
        />
      )}

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
