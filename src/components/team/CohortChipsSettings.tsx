"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { updateTeamChipSettings } from "@/app/(app)/teams/[teamId]/settings/actions";
import { SFButton } from "@/components/sf";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  CHIP_KEYS,
  CHIP_MODE_LABEL,
  CUSTOM_CHIP_MODES,
  POSITION_LINKED_PRESET,
  RUGBY_LEAGUE_POSITION_LINKED_PRESET,
  isChipZoneMode,
  isPositionLinkedChipConfig,
  isRugbyLeaguePositionLinkedChipConfig,
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
   * U10-/U11+ guidance isn't shown for netball teams. Rugby
   * league has 2 zones (Forwards + Backs) — chip-C is dead UI for
   * RL and the position-linked recommendation note is AFL-only,
   * so the recommendation paragraph hides for RL too. Optional —
   * defaults to "afl" so legacy callers keep the existing copy.
   */
  sport?: "afl" | "netball" | "rugby_league";
  /**
   * The team's age_group id. Used to surface an age-appropriate
   * recommendation only when Linked-to-positions is selected: AFL
   * U10 and under teams get a "not recommended" caveat; U11+ get
   * a positive "may help" note. Optional — when missing, no
   * recommendation is shown either way. Steve 2026-05-20.
   */
  ageGroup?: string | null;
  /**
   * In the onboarding flow there's a single Continue button at the
   * bottom of the step that submits all the step's controls at
   * once, so the chip card's standalone "Save chip settings"
   * button is redundant and confusing. When `true`, the Save row
   * is hidden and dirty changes commit on the parent Continue
   * tap via the existing per-input server actions. Steve
   * 2026-05-20.
   */
  hideSaveButton?: boolean;
}

