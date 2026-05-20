"use client";

import { useMemo, useState, useTransition } from "react";
import { updateTeamChipSettings } from "@/app/(app)/teams/[teamId]/settings/actions";
import { SFButton } from "@/components/sf";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  CHIP_KEYS,
  CHIP_MODE_LABEL,
  CUSTOM_CHIP_MODES,
  POSITION_LINKED_PRESET,
  isChipZoneMode,
  isPositionLinkedChipConfig,
  type ChipKey,
  type ChipMode,
} from "@/lib/chips";
import { ChipIndicator } from "@/components/squad/ChipIndicator";

interface CohortChipsSettingsProps {
  teamId: string;
  initialLabels: { a: string | null; b: string | null; c: string | null };
  initialModes: { a: ChipMode; b: ChipMode; c: ChipMode };
  isAdmin: boolean;
  /**
   * Sport — drives the AFL-specific recommendation note. Netball
   * doesn't have an equivalent mandatory-rotation rule so the
   * U11-/U12+ guidance isn't shown for netball teams. Optional —
   * defaults to "afl" so legacy callers keep the existing copy.
   */
  sport?: "afl" | "netball";
  /**
   * The team's age_group id. Used to surface an age-appropriate
   * recommendation: U11 and under AFL teams get a "not
   * recommended" caveat (the AFL Junior Match Policy mandates
   * equal-time rotation through positions, so position-locking
   * works against the rules); U12+ AFL teams get a positive
   * "may help" note. Optional — when missing, no recommendation
   * is shown either way. Steve 2026-05-20.
   */
  ageGroup?: string | null;
}

// AFL age groups where the Junior Match Policy mandates equal-time
// rotation across the field (i.e. coaches MUST move every player
// through every position group across the season). Position-locking
// chips works against this rule and shouldn't be the default
// recommendation. From U12 the mandate eases and coaches can let
// players settle into preferred positions.
const ROTATION_MANDATED_AGE_GROUPS = new Set(["U8", "U9", "U10", "U11"]);

type Mode = "off" | "positions" | "custom";

