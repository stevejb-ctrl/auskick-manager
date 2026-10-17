import Link from "next/link";
import { SetupProgress } from "@/components/setup/SetupProgress";
import { TrackScoringToggle } from "@/components/games/TrackScoringToggle";
import {
  HowWePlayCard,
  type HowWePlayPosition,
  type HowWePlayRow,
} from "@/components/playbook/HowWePlayCard";
import { isSoccer, noSportBranch, periodLabels, sportNotBuilt } from "@/lib/sports";
import { rugbyPoints } from "@/lib/sports/rugby_league/fairness";
import type { AgeGroupConfig } from "@/lib/sports/types";
import type { Sport } from "@/lib/types";

interface ScoringStepProps {
  teamId: string;
  ageGroup: AgeGroupConfig;
  initialEnabled: boolean;
  /** The team's sport: each has its own scoring copy below. */
  sportId: Sport;
  /** The team's players on the field (its own, else the age group's): named positions are drawn for it. */
  onFieldSize: number;
  /** Saved How we play, or null for a new team (age-group defaults). */
  playbookRow?: HowWePlayRow | null;
  /** The team's own named positions (AFL open ages). */
  positions?: HowWePlayPosition[];
}

export function ScoringStep({
  teamId,
  ageGroup,
  initialEnabled,
  sportId,
  onFieldSize,
  playbookRow = null,
  positions = [],
}: ScoringStepProps) {
  // Football (soccer)'s setup copy is phase 3 (.planning/SOCCER-PLAN.md).
  if (isSoccer(sportId)) sportNotBuilt(sportId, "ScoringStep");

  // Rugby league has zero coach discretion on the scoring rule:
  // U6/U7 are tag (no scoreboard, ever), U8–U12 play modified tackle
  // with tries + conversions tracked, and U13+ plays international laws
  // (penalty and field goals too). createTeam pre-flips
  // track_scoring to match, so this step has nothing to toggle —
  // we just explain what's happening and move on. AFL, netball and
  // union keep the explicit toggle below (union's pathway keeps no
  // score to U11, but a competition can).
  const isRugbyLeague = sportId === "rugby_league";
  const rlScoringOn = isRugbyLeague && ageGroup.tracksScoreDefault === true;

  const blurb =
    sportId === "netball" ? (
      <>
        Modified-netball leagues often skip the scoreboard for the youngest age
        groups and switch it on once the kids move up. Flip this on if your
        league keeps a scoreboard —{" "}
        <strong className="text-ink">
          you can change it later on the Team tab
        </strong>
        .
      </>
    ) : isRugbyLeague ? (
      rlScoringOn && ageGroup.goalsFromPlay ? (
        // U13+ (Stagehand round 3: an Under 14 coach was told "modified
        // tackle, tries and conversions").
        <>
          {ageGroup.label} plays international laws, so tries (4 points),
          conversions (2 points), penalty goals (2 points) and field goals
          (1 point) are tracked automatically. The live screen will surface
          the score buttons and the post-game summary will include the
          result.
        </>
      ) : rlScoringOn ? (
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
          scoring buttons. Move up an age group from the Team tab if you
          switch to modified tackle.
        </>
      )
    ) : sportId === "rugby_union" ? (
      <UnionScoringBlurb ageGroup={ageGroup} />
    ) : sportId === "afl" ? (
      <>
        Most AFL juniors don&apos;t keep score up to U10, then scoring comes in
        around U11. Flip this on if your league keeps a scoreboard —{" "}
        <strong className="text-ink">
          you can change it later on the Team tab
        </strong>
        .
      </>
    ) : (
      noSportBranch(sportId, "ScoringStep")
    );

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <SetupProgress current="config" teamId={teamId} />

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-ink">How we play</h1>
        <p className="text-sm text-ink-dim">
          What {ageGroup.label} requires, and how you want kids to rotate. Change it any
          time from the Team tab.
        </p>
      </div>

      <HowWePlayCard
        teamId={teamId}
        sport={sportId}
        ageGroup={ageGroup.id}
        ageLabel={ageGroup.label}
        onFieldSize={onFieldSize}
        maxOnFieldSize={ageGroup.maxOnFieldSize}
        periodWord={periodLabels(sportId, ageGroup).label}
        row={playbookRow}
        positions={positions}
        isAdmin
        inWizard
      />

      <div className="space-y-2">
        <h2 className="text-base font-semibold text-ink">Scoring</h2>
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



      <div className="flex justify-end">
        <Link
          href={`/teams/${teamId}/setup?step=squad`}
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

/** Union's scoring copy, in its own points. */
function UnionScoringBlurb({ ageGroup }: { ageGroup: AgeGroupConfig }) {
  const pts = rugbyPoints("rugby_union");
  const goals = ageGroup.goalsFromPlay
    ? `, penalty goals (${pts.penaltyGoal}) and drop goals (${pts.fieldGoal})`
    : "";
  return ageGroup.tracksScoreDefault ? (
    <>
      {ageGroup.label} keeps score: tries ({pts.try} points), conversions ({pts.conversion}){goals}. The live
      screen shows the score buttons and the post-game summary includes the result.
    </>
  ) : (
    <>
      Rugby Australia&apos;s pathway keeps no score before Under 12, so {ageGroup.label} starts with no
      scoreboard. Flip this on if your competition keeps one: tries ({pts.try} points),
      conversions ({pts.conversion}){goals} —{" "}
      <strong className="text-ink">you can change it later on the Team tab</strong>.
    </>
  );
}
