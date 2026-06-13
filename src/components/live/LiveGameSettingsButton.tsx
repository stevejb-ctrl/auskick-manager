"use client";

// ─── LiveGameSettingsButton ──────────────────────────────────
// Mid-game settings affordance for AFL — sits in the
// `LiveAdminUtilityRow` alongside "+ Add late arrival" and
// "Restart game". Tapping opens a modal with knobs the coach
// might want to tweak after kickoff without restarting the
// game or waiting for the next break.
//
// Steve 2026-05-20: now carries two knobs:
//   1. Sub interval — drives the AFL SubDueModal reminder cadence.
//   2. Players on field — coach can grow or shrink the on-field
//      count mid-quarter. Growing just bumps games.on_field_size
//      (empty slots appear via displayZoneCaps, the coach drags
//      from bench using the existing UI). Shrinking opens a
//      follow-up "who comes off?" picker because we need explicit
//      player IDs to write the roster_shrink event that closes
//      their stints and moves them to bench.
//
// Netball doesn't have a sub interval (its sub model is
// break-only by default, opt-in mid-Q via `Switch player`), so
// this button isn't rendered on the netball live shell.
// `LiveAdminUtilityRow` accepts the button as a slot — AFL
// passes it, netball passes nothing.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SFButton } from "@/components/sf";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Guernsey } from "@/components/sf";
import {
  setOnFieldSizeMidGame,
  setSubInterval,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import type { LiveAuth, Player } from "@/lib/types";

interface LiveGameSettingsButtonProps {
  auth: LiveAuth;
  gameId: string;
  /** Current sub interval in SECONDS (games.sub_interval_seconds). */
  subIntervalSeconds: number;
  /** Current persisted on-field size. */
  currentOnFieldSize: number;
  /** Inclusive bounds from the team's age-group config. */
  minOnFieldSize: number;
  maxOnFieldSize: number;
  /** Players keyed by id — used by the "who comes off?" picker to
   *  resolve names and jersey numbers for the on-field tiles. */
  playersById: Map<string, Player>;
}

export function LiveGameSettingsButton({
  auth,
  gameId,
  subIntervalSeconds,
  currentOnFieldSize,
  minOnFieldSize,
  maxOnFieldSize,
  playersById,
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
          currentOnFieldSize={currentOnFieldSize}
          minOnFieldSize={minOnFieldSize}
          maxOnFieldSize={maxOnFieldSize}
          playersById={playersById}
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
  currentOnFieldSize,
  minOnFieldSize,
  maxOnFieldSize,
  playersById,
  onClose,
}: LiveGameSettingsModalProps) {
  const router = useRouter();
  const initialMinutes = subIntervalSeconds / 60;
  const [minutesInput, setMinutesInput] = useState<string>(String(initialMinutes));
  const [sizeInput, setSizeInput] = useState<string>(String(currentOnFieldSize));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // When shrinking, the modal handoff: collect picks via this state
  // before committing. `null` = sub-modal closed; an array = open
  // with that many slots to fill.
  const [shrinkPickerSize, setShrinkPickerSize] = useState<number | null>(null);

  function commitSubIntervalIfChanged(): Promise<void> {
    const minutes = parseFloat(minutesInput);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 10) {
      throw new Error("Sub interval must be between 1 and 10 minutes.");
    }
    const seconds = Math.round(minutes * 60);
    if (seconds === subIntervalSeconds) return Promise.resolve();
    return setSubInterval(auth, gameId, seconds).then((res) => {
      if (!res.success) throw new Error(res.error);
    });
  }

  function commitGrowOrNoOp(newSize: number): Promise<void> {
    // newSize >= currentOnFieldSize. No remove list needed; the
    // server action handles the no-op + grow paths.
    return setOnFieldSizeMidGame(auth, gameId, {
      newSize,
      removePlayerIds: [],
      quarter: 1, // unused for grow / no-op
      elapsedMs: 0,
    }).then((res) => {
      if (!res.success) throw new Error(res.error);
    });
  }

  function handleSave() {
    setError(null);
    const newSize = parseInt(sizeInput, 10);
    if (!Number.isFinite(newSize) || newSize < minOnFieldSize || newSize > maxOnFieldSize) {
      setError(
        `On-field size must be between ${minOnFieldSize} and ${maxOnFieldSize}.`,
      );
      return;
    }

    if (newSize < currentOnFieldSize) {
      // Shrink path — sub-interval save runs first (no event needed),
      // then we open the picker which writes the roster_shrink event
      // and updates on_field_size in one server action call.
      startTransition(async () => {
        try {
          await commitSubIntervalIfChanged();
          setShrinkPickerSize(currentOnFieldSize - newSize);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Save failed.");
        }
      });
      return;
    }

    // Grow / no-op size + sub-interval — bundle in one transition.
    startTransition(async () => {
      try {
        await commitSubIntervalIfChanged();
        await commitGrowOrNoOp(newSize);
        onClose();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed.");
      }
    });
  }

  if (shrinkPickerSize !== null) {
    return (
      <ShrinkPickerModal
        auth={auth}
        gameId={gameId}
        newSize={parseInt(sizeInput, 10)}
        countToRemove={shrinkPickerSize}
        playersById={playersById}
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
        Adjust without restarting the game. Sub changes apply from the next
        sub-due reminder; players-on-field changes apply immediately.
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

        <div>
          <Label
            htmlFor="live-on-field"
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
                slots — drag bench players in from the field.{" "}
                <strong className="text-ink">Shrinking</strong> asks you
                which players come off.
              </p>
            </div>
            <div className="w-24">
              <Input
                id="live-on-field"
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

// ─── ShrinkPickerModal ───────────────────────────────────────
// Secondary modal that opens when the coach reduces on-field count.
// Lists all currently-on-field players; coach picks the N who come
// off (N = currentSize - newSize). On commit, writes a single
// roster_shrink event via setOnFieldSizeMidGame + applies the same
// lineup mutation to the in-memory store so the UI updates without
// waiting for the router refresh.
interface ShrinkPickerModalProps {
  auth: LiveAuth;
  gameId: string;
  newSize: number;
  countToRemove: number;
  playersById: Map<string, Player>;
  onCommitted: () => void;
  onCancel: () => void;
}

function ShrinkPickerModal({
  auth,
  gameId,
  newSize,
  countToRemove,
  playersById,
  onCommitted,
  onCancel,
}: ShrinkPickerModalProps) {
  const lineup = useLiveGame((s) => s.lineup);
  const currentQuarter = useLiveGame((s) => s.currentQuarter);
  const applyRosterShrink = useLiveGame((s) => s.applyRosterShrink);

  // Flatten lineup into an on-field list. Order: fwd → mid → back
  // (the same top-to-bottom order coaches see on the Field).
  const onFieldPlayers = useMemo(() => {
    const ids = [
      ...lineup.fwd,
      ...lineup.hfwd,
      ...lineup.mid,
      ...lineup.hback,
      ...lineup.back,
    ];
    return ids
      .map((id) => playersById.get(id))
      .filter((p): p is Player => Boolean(p));
  }, [lineup, playersById]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
    const removeIds = Array.from(selected);
    startTransition(async () => {
      // Compute elapsed_ms from the live store. We read it imperatively
      // (not via subscribe) so the value reflects the moment the coach
      // taps Confirm, not the moment they opened the picker.
      const state = useLiveGame.getState();
      const elapsedMs =
        state.accumulatedMs +
        (state.clockStartedAt ? Date.now() - state.clockStartedAt : 0);

      const res = await setOnFieldSizeMidGame(auth, gameId, {
        newSize,
        removePlayerIds: removeIds,
        quarter: currentQuarter,
        elapsedMs,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      // Mirror the change to the in-memory store so the field
      // updates immediately, without waiting for the router
      // refresh round-trip.
      applyRosterShrink(removeIds);
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
        bench — they keep their played minutes.
      </p>

      <ul className="mt-4 max-h-[50vh] divide-y divide-hairline overflow-y-auto rounded-md border border-hairline">
        {onFieldPlayers.map((p) => {
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
                <Guernsey num={p.jersey_number ?? ""} size={28} />
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