// Coach configures up to three player chips per team. Three
// approaches, picked via the top segmented radio:
//
//   Off (default for new teams) — chips disabled. No chip picker
//     surfaces on the player editor; the player list rows have no
//     chip indicators. Coaches who don't care about cohorts (most
//     juniors) never see the feature surface. Steve 2026-05-20:
//     added so the feature is genuinely opt-in and the U11-/U12+
//     recommendation banner can sit alongside a real "no thanks"
//     choice instead of nudging coaches toward a setup they
//     wouldn't otherwise pick.
//
//   Linked to positions — the canonical preset. Chip A→Forward,
//     B→Centre, C→Back, with modes set to forward/centre/back so
//     the suggester preferences chipped players into their family
//     zone. Single tap; no per-chip editing.
//
//   Custom — the original 3-card layout. Useful for cohorts that
//     aren't position-based (older / younger, returning players,
//     mates-stay-together, etc.). Each chip gets a label and a
//     mode (split / group / forward / centre / back).
//
// The mode the UI surfaces on first paint is derived from the
// existing values — all labels blank → Off, all labels + modes
// match the position-linked preset → Linked to positions, else
// Custom. No new column on the teams row.
export function CohortChipsSettings({
  teamId,
  initialLabels,
  initialModes,
  isAdmin,
  sport = "afl",
  ageGroup = null,
}: CohortChipsSettingsProps) {
  const initialIsLinked = useMemo(
    () => isPositionLinkedChipConfig(initialLabels, initialModes),
    [initialLabels, initialModes],
  );

  // Top toggle state. Initialized from the existing chip data so a
  // coach who set this up in the position-linked path comes back
  // to the same layout next visit. All-blank → Off (the default
  // for new teams); preset match → Linked to positions; anything
  // else → Custom.
  const [mode, setMode] = useState<Mode>(() => {
    if (allLabelsBlank(initialLabels)) return "off";
    if (initialIsLinked) return "positions";
    return "custom";
  });

  // Local editable state — only meaningful in "custom" mode. The
  // "positions" mode just renders the canonical preset, no editing.
  const [labels, setLabels] = useState(initialLabels);
  const [modes, setModes] = useState<Record<ChipKey, ChipMode>>(initialModes);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Payload the Save action will send — derived from the current
  // mode, NOT from the local labels/modes which are stale once
  // the user flips between Off / positions / custom.
  const payload = useMemo(() => {
    if (mode === "off") {
      // Clear labels (so the picker doesn't surface) and reset
      // modes to the safest default. "split" is the historical
      // default for unset chips and the suggester's no-op behaviour.
      return {
        chip_a_label: null,
        chip_b_label: null,
        chip_c_label: null,
        chip_a_mode: "split" as ChipMode,
        chip_b_mode: "split" as ChipMode,
        chip_c_mode: "split" as ChipMode,
      };
    }
    if (mode === "positions") {
      return {
        chip_a_label: POSITION_LINKED_PRESET.labels.a,
        chip_b_label: POSITION_LINKED_PRESET.labels.b,
        chip_c_label: POSITION_LINKED_PRESET.labels.c,
        chip_a_mode: POSITION_LINKED_PRESET.modes.a,
        chip_b_mode: POSITION_LINKED_PRESET.modes.b,
        chip_c_mode: POSITION_LINKED_PRESET.modes.c,
      };
    }
    return {
      chip_a_label: labels.a?.trim() || null,
      chip_b_label: labels.b?.trim() || null,
      chip_c_label: labels.c?.trim() || null,
      chip_a_mode: modes.a,
      chip_b_mode: modes.b,
      chip_c_mode: modes.c,
    };
  }, [mode, labels, modes]);

  const dirty = useMemo(() => {
    const initialPayload = {
      chip_a_label: initialLabels.a,
      chip_b_label: initialLabels.b,
      chip_c_label: initialLabels.c,
      chip_a_mode: initialModes.a,
      chip_b_mode: initialModes.b,
      chip_c_mode: initialModes.c,
    };
    return (
      payload.chip_a_label !== initialPayload.chip_a_label ||
      payload.chip_b_label !== initialPayload.chip_b_label ||
      payload.chip_c_label !== initialPayload.chip_c_label ||
      payload.chip_a_mode !== initialPayload.chip_a_mode ||
      payload.chip_b_mode !== initialPayload.chip_b_mode ||
      payload.chip_c_mode !== initialPayload.chip_c_mode
    );
  }, [payload, initialLabels, initialModes]);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateTeamChipSettings(teamId, payload);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSavedAt(Date.now());
    });
  }

  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
      <p className="text-sm font-semibold text-ink">Player chips</p>
      <p className="mt-1 text-xs text-ink-dim">
        Chips are <strong className="text-ink">optional</strong>. Leave
        as <strong className="text-ink">Off</strong> if you want the
        suggester to rotate the squad evenly with no cohort hints.{" "}
        <strong className="text-ink">Linked to positions</strong> is the
        quick path — Forward / Centre / Back chips appear in the player
        editor and the suggester places each chipped player in their
        preferred area of the ground.{" "}
        <strong className="text-ink">Custom</strong> opens the three
        chips up for arbitrary labels (older / younger, mates, etc.)
        with finer control over each chip&apos;s behaviour. You can
        come back and change this anytime.
      </p>

      {sport === "afl" && ageGroup && (
        <AgeRecommendationNote ageGroup={ageGroup} />
      )}

      {/* Top mode selector — a 3-button segmented radio so the choice
          reads as primary, not a hidden checkbox. Disabled state
          covers non-admin viewers. */}
      <fieldset className="mt-3" disabled={!isAdmin || isPending}>
        <legend className="sr-only">Chip configuration mode</legend>
        <div
          role="radiogroup"
          aria-label="Chip configuration mode"
          className="inline-flex rounded-md border border-hairline bg-surface-alt p-0.5"
        >
          <ModeRadio
            label="Off"
            active={mode === "off"}
            onClick={() => setMode("off")}
          />
          <ModeRadio
            label="Linked to positions"
            active={mode === "positions"}
            onClick={() => setMode("positions")}
          />
          <ModeRadio
            label="Custom"
            active={mode === "custom"}
            onClick={() => {
              // Sanitize: the Custom dropdown only exposes split /
              // group, so any zone mode left over from a previous
              // Linked-to-positions visit needs to fall back to
              // "split" or the <select> renders with no valid
              // option highlighted.
              setModes((prev) => ({
                a: isChipZoneMode(prev.a) ? "split" : prev.a,
                b: isChipZoneMode(prev.b) ? "split" : prev.b,
                c: isChipZoneMode(prev.c) ? "split" : prev.c,
              }));
              setMode("custom");
            }}
          />
        </div>
      </fieldset>

      {mode === "off" ? (
        <OffModeSummary />
      ) : mode === "positions" ? (
        <PositionLinkedSummary />
      ) : (
        <CustomChipGrid
          labels={labels}
          modes={modes}
          setLabels={setLabels}
          setModes={setModes}
          isPending={isPending}
          isAdmin={isAdmin}
        />
      )}

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

