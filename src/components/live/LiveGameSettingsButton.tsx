"use client";

// ─── LiveGameSettingsButton ──────────────────────────────────
// Mid-game settings affordance for AFL — sits in the
// `LiveAdminUtilityRow` alongside "+ Add late arrival" and
// "Restart game". Tapping opens a modal with knobs the coach
// might want to tweak after kickoff without restarting the
// game or waiting for the next break.
//
// Steve 2026-05-20: shipped to close the "pre-game guess was
// wrong" gap. Today the modal carries one field — Sub interval
// (drives the AFL SubDueModal reminder cadence). The component
// is structured so future in-game knobs slot in alongside it
// (on-field size, hype song, etc.) without needing another
// button on the utility row.
//
// Netball doesn't have a sub interval (its sub model is
// break-only by default, opt-in mid-Q via `Switch player`), so
// this button isn't rendered on the netball live shell.
// `LiveAdminUtilityRow` accepts the button as a slot — AFL
// passes it, netball passes nothing.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SFButton } from "@/components/sf";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { setSubInterval } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import type { LiveAuth } from "@/lib/types";

interface LiveGameSettingsButtonProps {
  auth: LiveAuth;
  gameId: string;
  /** Current effective sub interval in SECONDS (from games.sub_interval_seconds). */
  subIntervalSeconds: number;
}

export function LiveGameSettingsButton({
  auth,
  gameId,
  subIntervalSeconds,
}: LiveGameSettingsButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <SFButton
        size="md"
        variant="ghost"
        onClick={() => setOpen(true)}
        className="w-full sm:w-auto"
      >
        Game settings
      </SFButton>

      {open && (
        <LiveGameSettingsModal
          auth={auth}
          gameId={gameId}
          subIntervalSeconds={subIntervalSeconds}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

interface LiveGameSettingsModalProps extends LiveGameSettingsButtonProps {
  onClose: () => void;
}

function LiveGameSettingsModal({
  auth,
  gameId,
  subIntervalSeconds,
  onClose,
}: LiveGameSettingsModalProps) {
  const router = useRouter();
  const initialMinutes = subIntervalSeconds / 60;
  const [minutesInput, setMinutesInput] = useState<string>(
    String(initialMinutes),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    const minutes = parseFloat(minutesInput);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 10) {
      setError("Sub interval must be between 1 and 10 minutes.");
      return;
    }
    // Detect "no actual change" to spare a roundtrip + revalidate
    // flash when the coach opens the modal, doesn't change
    // anything, and taps Save.
    const seconds = Math.round(minutes * 60);
    if (seconds === subIntervalSeconds) {
      onClose();
      return;
    }
    startTransition(async () => {
      const result = await setSubInterval(auth, gameId, seconds);
      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal>
      <h2 className="text-center text-lg font-bold text-ink">Game settings</h2>
      <p className="mt-1 text-center text-xs text-ink-mute">
        Adjust without restarting the game. Changes apply from the next
        sub-due reminder.
      </p>

      <div className="mt-5 space-y-4">
        <div>
          <Label
            htmlFor="live-sub-minutes"
            className="!mb-1 block text-xs font-semibold text-ink"
          >
            Sub interval
          </Label>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <p className="text-xs text-ink-mute">
                How often the &quot;sub due&quot; reminder fires. Currently
                every {initialMinutes} min — bump it up if kids look gassed,
                down if they barely break a sweat.
              </p>
            </div>
            <div className="w-24">
              <Input
                id="live-sub-minutes"
                type="number"
                min={1}
                max={10}
                step={0.5}
                value={minutesInput}
                onChange={(e) => setMinutesInput(e.target.value)}
                disabled={pending}
                autoFocus
              />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <p
          className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="mt-5 space-y-2">
        <SFButton
          className="w-full"
          size="lg"
          onClick={handleSave}
          loading={pending}
        >
          Save
        </SFButton>
        <SFButton
          className="w-full"
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={pending}
        >
          Cancel
        </SFButton>
      </div>
    </Modal>
  );
}
