"use client";

import { useState } from "react";
import { CreateGameForm } from "@/components/games/CreateGameForm";
import { ImportFixturesButton } from "@/components/games/ImportFixturesButton";
import { Button } from "@/components/ui/Button";

import { Modal } from "@/components/ui/Modal";
interface Props {
  teamId: string;
  existingExternalIds: string[];
  initialUrl?: string;
  /** The sport's PlayHQ tenant; null where the sport isn't on PlayHQ (league). */
  playhqTenant: string | null;
  /** What the manual create form does afterwards (see createGame). */
  afterCreate?: "open-game" | "stay";
  /** The team's name, for the same-name opponent warning. */
  teamName?: string;
  /**
   * The season already has games: open as one "+ Add games" button
   * rather than the big card (design review, Oct 2026: it sat above the
   * season, with a green primary button, after every fixture was in).
   */
  compact?: boolean;
}

export function AddGameSection({
  teamId,
  existingExternalIds,
  initialUrl = "",
  playhqTenant,
  afterCreate = "open-game",
  teamName,
  compact = false,
}: Props) {
  const [showManual, setShowManual] = useState(false);

  return (
    // With games in, the same two buttons in one quiet row, no card or
    // explanation: the season is what the page is for.
    <div className={compact ? "" : "rounded-lg border border-hairline bg-surface p-4 shadow-card sm:p-5"}>
      {!compact && (
        <>
          <h2 className="text-base font-semibold text-ink">Add games</h2>
          <p className="mt-1 text-xs text-ink-mute">
            {playhqTenant
              ? "Importing from PlayHQ keeps opponents, rounds and kickoff times in sync with your league fixtures."
              : "Add each game from your fixture: opponent, round and kickoff time."}
          </p>
        </>
      )}

      <div className={compact ? "flex flex-wrap gap-2" : "mt-4 flex flex-col gap-2 sm:flex-row"}>
        {playhqTenant && (
          <ImportFixturesButton
            teamId={teamId}
            existingExternalIds={existingExternalIds}
            initialUrl={initialUrl}
            tenant={playhqTenant}
            variant={compact ? "secondary" : "primary"}
            size={compact ? "sm" : "md"}
            className={compact ? "" : "sm:flex-1"}
          />
        )}
        <Button
          type="button"
          variant={playhqTenant || compact ? "secondary" : "primary"}
          size={compact ? "sm" : "md"}
          onClick={() => setShowManual(true)}
          className={compact ? "" : "sm:flex-1"}
        >
          Create manually
        </Button>
      </div>

      {showManual && (
        <Modal size="lg" label="Create a game" onClose={() => setShowManual(false)} className="overflow-y-auto">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-ink">
                  Create a game
                </h3>
                <p className="mt-1 text-xs text-ink-mute">
                  {playhqTenant ? "Use this for friendlies or games not in PlayHQ." : "One game from your fixture, or a friendly."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowManual(false)}
                className="text-ink-mute hover:text-ink"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <CreateGameForm
              teamName={teamName}
              teamId={teamId}
              onCancel={() => setShowManual(false)}
              afterCreate={afterCreate}
              onCreated={() => setShowManual(false)}
            />
          </Modal>
      )}
    </div>
  );
}
