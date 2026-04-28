"use client";

// ─── Netball Lineup Picker ────────────────────────────────────
// Pre-game initial lineup builder. Opens with the suggester's
// output already in place (auto-suggested), then the coach taps
// any two players to swap them between positions or bench. Same
// two-tap-to-swap pattern as the AFL pre-game LineupPicker and
// netball's NetballQuarterBreak so the design language stays
// consistent across surfaces.
//
// (NetballQuarterBreak is the equivalent for in-game breaks —
// this component is only used for the very first lineup.)

import { useMemo, useState } from "react";
import type { Player } from "@/lib/types";
import { Court } from "@/components/netball/Court";
import { PositionToken } from "@/components/netball/PositionToken";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { netballSport, primaryThirdFor } from "@/lib/sports/netball";
import type { AgeGroupConfig } from "@/lib/sports/types";
import {
  type GenericLineup,
  emptyGenericLineup,
  suggestNetballLineup,
  seasonPositionCounts,
  gamePositionCounts,
  lastQuarterThirds,
  lastQuarterTeammatesInThird,
} from "@/lib/sports/netball/fairness";
import type { GameEvent } from "@/lib/types";

interface LineupPickerProps {
  ageGroup: AgeGroupConfig;
  squad: Player[];
  availableIds: string[];
  initialLineup?: GenericLineup | null;
  /** Events from this game so far (for diversity bonus this-game vs season). */
  thisGameEvents?: GameEvent[];
  /** Season events across all this team's games (for the "owed" heuristic). */
  seasonEvents?: GameEvent[];
  /**
   * Default quarter length (in seconds) for the per-game override
   * input. Resolved by the parent from the team's effective quarter
   * length. When provided alongside `onChangeQuarterLengthSeconds`
   * the picker renders a small "Quarter length" card mirroring AFL's
   * pre-game sub-interval card — coach can override for this match.
   * When `defaultQuarterSeconds` is omitted (e.g. Q-break flow which
   * doesn't change quarter length mid-game), the card is hidden.
   */
  defaultQuarterSeconds?: number;
  /**
   * Confirmation handler. When the picker has a quarter-length card,
   * the second arg carries the chosen override in seconds (or null
   * if the coach left it at the default). Q-break callers can ignore
   * the second arg.
   */
  onConfirm: (
    lineup: GenericLineup,
    quarterLengthSeconds?: number | null,
  ) => void | Promise<void>;
  confirmLabel?: string;
  disabled?: boolean;
}

