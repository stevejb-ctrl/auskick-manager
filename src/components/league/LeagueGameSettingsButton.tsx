"use client";

// ─── LeagueGameSettingsButton ───────────────────────────────
// Mid-game settings affordance for Rugby League — sits in the
// `LiveAdminUtilityRow` alongside "+ Add late arrival" and
// "Restart game". Tapping opens a modal with the one knob the
// coach actually needs after kickoff:
//
//   Sub interval — drives the LeagueNextSubCard cadence
//                  (`subIntervalSeconds` on the game row).
//
// Mid-game on-field-size change is deferred until main's
// `roster_shrink_event` migration lands here — that path needs
// a new event type to close the off-going players' stints and
// move them to bench. Shipping just the sub-interval slice keeps
// this PR small and lets coaches adjust rotation cadence today.
// Steve 2026-05-20.
//
// Mirrors the shape of AFL's LiveGameSettingsButton so the future
// merge can refactor both sports onto a single shared shell.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SFButton } from "@/components/sf";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { setLeagueSubInterval } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/league-actions";
import type { LiveAuth } from "@/lib/types";

interface LeagueGameSettingsButtonProps {
  auth: LiveAuth;
  gameId: string;
  /** Current sub interval in seconds (from games.sub_interval_seconds). */
  subIntervalSeconds: number;
}

const MIN_SECONDS = 30;
const MAX_SECONDS = 600;

export function LeagueGameSettingsButton({
  auth,
  gameId,
  subIntervalSeconds,
}: LeagueGameSettingsButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [draftSeconds, setDraftSeconds] = useState(subIntervalSeconds);
  const [error, setError] = useState<string | null>(null);

  function handleOpen() {
    // Refresh the draft from the live prop on open so a
    // mid-game change another GM made doesn't get clobbered.
    setDraftSeconds(subIntervalSeconds);
    setError(null);
    setOpen(true);
  }

  function handleSave() {
    setError(null);
    if (
      !Number.isFinite(draftSeconds)
      || draftSeconds < MIN_SECONDS
      || draftSeconds > MAX_SECONDS
    ) {
      setError(
        `Sub interval must be between ${MIN_SECONDS} and ${MAX_SECONDS} seconds.`,
      );
      return;
    }
    startTransition(async () => {
      const result = await setLeagueSubInterval(auth, gameId, draftSeconds);
      if (!result.success) {
        setError(result.error ?? "Couldn't save.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  const minutes = Math.floor(draftSeconds / 60);
  const seconds = draftSeconds % 60;
  const minSec = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-3 py-2 text-xs font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:border-ink-mute hover:text-ink"
        aria-label="Game settings"
      >
        <svg
          aria-hidden
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        Game settings
      </button>

      {open && (
        <Modal size="sm">
          <div className="space-y-4 p-4">
            <header className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">
                Game settings
              </h2>
              <button
                type="button"
                onClick={() => (pending ? undefined : setOpen(false))}
                className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute hover:text-ink-dim"
                disabled={pending}
              >
                Close
              </button>
            </header>
            <div className="space-y-1.5">
              <Label htmlFor="league-sub-interval">
                Sub interval (seconds)
              </Label>
              <Input
                id="league-sub-interval"
                type="number"
                inputMode="numeric"
                min={MIN_SECONDS}
                max={MAX_SECONDS}
                step={15}
                value={draftSeconds}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setDraftSeconds(Number.isFinite(n) ? Math.round(n) : 0);
                }}
                disabled={pending}
              />
              <p className="text-xs text-ink-mute">
                Currently {minSec} (mm:ss). Range {MIN_SECONDS}–{MAX_SECONDS}{" "}
                seconds. The Sub-due reminder will fire at this cadence from
                each period kickoff.
              </p>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger"
              >
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 border-t border-hairline pt-3">
              <SFButton
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </SFButton>
              <SFButton
                size="sm"
                onClick={handleSave}
                disabled={pending || draftSeconds === subIntervalSeconds}
                loading={pending}
              >
                Save
              </SFButton>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
