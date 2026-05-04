"use client";

import { useState, useTransition } from "react";
import { updateTeamChipLabels } from "@/app/(app)/teams/[teamId]/settings/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { CHIP_COLORS, CHIP_KEYS } from "@/lib/chips";

interface CohortChipsSettingsProps {
  teamId: string;
  initialLabels: { a: string | null; b: string | null; c: string | null };
  isAdmin: boolean;
}

// Three labeled chip slots — coach decides what each chip means
// (e.g. "older / younger", "left foot / right foot"). Empty labels
// hide the chip from the player picker. The lineup suggester
// reads the chip key and balances it across zones regardless of
// what the coach calls it.
export function CohortChipsSettings({
  teamId,
  initialLabels,
  isAdmin,
}: CohortChipsSettingsProps) {
  const [labels, setLabels] = useState(initialLabels);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateTeamChipLabels(teamId, {
        chip_a_label: labels.a?.trim() || null,
        chip_b_label: labels.b?.trim() || null,
        chip_c_label: labels.c?.trim() || null,
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
    (labels.c ?? "") !== (initialLabels.c ?? "");

  return (
    <div className="rounded-lg border border-hairline bg-surface p-4 shadow-card sm:p-5">
      <p className="text-sm font-semibold text-ink">Player chips</p>
      <p className="mt-1 text-xs text-ink-dim">
        Tag your squad with up to three chips — the lineup suggester will
        spread chip-mates evenly across zones. Coach decides what each chip
        means: e.g. <em>older / younger</em>, <em>left / right foot</em>.
        Leave a label blank to hide the chip.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {CHIP_KEYS.map((k) => (
          <div key={k} className="space-y-1">
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
          Only admins can change chip labels.
        </p>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!dirty || isPending}
            loading={isPending}
          >
            Save labels
          </Button>
          {savedAt && !dirty && (
            <span className="text-xs text-ok">Saved.</span>
          )}
        </div>
      )}
    </div>
  );
}
