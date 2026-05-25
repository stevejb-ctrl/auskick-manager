"use client";

// ─── LeagueGameSettingsButton ───────────────────────────────
// Mid-game settings affordance for Rugby League — sits in the
// `LiveAdminUtilityRow` alongside "+ Add late arrival" and
// "Restart game". Matches AFL's `LiveGameSettingsButton` in both
// visual style (SFButton ghost) and modal shape (same three-knob
// layout: sub interval + players on field + enforce unbroken rule).
//
// Three knobs in the modal:
//
//   1. Sub interval — drives the LeagueNextSubCard cadence.
//
//   2. Players on field — grow adds empty slots the coach fills
//      via the existing tap-to-swap UI; shrink opens a "who comes
//      off?" picker (ShrinkPickerModal) which writes a
//      `roster_shrink` event and updates games.on_field_size.
//
//   3. Enforce unbroken periods — per-game override for the
//      Junior League §6 rule. Writes games.enforce_unbroken_periods.
//      Greyed out with a help chip for age groups that don't apply
//      the rule (U6/U7 no-score games where §6 isn't relevant).

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SFButton } from "@/components/sf";
import { Guernsey } from "@/components/sf";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Toggle } from "@/components/ui/Toggle";
import {
  setLeagueSubInterval,
  setLeagueOnFieldSizeMidGame,
  setLeagueEnforceUnbrokenPeriods,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/league-actions";
import type { LiveAuth, Player } from "@/lib/types";

interface LeagueGameSettingsButtonProps {
  auth: LiveAuth;
  gameId: string;
  /** Current sub interval in seconds (from games.sub_interval_seconds). */
  subIntervalSeconds: number;
  /** Current persisted on-field size. */
  currentOnFieldSize: number;
  /** Age-group inclusive bounds. */
  minOnFieldSize: number;
  maxOnFieldSize: number;
  /** Currently on-field players (forwards + backs) — for the shrink picker. */
  onFieldPlayers: Player[];
  /** Whether §6 unbroken-period enforcement is currently on. */
  enforceUnbrokenPeriods: boolean;
  /** Current period — needed for the roster_shrink event metadata. */
  currentQuarter: number;
  /** Live elapsed ms — written into the roster_shrink event. */
  elapsedMs: number;
}

export function LeagueGameSettingsButton({
  auth,
  gameId,
  subIntervalSeconds,
  currentOnFieldSize,
  minOnFieldSize,
  maxOnFieldSize,
  onFieldPlayers,
  enforceUnbrokenPeriods,
  currentQuarter,
  elapsedMs,
}: LeagueGameSettingsButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Same visual as AFL's LiveGameSettingsButton — SFButton ghost
          so both sports' admin rows look identical. */}
      <SFButton
        size="md"
        variant="ghost"
        onClick={() => setOpen(true)}
        className="w-full sm:w-auto"
      >
        Game settings
      </SFButton>

      {open && (
        <LeagueGameSettingsModal
          auth={auth}
          gameId={gameId}
          subIntervalSeconds={subIntervalSeconds}
          currentOnFieldSize={currentOnFieldSize}
          minOnFieldSize={minOnFieldSize}
          maxOnFieldSize={maxOnFieldSize}
          onFieldPlayers={onFieldPlayers}
          enforceUnbrokenPeriods={enforceUnbrokenPeriods}
          currentQuarter={currentQuarter}
          elapsedMs={elapsedMs}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ─── Modal ────────────────────────────────────────────────────

interface LeagueGameSettingsModalProps extends LeagueGameSettingsButtonProps {
  onClose: () => void;
}

const MIN_SUB_SECONDS = 30;
const MAX_SUB_SECONDS = 600;

function LeagueGameSettingsModal({
  auth,
  gameId,
  subIntervalSeconds,
  currentOnFieldSize,
  minOnFieldSize,
  maxOnFieldSize,
  onFieldPlayers,
  enforceUnbrokenPeriods,
  currentQuarter,
  elapsedMs,
  onClose,
}: LeagueGameSettingsModalProps) {
  const router = useRouter();
  const [draftSeconds, setDraftSeconds] = useState(subIntervalSeconds);
  const [sizeInput, setSizeInput] = useState<string>(String(currentOnFieldSize));
  const [draftEnforce, setDraftEnforce] = useState(enforceUnbrokenPeriods);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Non-null = shrink picker open; value = how many to remove.
  const [shrinkPickerSize, setShrinkPickerSize] = useState<number | null>(null);

  const minutes = Math.floor(draftSeconds / 60);
  const seconds = draftSeconds % 60;
  const minSec = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  function handleSave() {
    setError(null);
    if (
      !Number.isFinite(draftSeconds)
      || draftSeconds < MIN_SUB_SECONDS
      || draftSeconds > MAX_SUB_SECONDS
    ) {
      setError(
        `Sub interval must be between ${MIN_SUB_SECONDS} and ${MAX_SUB_SECONDS} seconds.`,
      );
      return;
    }
    const newSize = parseInt(sizeInput, 10);
    if (!Number.isFinite(newSize) || newSize < minOnFieldSize || newSize > maxOnFieldSize) {
      setError(
        `On-field size must be between ${minOnFieldSize} and ${maxOnFieldSize}.`,
      );
      return;
    }

    if (newSize < currentOnFieldSize) {
      // Shrink path — save sub-interval first (no event needed),
      // then open the "who comes off?" picker to collect the
      // remove list before writing the roster_shrink event.
      startTransition(async () => {
        try {
          await maybeUpdateSubInterval();
          await maybeUpdateEnforce();
          setShrinkPickerSize(currentOnFieldSize - newSize);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Save failed.");
        }
      });
      return;
    }

    // Grow / no-op + sub interval + enforce toggle — bundle all three.
    startTransition(async () => {
      try {
        await maybeUpdateSubInterval();
        await maybeUpdateEnforce();
        if (newSize !== currentOnFieldSize) {
          const res = await setLeagueOnFieldSizeMidGame(auth, gameId, {
            newSize,
            removePlayerIds: [],
            quarter: currentQuarter,
            elapsedMs,
          });
          if (!res.success) throw new Error(res.error);
        }
        onClose();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed.");
      }
    });
  }

  async function maybeUpdateSubInterval(): Promise<void> {
    if (draftSeconds === subIntervalSeconds) return;
    const res = await setLeagueSubInterval(auth, gameId, draftSeconds);
    if (!res.success) throw new Error(res.error);
  }

  async function maybeUpdateEnforce(): Promise<void> {
    if (draftEnforce === enforceUnbrokenPeriods) return;
    const res = await setLeagueEnforceUnbrokenPeriods(auth, gameId, draftEnforce);
    if (!res.success) throw new Error(res.error);
  }

  if (shrinkPickerSize !== null) {
    return (
      <ShrinkPickerModal
        auth={auth}
        gameId={gameId}
        newSize={parseInt(sizeInput, 10)}
        countToRemove={shrinkPickerSize}
        onFieldPlayers={onFieldPlayers}
        currentQuarter={currentQuarter}
        elapsedMs={elapsedMs}
        onCommitted={() => {
          onClose();
          router.refresh();
        }}
        onCancel={() => setShrinkPickerSize(null)}
      />
    );
  }

  return (
    <Modal>
      <h2 className="text-center text-lg font-bold text-ink">Game settings</h2>
      <p className="mt-1 text-center text-xs text-ink-mute">
        Adjust without restarting the game. Sub-interval changes apply from
        the next sub-due reminder; other changes apply immediately.
      </p>

      <div className="mt-5 space-y-4">
        {/* Sub interval */}
        <div>
          <Label
            htmlFor="league-sub-interval"
            className="!mb-1 block text-xs font-semibold text-ink"
          >
            Sub interval (seconds)
          </Label>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <p className="text-xs text-ink-mute">
                Currently {minSec} (mm:ss). How often the &quot;sub
                due&quot; reminder fires.
              </p>
            </div>
            <div className="w-24">
              <Input
                id="league-sub-interval"
                type="number"
                inputMode="numeric"
                min={MIN_SUB_SECONDS}
                max={MAX_SUB_SECONDS}
                step={15}
                value={draftSeconds}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setDraftSeconds(Number.isFinite(n) ? Math.round(n) : draftSeconds);
                }}
                disabled={pending}
                autoFocus
              />
            </div>
          </div>
        </div>

        {/* Players on field */}
        <div>
          <Label
            htmlFor="league-on-field"
            className="!mb-1 block text-xs font-semibold text-ink"
          >
            Players on field
          </Label>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <p className="text-xs text-ink-mute">
                Currently {currentOnFieldSize}. Range {minOnFieldSize}–
                {maxOnFieldSize}.{" "}
                <strong className="text-ink">Growing</strong> adds empty
                slots — tap bench players to fill them.{" "}
                <strong className="text-ink">Shrinking</strong> asks you
                which players come off.
              </p>
            </div>
            <div className="w-24">
              <Input
                id="league-on-field"
                type="number"
                min={minOnFieldSize}
                max={maxOnFieldSize}
                step={1}
                value={sizeInput}
                onChange={(e) => setSizeInput(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>
        </div>

        {/* Enforce unbroken periods */}
        <div className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-surface-alt px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-ink">
              Enforce unbroken periods
            </p>
            <p className="text-[11px] text-ink-mute">
              §6: each player must play an unbroken quarter/half. Off =
              rule ignored when planning rotations.
            </p>
          </div>
          <Toggle
            checked={draftEnforce}
            onChange={setDraftEnforce}
            disabled={pending}
            label="Enforce unbroken periods"
          />
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

// ─── ShrinkPickerModal ────────────────────────────────────────
// Secondary modal that opens when the coach reduces on-field count.
// Lists on-field players; coach picks the N who come off. On commit,
// fires `setLeagueOnFieldSizeMidGame` with the remove list.
// Mirrors AFL's ShrinkPickerModal shape exactly — same layout, same
// "N / M selected" counter, same confirm + back actions.
interface ShrinkPickerModalProps {
  auth: LiveAuth;
  gameId: string;
  newSize: number;
  countToRemove: number;
  onFieldPlayers: Player[];
  currentQuarter: number;
  elapsedMs: number;
  onCommitted: () => void;
  onCancel: () => void;
}

function ShrinkPickerModal({
  auth,
  gameId,
  newSize,
  countToRemove,
  onFieldPlayers,
  currentQuarter,
  elapsedMs,
  onCommitted,
  onCancel,
}: ShrinkPickerModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Stable order: forwards first, then backs (matches the visual
  // order coaches see on the field). Pre-sorted by the caller.
  const players = useMemo(() => onFieldPlayers, [onFieldPlayers]);

  function togglePick(pid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) {
        next.delete(pid);
      } else if (next.size < countToRemove) {
        next.add(pid);
      }
      return next;
    });
  }

  function handleConfirm() {
    setError(null);
    if (selected.size !== countToRemove) {
      setError(`Pick exactly ${countToRemove} player(s) to come off.`);
      return;
    }
    startTransition(async () => {
      const res = await setLeagueOnFieldSizeMidGame(auth, gameId, {
        newSize,
        removePlayerIds: Array.from(selected),
        quarter: currentQuarter,
        elapsedMs,
      });
      if (!res.success) {
        setError(res.error ?? "Couldn't save.");
        return;
      }
      onCommitted();
    });
  }

  return (
    <Modal>
      <h2 className="text-center text-lg font-bold text-ink">
        Pick {countToRemove} to come off
      </h2>
      <p className="mt-1 text-center text-xs text-ink-mute">
        Reducing on-field count to {newSize}. Selected players move to the
        bench — they keep their played time.
      </p>

      <ul className="mt-4 max-h-[50vh] divide-y divide-hairline overflow-y-auto rounded-md border border-hairline">
        {players.map((p) => {
          const picked = selected.has(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => togglePick(p.id)}
                disabled={pending}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                  picked
                    ? "bg-brand-50 ring-2 ring-inset ring-brand-500"
                    : "hover:bg-surface-alt"
                }`}
              >
                <Guernsey
                  num={p.jersey_number != null ? String(p.jersey_number) : ""}
                  size={28}
                />
                <span className="flex-1 font-medium text-ink">{p.full_name}</span>
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    picked
                      ? "border-brand-500 bg-brand-500 text-warm"
                      : "border-hairline bg-surface text-ink-mute"
                  }`}
                  aria-hidden
                >
                  {picked ? "✓" : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-center text-xs tabular-nums text-ink-mute">
        {selected.size} / {countToRemove} selected
      </p>

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
          onClick={handleConfirm}
          loading={pending}
          disabled={selected.size !== countToRemove}
        >
          Move to bench
        </SFButton>
        <SFButton
          className="w-full"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={pending}
        >
          Back
        </SFButton>
      </div>
    </Modal>
  );
}
