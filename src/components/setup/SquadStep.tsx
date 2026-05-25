import Link from "next/link";
import { SetupProgress } from "@/components/setup/SetupProgress";
import { AddPlayerForm } from "@/components/squad/AddPlayerForm";
import { PlayerRow } from "@/components/squad/PlayerRow";
import type { ChipKey, ChipMode } from "@/lib/chips";
import type { AgeGroupConfig } from "@/lib/sports/types";
import type { Player, Sport } from "@/lib/types";

interface SquadStepProps {
  teamId: string;
  ageGroup: AgeGroupConfig;
  players: Player[];
  /**
   * AFL + rugby league show jersey numbers (jersey-driven sports);
   * netball doesn't (positions are letter-coded). Steve 2026-05-20:
   * RL falls into the jersey-showing branch so the add-player form
   * surfaces the jersey input that the lineup picker + tile time
   * readouts rely on.
   */
  sportId?: Sport;
  /**
   * Team chip labels (set in the previous "How we play" step). When
   * any label is non-null we expose the chip picker on the add-player
   * form and surface chip indicators on existing rows, so coaches can
   * tag cohorts as they build the squad without leaving onboarding.
   * Steve 2026-05-20.
   */
  chipLabels?: { a: string | null; b: string | null; c: string | null };
  chipModes?: Partial<Record<ChipKey, ChipMode>>;
}

export function SquadStep({
  teamId,
  ageGroup,
  players,
  sportId = "afl",
  chipLabels,
  chipModes,
}: SquadStepProps) {
  // AFL + rugby league show jersey numbers (jersey-driven sports);
  // netball doesn't (positions are letter-coded). RL falls into the
  // jersey-showing branch so the add-player form surfaces the
  // jersey input that the lineup picker + tile time readouts rely
  // on. Steve 2026-05-20.
  const showJersey = sportId === "afl" || sportId === "rugby_league";
  const maxPlayers = ageGroup.maxSquadSize;
  const activePlayers = players.filter((p) => p.is_active);
  const takenJerseys = players.map((p) => p.jersey_number).filter((n): n is number => n !== null);
  const chipsConfigured = !!(chipLabels && (chipLabels.a || chipLabels.b || chipLabels.c));

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <SetupProgress current="squad" teamId={teamId} />

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-ink">Add the squad</h1>
        <p className="text-sm text-ink-dim">
          Add the regulars you know are signed up. You can add more players
          anytime, and fill-ins can jump in on match day without joining the
          permanent roster. 15–20 kids gives you plenty of cover for injuries
          and missed Saturdays.
        </p>
      </div>

      <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
        <h2 className="mb-1 text-base font-semibold text-ink">Add player</h2>
        {chipsConfigured && (
          <p className="mb-4 text-xs text-ink-mute">
            You have chips set up — tag each player as you go, or leave
            the chip picker blank and assign later from the squad page.
          </p>
        )}
        <AddPlayerForm
          teamId={teamId}
          activeCount={activePlayers.length}
          maxPlayers={maxPlayers}
          takenJerseys={takenJerseys}
          showJersey={showJersey}
          chipLabels={chipLabels}
          chipModes={chipModes}
        />
      </div>

      <div className="rounded-lg border border-hairline bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <h2 className="text-base font-semibold text-ink">
            Squad ({activePlayers.length})
          </h2>
          <span className="text-xs text-ink-mute">max {maxPlayers}</span>
        </div>
        {activePlayers.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-mute">
            No players yet — add your first one above.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {activePlayers.map((player) => (
              <PlayerRow
                key={player.id}
                player={player}
                teamId={teamId}
                takenJerseys={takenJerseys}
                canEdit
                showJersey={showJersey}
                chipLabels={chipLabels}
                chipModes={chipModes}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end">
        <Link
          href={`/teams/${teamId}/setup?step=games`}
          className="inline-flex items-center justify-center rounded-md bg-brand-600 px-5 py-2.5 text-sm font-medium text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
        >
          Continue
        </Link>
      </div>

      {/* Skip-for-now lives separated from the Continue button —
          previously stacked together and easy to mistap on mobile.
          Now sits as a small ghost link AFTER an explicit visual
          gap, with extra `mt-6` breathing room and centred text so
          it reads as an unstyled-link-ish escape route, not a
          competing CTA. Steve 2026-05-20. */}
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
