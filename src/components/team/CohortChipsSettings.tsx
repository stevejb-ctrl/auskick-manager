"use client";

import { useState, useTransition } from "react";
import { updateTeamChipSettings } from "@/app/(app)/teams/[teamId]/settings/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { CHIP_COLORS, CHIP_KEYS, type ChipKey, type ChipMode } from "@/lib/chips";

interface CohortChipsSettingsProps {
  teamId: string;
  initialLabels: { a: string | null; b: string | null; c: string | null };
  initialModes: { a: ChipMode; b: ChipMode; c: ChipMode };
  isAdmin: boolean;
}

// Three labeled chip slots — coach decides what each chip means
// (e.g. "older / younger", "left foot / right foot", "stays paired
// with these kids"). Each chip also has a mode: split (spread chip-
// mates across zones) or group (keep them together). The lineup
// suggester reads both keys + modes when it places players.
export function CohortChipsSettings({
  teamId,
  initialLabels,
  initialModes,
  isAdmin,
}: CohortChipsSettingsProps) {
  const [labels, setLabels] = useState(initialLabels);
  const [modes, setModes] = useState<Record<ChipKey, ChipMode>>(initialModes);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateTeamChipSettings(teamId, {
        chip_a_label: labels.a?.trim() || null,
        chip_b_label: labels.b?.trim() || null,
        chip_c_label: labels.c?.trim() || null,
        chip_a_mode: modes.a,
        chip_b_mode: modes.b,
        chip_c_mode: modes.c,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSavedAt(Date.now());
    });
  }

  const dirty =
    (labels.a ?? "") !== (initialLabels.a ?? "") ||
    (labels.b ?? "") !== (initialLabels.b ?? "") ||
    (labels.c ?? "") !== (initialLabels.c ?? "") ||
    modes.a !== initialModes.a ||
    modes.b !== initialModes.b ||
    modes.c !== initialModes.c;

  return (
    <div className="rounded-lg border border-hairline bg-surface p-4 shadow-card sm:p-5">
      <p className="text-sm font-semibold text-ink">Player chips</p>
      <p className="mt-1 text-xs text-ink-dim">
        Tag your squad with up to three chips. For each chip, pick how the
        suggester should treat chip-mates:{" "}
        <strong className="text-ink">Split</strong> spreads them across
        zones (e.g. mix older with younger);{" "}
        <strong className="text-ink">Group</strong> keeps them together
        (e.g. a player who needs to stay paired with specific teammates).
        Leave a label blank to hide the chip.
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        {CHIP_KEYS.map((k) => (
          <div key={k} className="space-y-2 rounded-md border border-hairline bg-surface-alt p-3">
            <Label htmlFor={`chip-${k}-label`} className="flex items-center gap-2">
              <span
                aria-hidden
                className={`inline-block h-3 w-3 rounded-full ${CHIP_COLORS[k].dot}`}
              />
              Chip {k.toUpperCase()}
            </Label>
            <Input
              id={`chip-${k}-label`}
              value={labels[k] ?? ""}
              onChange={(e) =>
                setLabels((prev) => ({ ...prev, [k]: e.target.value }))
              }
              placeholder="Optional label"
              disabled={isPending || !isAdmin}
              maxLength={32}
            />
            <div role="radiogroup" aria-label={`Chip ${k.toUpperCase()} mode`}>
              <div className="flex rounded-md border border-hairline bg-surface text-xs">
                <button
                  type="button"
                  role="radio"
                  aria-checked={modes[k] === "split"}
                  onClick={() =>
                    setModes((prev) => ({ ...prev, [k]: "split" }))
                  }
                  disabled={isPending || !isAdmin}
                  className={`flex-1 rounded-l-md px-3 py-1.5 font-medium transition-colors ${
                    modes[k] === "split"
                      ? "bg-ink text-warm"
                      : "text-ink-dim hover:bg-surface-alt"
                  } disabled:opacity-60`}
                >
                  Split
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={modes[k] === "group"}
                  onClick={() =>
                    setModes((prev) => ({ ...prev, [k]: "group" }))
                  }
                  disabled={isPending || !isAdmin}
                  className={`flex-1 rounded-r-md px-3 py-1.5 font-medium transition-colors ${
                    modes[k] === "group"
                      ? "bg-ink text-warm"
                      : "text-ink-dim hover:bg-surface-alt"
                  } disabled:opacity-60`}
                >
                  Group
                </button>
              </div>
              <p className="mt-1 text-[11px] text-ink-mute">
                {modes[k] === "split"
                  ? "Spreads chip-mates across zones."
                  : "Keeps chip-mates together."}
              </p>
            </div>
          </div>
        ))}
      </div>
      {error && (
        <p className="mt-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
      {!isAdmin ? (
        <p className="mt-3 text-xs text-ink-mute">
          Only admins can change chip settings.
        </p>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!dirty || isPending}
            loading={isPending}
          >
            Save chip settings
          </Button>
          {savedAt && !dirty && (
            <span className="text-xs text-ok">Saved.</span>
          )}
        </div>
      )}
    </div>
  );
}