export function NetballLineupPicker({
  ageGroup,
  squad,
  availableIds,
  initialLineup,
  thisGameEvents = [],
  seasonEvents = [],
  defaultQuarterSeconds,
  onConfirm,
  confirmLabel = "Confirm lineup",
  disabled,
}: LineupPickerProps) {
  // Initial lineup state. When the parent passes one (e.g. a Q-break
  // seed lineup, or a previously-saved draft), we use that. Otherwise
  // — i.e. the pre-game flow where the picker would have opened
  // empty — we pre-fill with the suggester's output so the coach
  // sees a sensible starting lineup right away (same behaviour as
  // Siren Footy's pre-game flow). They can still drag it around or
  // tap "Suggest fair lineup" to reshuffle if they don't like it.
  const [lineup, setLineup] = useState<GenericLineup>(() => {
    if (initialLineup) return initialLineup;
    if (availableIds.length === 0) {
      return emptyGenericLineup(ageGroup.positions);
    }
    const season = seasonPositionCounts(seasonEvents);
    const thisGame = gamePositionCounts(thisGameEvents);
    const thirdLookup = primaryThirdFor as (
      positionId: string,
    ) => "attack-third" | "centre-third" | "defence-third" | null;
    const lastThirds = lastQuarterThirds(thisGameEvents, thirdLookup);
    const prevTeammates = lastQuarterTeammatesInThird(
      thisGameEvents,
      thirdLookup,
    );
    return suggestNetballLineup({
      playerIds: availableIds,
      positions: ageGroup.positions,
      season,
      thisGame,
      isAllowed: (_pid, posId) => ageGroup.positions.includes(posId),
      seed: 0,
      thirdOf: thirdLookup,
      lastQuarterThird: lastThirds,
      previousTeammates: prevTeammates,
    });
  });
  // Two-tap-to-swap selection: tap a player → highlighted; tap another
  // player (or an empty position / bench) → swap. Mirrors the
  // NetballQuarterBreak interaction so the pre-game and Q-break
  // pickers behave identically, and matches the AFL pattern.
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Per-game quarter-length override input. Stored as a free-text
  // string (rather than a number) so the user can clear the field
  // without it snapping back to 0 — mirrors AFL's sub-minute input.
  // Empty/unchanged → null override → game falls back to team default.
  const defaultQuarterMin =
    defaultQuarterSeconds != null ? Math.round(defaultQuarterSeconds / 60) : null;
  const [quarterMinInput, setQuarterMinInput] = useState<string>(
    defaultQuarterMin != null ? String(defaultQuarterMin) : "",
  );

  const squadById = useMemo(
    () => new Map(squad.map((p) => [p.id, p])),
    [squad],
  );

  // Which player is currently in which position/bench. Used to find
  // where the selected player lives so a swap can put the displaced
  // player back into the original slot.
  const playerSlot = useMemo(() => {
    const m = new Map<string, string>();
    for (const [pos, ids] of Object.entries(lineup.positions)) {
      for (const pid of ids) m.set(pid, pos);
    }
    for (const pid of lineup.bench) m.set(pid, "bench");
    return m;
  }, [lineup]);

  // Tap on a player — court or bench. With nothing selected, marks
  // them as selected. With another player already selected, swaps the
  // two. Tapping the same player again deselects.
  const handleTapPlayer = (pid: string) => {
    if (!selected) {
      setSelected(pid);
      return;
    }
    if (selected === pid) {
      setSelected(null);
      return;
    }
    const a = selected;
    const b = pid;
    setLineup((prev) => {
      const aSlot = playerSlot.get(a);
      const bSlot = playerSlot.get(b);
      if (!aSlot || !bSlot) return prev;
      const next: GenericLineup = {
        positions: Object.fromEntries(
          Object.entries(prev.positions).map(([k, v]) => [k, [...v]]),
        ),
        bench: [...prev.bench],
      };
      const replaceInPos = (posId: string, x: string, y: string) => {
        next.positions[posId] = (next.positions[posId] ?? []).map((p) =>
          p === x ? y : p,
        );
      };
      const replaceInBench = (x: string, y: string) => {
        next.bench = next.bench.map((p) => (p === x ? y : p));
      };
      const swap = (slot: string, x: string, y: string) => {
        if (slot === "bench") replaceInBench(x, y);
        else replaceInPos(slot, x, y);
      };
      swap(aSlot, a, b);
      swap(bSlot, b, a);
      return next;
    });
    setSelected(null);
  };

  // Tap on an empty position (no player there). With nothing selected
  // this is a no-op. With a player selected, that player moves into
  // the empty slot and whoever they used to be with goes there
  // (effectively: selected leaves their old slot, fills this one).
  const handleTapEmpty = (positionId: string) => {
    if (!selected) return;
    const fromSlot = playerSlot.get(selected);
    if (!fromSlot) {
      setSelected(null);
      return;
    }
    setLineup((prev) => {
      const next: GenericLineup = {
        positions: Object.fromEntries(
          Object.entries(prev.positions).map(([k, v]) => [
            k,
            v.filter((p) => p !== selected),
          ]),
        ),
        bench: prev.bench.filter((p) => p !== selected),
      };
      next.positions[positionId] = [...(next.positions[positionId] ?? []), selected];
      return next;
    });
    setSelected(null);
  };

  const handleConfirm = async () => {
    if (disabled || saving) return;
    const validation = netballSport.validateLineup?.(lineup, ageGroup);
    if (validation && !validation.ok) {
      // Surface the first error in the UI briefly. In a richer version
      // we'd render inline, but a single alert is plenty to un-block
      // first cut of the UI.
      alert(validation.issues[0]?.message ?? "Lineup is not valid.");
      return;
    }
    // Resolve the quarter-length override. Only emit a non-null value
    // when the picker was rendered with `defaultQuarterSeconds` AND
    // the coach actually changed the input — that way the parent can
    // tell "leave the team default in place" from "lock this game to
    // N minutes".
    let quarterOverrideSeconds: number | null = null;
    if (defaultQuarterSeconds != null) {
      const parsed = Number(quarterMinInput);
      if (
        Number.isFinite(parsed) &&
        Number.isInteger(parsed) &&
        parsed >= 1 &&
        parsed <= 30
      ) {
        const seconds = parsed * 60;
        if (seconds !== defaultQuarterSeconds) {
          quarterOverrideSeconds = seconds;
        }
      } else {
        alert("Quarter length must be a whole number between 1 and 30 minutes.");
        return;
      }
    }
    setSaving(true);
    try {
      await onConfirm(lineup, quarterOverrideSeconds);
    } finally {
      setSaving(false);
    }
  };

  // Position-keyed horizontal alignment — alternating zigzag down the
  // court so adjacent positions sit on OPPOSITE sides (GA opposite WA,
  // WD opposite GD), matching real-court geography. Same layout as the
  // live court so the lineup the coach builds matches what they'll see
  // during play.
  const ALIGN: Record<string, string> = {
    gs: "justify-start pl-4",
    ga: "justify-end pr-4",
    wa: "justify-start pl-4",
    c: "justify-center",
    wd: "justify-end pr-4",
    gd: "justify-start pl-4",
    gk: "justify-end pr-4",
  };

  const renderTokenAt = (positionId: string) => {
    const occupantId = lineup.positions[positionId]?.[0];
    const occupantName = occupantId ? squadById.get(occupantId)?.full_name ?? null : null;
    return (
      <div
        key={positionId}
        className={`relative z-10 flex w-full ${ALIGN[positionId] ?? "justify-center"}`}
      >
        <PositionToken
          positionId={positionId}
          playerName={occupantName}
          selected={!!occupantId && selected === occupantId}
          onTap={() => {
            if (occupantId) handleTapPlayer(occupantId);
            else handleTapEmpty(positionId);
          }}
        />
      </div>
    );
  };

  const byThird = (third: "attack-third" | "centre-third" | "defence-third") =>
    ageGroup.positions.filter((id) => primaryThirdFor(id) === third);

  return (
    <div className="flex flex-col gap-4">
      {/* Auto-suggested callout — same wording as AFL's pre-game
          LineupPicker (src/components/live/LineupPicker.tsx:207),
          with "zones" swapped for "positions" since netball uses
          named positions (GS / GA / WA / etc.) rather than spatial
          zones. */}
      <div className="rounded-md border border-warn/20 bg-warn-soft px-4 py-3 text-sm text-warn">
        <p className="font-semibold">Auto-suggested starting lineup</p>
        <p className="mt-0.5 text-xs">
          Tap any two players to swap them between positions or bench.
        </p>
      </div>

      <Court
        attackThird={byThird("attack-third").map(renderTokenAt)}
        centreThird={byThird("centre-third").map(renderTokenAt)}
        defenceThird={byThird("defence-third").map(renderTokenAt)}
      />

      <BenchStrip
        bench={lineup.bench}
        onCourtIds={Array.from(playerSlot.entries())
          .filter(([, slot]) => slot !== "bench")
          .map(([pid]) => pid)}
        squadById={squadById}
        availableIds={availableIds}
        selectedId={selected}
        onTapPlayer={handleTapPlayer}
      />

      {/* Per-game quarter-length override. Reuses the AFL pre-game
          sub-interval card layout (src/components/live/LineupPicker.tsx
          lines 289-315) — same affordance, different field. Netball
          has no rolling subs so this slot is repurposed for "how long
          is each quarter for this match". Defaults to the team
          setting; the coach can dial it for finals / weather / etc. */}
      {defaultQuarterSeconds != null && (
        <div className="rounded-md border border-hairline bg-surface p-3 shadow-card">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label htmlFor="quarter-minutes" className="mb-1">
                Quarter length
              </Label>
              <p className="text-xs text-ink-mute">
                Defaults to your team setting ({defaultQuarterMin} min).
                Override here for this game only — useful for finals,
                double-headers, or weather-shortened matches.
              </p>
            </div>
            <div className="w-24">
              <Input
                id="quarter-minutes"
                type="number"
                min={1}
                max={30}
                step={1}
                value={quarterMinInput}
                onChange={(e) => setQuarterMinInput(e.target.value)}
                disabled={disabled || saving}
              />
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleConfirm}
        disabled={disabled || saving}
        className="w-full rounded-lg bg-brand-600 py-3 text-center text-base font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
      >
        {saving ? "Saving…" : confirmLabel}
      </button>
    </div>
  );
}

// ─── Bench strip ─────────────────────────────────────────────
function BenchStrip({
  bench,
  onCourtIds,
  squadById,
  availableIds,
  selectedId,
  onTapPlayer,
}: {
  bench: string[];
  onCourtIds: string[];
  squadById: Map<string, Player>;
  availableIds: string[];
  /** Currently-selected player id (highlighted to confirm the tap). */
  selectedId: string | null;
  onTapPlayer: (playerId: string) => void;
}) {
  // "Bench + unassigned" = available players who aren't currently in a
  // position. That's the explicit bench list plus anyone in availableIds
  // who hasn't been placed anywhere yet. Showing both lets the coach
  // tap-to-assign without remembering who's left.
  const onCourtSet = new Set(onCourtIds);
  const benchSet = new Set(bench);
  const unassigned = availableIds.filter(
    (pid) => !onCourtSet.has(pid) && !benchSet.has(pid),
  );
  const all = [...bench, ...unassigned];

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-700">Bench + unassigned</h3>
        <span className="text-xs text-neutral-500">{bench.length} benched</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {all.length === 0 ? (
          <span className="text-xs italic text-neutral-500">
            Everyone available is placed.
          </span>
        ) : (
          all.map((pid) => {
            const player = squadById.get(pid);
            if (!player) return null;
            const isSelected = selectedId === pid;
            return (
              <button
                key={pid}
                type="button"
                onClick={() => onTapPlayer(pid)}
                className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                  isSelected
                    ? "border-brand-500 bg-brand-50 text-brand-800 ring-2 ring-brand-400"
                    : "border-neutral-300 bg-neutral-50 text-neutral-800 hover:bg-neutral-100"
                }`}
              >
                {player.full_name}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
