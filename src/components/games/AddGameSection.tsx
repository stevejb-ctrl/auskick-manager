"use client";

import { useState } from "react";
import { CreateGameForm } from "@/components/games/CreateGameForm";
import { ImportFixturesButton } from "@/components/games/ImportFixturesButton";
import { Button } from "@/components/ui/Button";
import type { AgeGroup } from "@/lib/types";

interface Props {
  teamId: string;
  ageGroup: AgeGroup;
  existingExternalIds: string[];
  initialUrl?: string;
}

export function AddGameSection({
  teamId,
  ageGroup,
  existingExternalIds,
  initialUrl = "",
}: Props) {
  const [showManual, setShowManual] = useState(false);

  return (
    <div className="rounded-lg border border-hairline bg-surface p-4 shadow-card sm:p-5">
      <h2 className="text-base font-semibold text-ink">Add games</h2>
      <p className="mt-1 text-xs text-ink-mute">
        Importing from PlayHQ keeps opponents, rounds and kickoff times in sync
        with your league fixtures.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <ImportFixturesButton
          teamId={teamId}
          existingExternalIds={existingExternalIds}
          initialUrl={initialUrl}
          variant="primary"
          size="md"
          className="sm:flex-1"
        />
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={() => setShowManual(true)}
          className="sm:flex-1"
        >
          Create manually
        </Button>
      </div>

      {showManual && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => setShowManual(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-hairline bg-surface p-5 shadow-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-ink">
                  Create a game
                </h3>
                <p className="mt-1 text-xs text-ink-mute">
                  Use this for friendlies or games not in PlayHQ.
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
              teamId={teamId}
              ageGroup={ageGroup}
              onCancel={() => setShowManual(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
