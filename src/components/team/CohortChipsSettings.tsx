"use client";

import { useState, useTransition } from "react";
import { updateTeamChipSettings } from "@/app/(app)/teams/[teamId]/settings/actions";
import { SFButton } from "@/components/sf";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  CHIP_COLORS,
  CHIP_KEYS,
  CHIP_MODES,
  CHIP_MODE_LABEL,
  type ChipKey,
  type ChipMode,
} from "@/lib/chips";
import { ChipIndicator } from "@/components/squad/ChipIndicator";

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
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
      <p className="text-sm font-semibold text-ink">Player chips</p>
      <p className="mt-1 text-xs text-ink-dim">
        Tag your squad with up to three chips. For each chip, pick how the
        suggester treats chip-mates:{" "}
        <strong className="text-ink">Split</strong> spreads them across
        zones,{" "}
        <strong className="text-ink">Group</strong> keeps them together,
        or pick{" "}
        <strong className="text-ink">Forward / Centre / Back</strong> to
        preference chip-mates toward a specific area of the ground (once
        mandatory rotations age out, some kids settle into a position —
        Steve 2026-05-20). Leave a label blank to hide the chip.
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        {CHIP_KEYS.map((k) => (
          <div key={k} className="space-y-2 rounded-md border border-hairline bg-surface-alt p-3">
            <Label htmlFor={`chip-${k}-label`} className="flex items-center gap-2">
              <ChipIndicator chipKey={k} mode={modes[k]} />
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
            {/* Steve 2026-05-20: was a 2-button radio toggle
                (Split | Group). Now five modes; switched to a
                select so the per-chip card stays tight. Helper
                line under the select adapts to the picked mode. */}
            <div>
              <label
                htmlFor={`chip-${k}-mode`}
                className="sr-only"
              >
                Chip {k.toUpperCase()} mode
              </label>
              <select
                id={`chip-${k}-mode`}
                value={modes[k]}
                onChange={(e) =>
                  setModes((prev) => ({
                    ...prev,
                    [k]: e.target.value as ChipMode,
                  }))
                }
                disabled={isPending || !isAdmin}
                className="w-full rounded-md border border-hairline bg-surface px-2 py-1.5 text-xs font-medium text-ink shadow-card focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:bg-surface-alt disabled:text-ink-mute"
              >
                {CHIP_MODES.map((m) => (
                  <option key={m} value={m}>
                    {CHIP_MODE_LABEL[m]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-ink-mute">
                {modeHelpText(modes[k])}
              </p>
            </div>
          </div>
        ))}
      </div>
      {error && (
        <p
          className="mt-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      )}
      {!isAdmin ? (
        <p className="mt-3 text-xs text-ink-mute">
          Only admins can change chip settings.
        </p>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <SFButton
            size="sm"
            onClick={handleSave}
            disabled={!dirty || isPending}
            loading={isPending}
          >
            Save chip settings
          </SFButton>
          {savedAt && !dirty && (
            <span className="text-xs text-ok">Saved.</span>
          )}
        </div>
      )}
    </div>
  );
}

function modeHelpText(mode: ChipMode): string {
  switch (mode) {
    case "split":
      return "Spreads chip-mates across zones.";
    case "group":
      return "Keeps chip-mates together.";
    case "forward":
      return "Prefers chip-mates in forward zones.";
    case "centre":
      return "Prefers chip-mates in midfield / centre.";
    case "back":
      return "Prefers chip-mates in defensive zones.";
  }
}
