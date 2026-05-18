import Link from "next/link";
import { SetupProgress } from "@/components/setup/SetupProgress";
import { TrackScoringToggle } from "@/components/games/TrackScoringToggle";
import { QuarterLengthInput } from "@/components/team/QuarterLengthInput";
import type { AgeGroupConfig } from "@/lib/sports/types";
import type { Sport } from "@/lib/types";

interface ScoringStepProps {
  teamId: string;
  ageGroup: AgeGroupConfig;
  initialEnabled: boolean;
  /**
   * Sport-aware copy around scoring. AFL and rugby_league use the
   * "track goals & behinds / track tries" framing in the default
   * branch; netball gets its own copy below. Rugby-league-specific
   * blurb lands in the team-setup phase (Phase 2 of the RL plan).
   */
  sportId?: Sport;
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
  // Rugby league has zero coach discretion on the scoring rule:
  // U6/U7 are tag (no scoreboard, ever), U8+ play modified tackle
  // with tries + conversions tracked. createTeam pre-flips
  // track_scoring to match, so this step has nothing to toggle —
  // we just explain what's happening and move on. AFL and netball
  // keep the explicit toggle below.
  const isRugbyLeague = sportId === "rugby_league";
  const rlScoringOn = isRugbyLeague && ageGroup.tracksScoreDefault === true;

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
    ) : isRugbyLeague ? (
      rlScoringOn ? (
        <>
          {ageGroup.label} plays modified tackle, so tries (4 points) and
          conversions (2 points) are tracked automatically. The live screen
          will surface the score buttons and the post-game summary will
          include the result.
        </>
      ) : (
        <>
          {ageGroup.label} is tag rugby — the laws ban scoring at this age.
          No scoreboard, no conversions. The live screen will hide the
          scoring buttons. Move up an age group from Settings if you
          switch to modified tackle.
        </>
      )
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
        {!isRugbyLeague && (
          <p className="text-xs text-ink-mute">
            Default for {ageGroup.label}: {ageGroup.tracksScoreDefault ? "on" : "off"}.
          </p>
        )}
      </div>

      {!isRugbyLeague && (
        <TrackScoringToggle
          teamId={teamId}
          initialEnabled={initialEnabled}
          isAdmin
          sportId={sportId}
        />
      )}

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
