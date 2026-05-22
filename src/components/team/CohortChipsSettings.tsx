"use client";

import { useState, useTransition } from "react";
import { updateTeamChipSettings } from "@/app/(app)/teams/[teamId]/settings/actions";
import { SFButton } from "@/components/sf";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { CHIP_COLORS, CHIP_KEYS, type ChipKey, type ChipMode } from "@/lib/chips";
import type { Sport } from "@/lib/types";

interface CohortChipsSettingsProps {
  teamId: string;
  initialLabels: { a: string | null; b: string | null; c: string | null };
  initialModes: { a: ChipMode; b: ChipMode; c: ChipMode };
  isAdmin: boolean;
  /**
   * Sport drives the chip-c gate. Rugby League uses chip A
   * (Forward) + chip B (Back) only — chip C is dead UI for RL
   * teams and only confuses coaches. AFL + netball keep all
   * three. Defaults to AFL behaviour (all three visible) so
   * legacy callers don't change. Steve 2026-05-20.
   */
  sport?: Sport;
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
  sport,
}: CohortChipsSettingsProps) {
  const [labels, setLabels] = useState(initialLabels);
  const [modes, setModes] = useState<Record<ChipKey, ChipMode>>(initialModes);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // Rugby League is a two-zone sport (Forwards + Backs). The chip-C
  // row would always be unused noise, so hide it for RL teams. AFL +
  // netball + any unspecified sport keep all three for backwards
  // compatibility.
  const visibleChipKeys = (
    sport === "rugby_league"
      ? CHIP_KEYS.filter((k) => k !== "c")
      : CHIP_KEYS
  ) as ChipKey[];
  // 2-col grid when chip-c is hidden, 3-col otherwise — keeps each
  // row of chips visually balanced rather than orphaning chip-B in
  // a 3-col grid with one missing cell.
  const gridCols
    = visibleChipKeys.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3";

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
        suggester should treat chip-mates:{" "}
        <strong className="text-ink">Split</strong> spreads them across
        zones (e.g. mix older with younger);{" "}
        <strong className="text-ink">Group</strong> keeps them together
        (e.g. a player who needs to stay paired with specific teammates).
        Leave a label blank to hide the chip.
      </p>
      <div className={`mt-3 grid gap-4 ${gridCols}`}>
        {visibleChipKeys.map((k) => {
          // RL coaches get an opinionated placeholder steering them
          // toward the Forward / Back naming convention the lineup
          // picker zone cards use ("Forwards" / "Backs"). AFL +
          // netball keep the neutral "Optional label" prompt — they
          // tag for any reason (mates, mate-of-coach, regulars).
          const placeholder
            = sport === "rugby_league"
              ? k === "a"
                ? "e.g. Forward"
                : k === "b"
                  ? "e.g. Back"
                  : "Optional label"
              : "Optional label";
          return (
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
              placeholder={placeholder}
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
          );
        })}
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