// ─── Off-mode summary ────────────────────────────────────────
// Reassures coaches who picked "Off" that they haven't lost
// anything — the feature is simply hidden until they come back.
function OffModeSummary() {
  return (
    <div className="mt-3 rounded-md border border-dashed border-hairline bg-surface-alt px-4 py-3 text-xs text-ink-dim">
      <strong className="text-ink">Chips are off.</strong> The chip
      picker won&apos;t appear on the player editor and the suggester
      will rotate the squad without any cohort hints. Switch to{" "}
      <strong className="text-ink">Linked to positions</strong> or{" "}
      <strong className="text-ink">Custom</strong> any time you want
      to start using them.
    </div>
  );
}

// ─── Position-linked summary ─────────────────────────────────
// Read-only preview of the canonical Forward / Centre / Back
// preset. Saving from this state writes the preset to the team.
function PositionLinkedSummary() {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      {(CHIP_KEYS as readonly ChipKey[]).map((k) => {
        const label = POSITION_LINKED_PRESET.labels[k];
        const chipMode = POSITION_LINKED_PRESET.modes[k];
        return (
          <div
            key={k}
            className="flex items-center gap-2 rounded-md border border-hairline bg-surface-alt px-3 py-2"
          >
            <ChipIndicator chipKey={k} mode={chipMode} size="lg" />
            <span className="text-sm font-semibold text-ink">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Custom chip grid (existing 3-card layout) ───────────────
interface CustomChipGridProps {
  labels: { a: string | null; b: string | null; c: string | null };
  modes: Record<ChipKey, ChipMode>;
  setLabels: (
    updater: (prev: { a: string | null; b: string | null; c: string | null }) => {
      a: string | null;
      b: string | null;
      c: string | null;
    },
  ) => void;
  setModes: (
    updater: (prev: Record<ChipKey, ChipMode>) => Record<ChipKey, ChipMode>,
  ) => void;
  isPending: boolean;
  isAdmin: boolean;
}

function CustomChipGrid({
  labels,
  modes,
  setLabels,
  setModes,
  isPending,
  isAdmin,
}: CustomChipGridProps) {
  return (
    <div className="mt-3 grid gap-4 sm:grid-cols-3">
      {CHIP_KEYS.map((k) => (
        <div
          key={k}
          className="space-y-2 rounded-md border border-hairline bg-surface-alt p-3"
        >
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
          <div>
            <label htmlFor={`chip-${k}-mode`} className="sr-only">
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
              {CUSTOM_CHIP_MODES.map((m) => (
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
  );
}

// ─── Segmented-radio button ──────────────────────────────────
function ModeRadio({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`rounded px-3 py-1 text-xs font-semibold transition-colors duration-fast ease-out-quart ${
        active
          ? "bg-surface text-ink shadow-card"
          : "text-ink-mute hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function allLabelsBlank(labels: {
  a: string | null;
  b: string | null;
  c: string | null;
}): boolean {
  return !labels.a && !labels.b && !labels.c;
}

// ─── Age-aware recommendation note ───────────────────────────
// Surfaces AFL-specific guidance about WHEN position-linked
// chips are appropriate.
//
// U11 and under: the AFL Junior Match Policy mandates equal-time
//   rotation across every position. Position-locking chips works
//   against that rule and shouldn't be the recommended path —
//   coaches MUST move every kid through forwards, centres, and
//   backs across the season. Show a warning-tinted note pointing
//   them at the Custom flow if they have a non-positional cohort.
//
// U12 and above: the rotation mandate eases; players start
//   forming natural strengths in specific positions, and the
//   coach's job shifts toward giving those strengths room to
//   develop. Show a positive-tinted "may help" note that frames
//   position-linking as the right tool for the age band.
//
// Steve 2026-05-20.
function AgeRecommendationNote({ ageGroup }: { ageGroup: string }) {
  const isU11OrUnder = ROTATION_MANDATED_AGE_GROUPS.has(ageGroup);
  if (isU11OrUnder) {
    return (
      <div className="mt-3 rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-xs text-warn">
        <strong className="font-semibold">
          Not recommended for U11 and under.
        </strong>{" "}
        The AFL Junior Match Policy mandates equal-time rotation
        through every position at this age, so locking players to a
        zone works against the rules. Use{" "}
        <strong className="font-semibold">Custom</strong> if you want
        chips for non-positional cohorts (mates, returning players,
        etc.).
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ok">
      <strong className="font-semibold">Useful from U12 up.</strong>{" "}
      Mandatory all-positions rotation eases at this age and players
      start forming natural strengths. Position-linked chips help the
      suggester balance the team toward those strengths while still
      handling fair rotation around them.
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