// AFL age groups where the Junior Match Policy mandates equal-time
// rotation across the field (i.e. coaches MUST move every player
// through every position group across the season). Position-locking
// chips works against this rule. The 3-zone rotation system ends
// at U10 — U11 onwards is fair game for position-linked chips.
// Steve 2026-05-20 (corrected from U8-U11 to U8-U10 after coach
// feedback).
const ROTATION_MANDATED_AGE_GROUPS = new Set(["U8", "U9", "U10"]);

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
  hideSaveButton = false,
}: CohortChipsSettingsProps) {
  // Rugby League uses its OWN 2-zone preset (Forward / Back; chip
  // C cleared). Pick the right detector + preset for the sport so
  // first-paint mode detection AND the payload-build path both
  // round-trip the team's existing config cleanly.
  const isRl = sport === "rugby_league";
  const initialIsLinked = useMemo(
    () =>
      isRl
        ? isRugbyLeaguePositionLinkedChipConfig(initialLabels, initialModes)
        : isPositionLinkedChipConfig(initialLabels, initialModes),
    [isRl, initialLabels, initialModes],
  );
  // Which chip keys this sport actually surfaces. RL has 2 (A=Fwd,
  // B=Back); AFL + netball have all 3 (A/B/C). Drives the Custom
  // grid + the Position-linked summary so chip-C doesn't render as
  // dead UI on a 2-zone sport.
  const visibleChipKeys = useMemo<readonly ChipKey[]>(
    () =>
      isRl
        ? (CHIP_KEYS.filter((k) => k !== "c") as readonly ChipKey[])
        : CHIP_KEYS,
    [isRl],
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
  // Tracks the payload that's known-persisted to the DB. Used by
  // the dirty check + the onboarding auto-save effect so a user
  // who's just saved doesn't trigger another auto-save loop. Steve
  // 2026-05-20.
  const lastSavedPayloadRef = useRef({
    chip_a_label: initialLabels.a,
    chip_b_label: initialLabels.b,
    chip_c_label: initialLabels.c,
    chip_a_mode: initialModes.a,
    chip_b_mode: initialModes.b,
    chip_c_mode: initialModes.c,
  });

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
      // RL writes the 2-zone preset (Forward / Back, chip C
      // cleared); AFL + netball write the canonical 3-zone preset
      // (Forward / Centre / Back).
      const preset = isRl
        ? RUGBY_LEAGUE_POSITION_LINKED_PRESET
        : POSITION_LINKED_PRESET;
      return {
        chip_a_label: preset.labels.a,
        chip_b_label: preset.labels.b,
        chip_c_label: preset.labels.c,
        chip_a_mode: preset.modes.a,
        chip_b_mode: preset.modes.b,
        chip_c_mode: preset.modes.c,
      };
    }
    // Custom mode. For RL, chip C is hidden in the UI but its row
    // on the team table still gets written — clear it (label null,
    // mode "split") so saving from Custom doesn't leave stale chip
    // C data from a previous Linked-to-positions visit. AFL +
    // netball write whatever's in local state.
    return {
      chip_a_label: labels.a?.trim() || null,
      chip_b_label: labels.b?.trim() || null,
      chip_c_label: isRl ? null : labels.c?.trim() || null,
      chip_a_mode: modes.a,
      chip_b_mode: modes.b,
      chip_c_mode: isRl ? "split" : modes.c,
    };
  }, [mode, labels, modes, isRl]);

  const dirty = useMemo(() => {
    const saved = lastSavedPayloadRef.current;
    return (
      payload.chip_a_label !== saved.chip_a_label ||
      payload.chip_b_label !== saved.chip_b_label ||
      payload.chip_c_label !== saved.chip_c_label ||
      payload.chip_a_mode !== saved.chip_a_mode ||
      payload.chip_b_mode !== saved.chip_b_mode ||
      payload.chip_c_mode !== saved.chip_c_mode
    );
    // payload changes ref-equality on every render — that's the
    // intended trigger. lastSavedPayloadRef updates imperatively.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);

  function commitSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateTeamChipSettings(teamId, payload);
      if (!result.success) {
        setError(result.error);
        return;
      }
      lastSavedPayloadRef.current = payload;
      // setSavedAt triggers a re-render which causes the dirty
      // useMemo to re-evaluate against the updated ref. Without
      // this, the "Saved." message wouldn't appear because the
      // memo would still think we're dirty.
      setSavedAt(Date.now());
    });
  }

  // Onboarding auto-save: when `hideSaveButton` is true, there's no
  // standalone Save button in the card — the parent flow (e.g.
  // ScoringStep) drives the page-level Continue. We auto-commit
  // chip changes with a short debounce so the user's selections
  // persist without an extra click. Steve 2026-05-20.
  useEffect(() => {
    if (!hideSaveButton || !isAdmin || !dirty || isPending) return;
    const timer = window.setTimeout(() => {
      commitSave();
    }, 400);
    return () => window.clearTimeout(timer);
    // commitSave captures the current payload; it's safe to omit
    // because we only fire on dirty transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, dirty, hideSaveButton, isAdmin, isPending]);

  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
      <p className="text-sm font-semibold text-ink">Player chips (optional)</p>
      <p className="mt-1 text-xs text-ink-dim">
        Tag groups of players so the suggester treats them as a cohort.
        You can change or remove this anytime.
      </p>

      {/* Top mode selector — a 3-button segmented radio so the choice
          reads as primary, not a hidden checkbox. Disabled state covers
          non-admin viewers and (for the explicit-save flow only) while a
          save transition is in-flight. In onboarding (hideSaveButton) the
          auto-save is a silent background debounce — disabling the inputs
          during it makes the card feel broken, so we skip it there. */}
      <fieldset className="mt-3" disabled={!isAdmin || (isPending && !hideSaveButton)}>
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

      {/* Age-aware recommendation — only relevant for
          Linked-to-positions. When Off or Custom is selected the
          guidance is noise. AFL only; netball has no equivalent
          rotation mandate so the note never renders for them. */}
      {mode === "positions" && sport === "afl" && ageGroup && (
        <AgeRecommendationNote ageGroup={ageGroup} />
      )}

      {mode === "off" ? (
        <OffModeSummary />
      ) : mode === "positions" ? (
        <PositionLinkedSummary visibleKeys={visibleChipKeys} isRl={isRl} />
      ) : (
        <CustomChipGrid
          labels={labels}
          modes={modes}
          setLabels={setLabels}
          setModes={setModes}
          isPending={isPending}
          isAdmin={isAdmin}
          hideSaveButton={hideSaveButton}
          visibleKeys={visibleChipKeys}
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
      ) : hideSaveButton ? (
        // Onboarding: no standalone Save button (the page-level
        // Continue is the single forward action). Auto-save runs
        // silently via the debounced useEffect above.
        //
        // Steve 2026-05-20: dropped the dirty / saving / saved
        // status indicator entirely — it cycled through three
        // states for every radio click and felt like a glitch.
        // Save errors still surface via the `error` block above,
        // so a failure isn't silent; the happy path is now just
        // quiet, which is the right default for a settings
        // selector that doesn't need to feel like a form submit.
        null
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <SFButton
            size="sm"
            onClick={commitSave}
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
// Read-only preview of the canonical position-linked preset.
// Saving from this state writes the preset to the team.
//   * AFL + netball: Forward / Centre / Back (3 chips)
//   * Rugby league: Forward / Back (chip C cleared, hidden)
function PositionLinkedSummary({
  visibleKeys,
  isRl,
}: {
  visibleKeys: readonly ChipKey[];
  isRl: boolean;
}) {
  const preset = isRl
    ? RUGBY_LEAGUE_POSITION_LINKED_PRESET
    : POSITION_LINKED_PRESET;
  // 2-col when chip-C is hidden (RL), 3-col otherwise. Keeps the
  // visible chips visually balanced rather than orphaning chip-B
  // in a 3-col grid with one missing cell.
  const gridCols = visibleKeys.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3";
  return (
    <div className={`mt-3 grid gap-2 ${gridCols}`}>
      {visibleKeys.map((k) => {
        const label = preset.labels[k];
        const chipMode = preset.modes[k];
        if (!label) return null;
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
  /**
   * Mirror of the parent's `hideSaveButton`. When true, saves are
   * silent background auto-saves and inputs must NOT be locked while
   * `isPending` — that causes the flash-unselectable bug. Steve
   * 2026-05-25.
   */
  hideSaveButton: boolean;
  /**
   * Which chip keys to render. AFL + netball pass all three (A/B/C);
   * rugby league passes [A, B] only because chip-C is dead UI on a
   * 2-zone sport. Steve 2026-05-23.
   */
  visibleKeys: readonly ChipKey[];
}

function CustomChipGrid({
  labels,
  modes,
  setLabels,
  setModes,
  isPending,
  isAdmin,
  hideSaveButton,
  visibleKeys,
}: CustomChipGridProps) {
  // In onboarding (hideSaveButton) the save is a silent background
  // debounce — the user must never feel it. Disable inputs only when
  // the explicit Save button is present and a transition is in-flight.
  const inputDisabled = !isAdmin || (isPending && !hideSaveButton);
  // 2-col grid when chip-C is hidden — keeps visible chips
  // balanced rather than orphaning chip-B in a 3-col grid with
  // one missing cell.
  const gridCols
    = visibleKeys.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3";
  return (
    <div className={`mt-3 grid gap-4 ${gridCols}`}>
      {visibleKeys.map((k) => (
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
            disabled={inputDisabled}
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
              disabled={inputDisabled}
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
// chips are appropriate. Only rendered when the coach has
// selected "Linked to positions" — the note is noise on Off /
// Custom where the position preference doesn't apply.
//
// U10 and under: the AFL Junior Match Policy mandates equal-
//   time rotation through every zone (the 3-zone rotation
//   system applies up to and including U10). Position-locking
//   chips works against that. Warning-tinted "not recommended".
//
// U11 and above: rotation requirements ease and players start
//   forming natural strengths. Positive "useful from here" note.
//
// Steve 2026-05-20: corrected threshold from U11→U10 after
// coach feedback — the mandatory 3-zone rotation ends at U10.
function AgeRecommendationNote({ ageGroup }: { ageGroup: string }) {
  const isU10OrUnder = ROTATION_MANDATED_AGE_GROUPS.has(ageGroup);
  if (isU10OrUnder) {
    return (
      <div className="mt-3 rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-xs text-warn">
        <strong className="font-semibold">
          Not recommended for U10 and under.
        </strong>{" "}
        AFL rules at this age require equal-time rotation through
        every zone, so locking players to a position works against
        the policy. Switch to{" "}
        <strong className="font-semibold">Off</strong> for full
        rotation, or use{" "}
        <strong className="font-semibold">Custom</strong> for non-
        positional cohorts (mates, returning players, etc.).
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ok">
      <strong className="font-semibold">Useful from U11 up.</strong>{" "}
      Mandatory all-zones rotation eases at this age and players
      start forming natural strengths. Linked-to-positions helps the
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
