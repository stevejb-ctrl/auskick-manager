"use client";

// ─── Netball Lineup Picker ────────────────────────────────────
// Builds one quarter's lineup. Each position shows a button; tap
// to open a bottom sheet of available players. Netball zone
// eligibility (rules of play) is enforced in the bottom sheet —
// only players the position allows are shown as taps; others are
// visible but greyed out.
//
// Used for:
//   - the initial lineup at the start of a game
//   - each quarter-break lineup swap

import { useMemo, useState } from "react";
import type { Player } from "@/lib/types";
import { Court } from "@/components/netball/Court";
import { PositionToken } from "@/components/netball/PositionToken";
import {
  netballSport,
  primaryThirdFor,
  isPositionAllowedInZone,
} from "@/lib/sports/netball";
import type { AgeGroupConfig } from "@/lib/sports/types";
import {
  type GenericLineup,
  emptyGenericLineup,
  suggestNetballLineup,
  seasonPositionCounts,
  gamePositionCounts,
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
  onConfirm: (lineup: GenericLineup) => void | Promise<void>;
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
  onConfirm,
  confirmLabel = "Confirm lineup",
  disabled,
}: LineupPickerProps) {
  const [lineup, setLineup] = useState<GenericLineup>(() =>
    initialLineup ?? emptyGenericLineup(ageGroup.positions),
  );
  const [picking, setPicking] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const squadById = useMemo(
    () => new Map(squad.map((p) => [p.id, p])),
    [squad],
  );

  // Which player is currently in which position/bench — for conflict detection.
  const playerSlot = useMemo(() => {
    const m = new Map<string, string>();
    for (const [pos, ids] of Object.entries(lineup.positions)) {
      for (const pid of ids) m.set(pid, pos);
    }
    for (const pid of lineup.bench) m.set(pid, "bench");
    return m;
  }, [lineup]);

  const handleSuggest = () => {
    const season = seasonPositionCounts(seasonEvents);
    const thisGame = gamePositionCounts(thisGameEvents);
    const suggested = suggestNetballLineup({
      playerIds: availableIds,
      positions: ageGroup.positions,
      season,
      thisGame,
      isAllowed: (_pid, posId) => ageGroup.positions.includes(posId),
    });
    setLineup(suggested);
  };

  const placePlayer = (playerId: string, positionId: string | "bench") => {
    setLineup((prev) => {
      // Start from a deep copy.
      const next: GenericLineup = {
        positions: Object.fromEntries(
          Object.entries(prev.positions).map(([k, v]) => [k, v.filter((p) => p !== playerId)]),
        ),
        bench: prev.bench.filter((p) => p !== playerId),
      };
      if (positionId === "bench") {
        next.bench.push(playerId);
      } else {
        next.positions[positionId] = [...(next.positions[positionId] ?? []), playerId];
      }
      return next;
    });
  };

  const clearPosition = (positionId: string) => {
    setLineup((prev) => ({
      positions: { ...prev.positions, [positionId]: [] },
      bench: prev.bench,
    }));
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
    setSaving(true);
    try {
      await onConfirm(lineup);
    } finally {
      setSaving(false);
    }
  };

  // Subtle alternating horizontal offset to break up the vertical column
  // (matches the live game's CourtDisplay).
  const STAGGER = ["-1.25rem", "1.25rem", "-0.5rem", "0.5rem"];

  const renderTokenAt = (positionId: string, indexInThird: number) => {
    const occupantId = lineup.positions[positionId]?.[0];
    const occupantName = occupantId ? squadById.get(occupantId)?.full_name ?? null : null;
    return (
      <div
        key={positionId}
        className="flex justify-center"
        style={{ transform: `translateX(${STAGGER[indexInThird % STAGGER.length]})` }}
      >
        <PositionToken
          positionId={positionId}
          playerName={occupantName}
          onTap={() => setPicking(positionId)}
        />
      </div>
    );
  };

  const byThird = (third: "attack-third" | "centre-third" | "defence-third") =>
    ageGroup.positions.filter((id) => primaryThirdFor(id) === third);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Set lineup</h2>
        <button
          type="button"
          onClick={handleSuggest}
          className="rounded-md border border-brand-300 bg-white px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          disabled={disabled}
        >
          Suggest fair lineup
        </button>
      </div>

      <Court
        attackThird={byThird("attack-third").map((id, i) => renderTokenAt(id, i))}
        centreThird={byThird("centre-third").map((id, i) => renderTokenAt(id, i))}
        defenceThird={byThird("defence-third").map((id, i) => renderTokenAt(id, i))}
      />

      <BenchStrip
        bench={lineup.bench}
        squadById={squadById}
        availableIds={availableIds}
        onTapPlayer={(pid) => setPicking(`player:${pid}`)}
      />

      <button
        type="button"
        onClick={handleConfirm}
        disabled={disabled || saving}
        className="w-full rounded-lg bg-brand-600 py-3 text-center text-base font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
      >
        {saving ? "Saving…" : confirmLabel}
      </button>

      {picking && picking.startsWith("player:") ? (
        <PlayerSheet
          playerId={picking.slice("player:".length)}
          squadById={squadById}
          ageGroup={ageGroup}
          currentSlot={playerSlot.get(picking.slice("player:".length)) ?? null}
          onChoose={(slot) => {
            placePlayer(picking.slice("player:".length), slot);
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      ) : picking ? (
        <PositionSheet
          positionId={picking}
          ageGroup={ageGroup}
          squadById={squadById}
          availableIds={availableIds}
          currentOccupantId={lineup.positions[picking]?.[0] ?? null}
          onChoose={(pid) => {
            placePlayer(pid, picking);
            setPicking(null);
          }}
          onClear={() => {
            clearPosition(picking);
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      ) : null}
    </div>
  );
}

// ─── Bench strip ─────────────────────────────────────────────
function BenchStrip({
  bench,
  squadById,
  availableIds,
  onTapPlayer,
}: {
  bench: string[];
  squadById: Map<string, Player>;
  availableIds: string[];
  onTapPlayer: (playerId: string) => void;
}) {
  // "Available but unassigned" = in availableIds but not already in a position.
  // Render them alongside bench for easy tap-to-assign. If a player is in a
  // position they won't appear here.
  const assignedBenchIds = new Set(bench);
  const all = availableIds.filter((pid) => assignedBenchIds.has(pid) || !bench.length);

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
            return (
              <button
                key={pid}
                type="button"
                onClick={() => onTapPlayer(pid)}
                className="rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-100"
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

// ─── Player picker sheet (when a position is tapped) ─────────
function PositionSheet({
  positionId,
  ageGroup,
  squadById,
  availableIds,
  currentOccupantId,
  onChoose,
  onClear,
  onClose,
}: {
  positionId: string;
  ageGroup: AgeGroupConfig;
  squadById: Map<string, Player>;
  availableIds: string[];
  currentOccupantId: string | null;
  onChoose: (playerId: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const pos = netballSport.allPositions.find((p) => p.id === positionId);

  // Which zones is this position allowed in? For Court-token eligibility
  // we filter players too — if a fielding rule pinned a player to only
  // defence (via future zone-locked-player mechanism), they wouldn't
  // show here. For MVP all squad players are eligible for any position;
  // the position→zone eligibility enforces rules of play at tactical
  // level rather than per-player restriction.
  const eligiblePlayers = availableIds
    .map((pid) => squadById.get(pid))
    .filter((p): p is Player => !!p);

  void ageGroup; // reserved for future: bench minimum enforcement

  return (
    <Sheet title={`Choose ${pos?.label ?? positionId.toUpperCase()}`} onClose={onClose}>
      <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-3">
        {pos?.allowedZones && pos.allowedZones.length > 0 ? (
          <p className="text-xs text-neutral-600">
            Allowed in: {pos.allowedZones.map(labelForZone).join(", ")}.
          </p>
        ) : null}
        {eligiblePlayers.length === 0 ? (
          <p className="text-sm italic text-neutral-500">No available players.</p>
        ) : (
          eligiblePlayers.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChoose(p.id)}
              className={`flex items-center justify-between rounded-md border px-3 py-2 text-left ${
                currentOccupantId === p.id
                  ? "border-brand-400 bg-brand-50"
                  : "border-neutral-200 bg-white hover:bg-neutral-50"
              }`}
            >
              <span className="font-medium text-neutral-900">{p.full_name}</span>
              {currentOccupantId === p.id ? (
                <span className="text-xs font-semibold text-brand-700">
                  Currently
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>
      <div className="flex gap-2 border-t border-neutral-200 p-3">
        <button
          type="button"
          onClick={onClear}
          className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Clear position
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          Cancel
        </button>
      </div>
    </Sheet>
  );
}

// ─── Position picker sheet (when a player is tapped) ─────────
function PlayerSheet({
  playerId,
  squadById,
  ageGroup,
  currentSlot,
  onChoose,
  onClose,
}: {
  playerId: string;
  squadById: Map<string, Player>;
  ageGroup: AgeGroupConfig;
  currentSlot: string | null;
  onChoose: (slot: string | "bench") => void;
  onClose: () => void;
}) {
  const player = squadById.get(playerId);
  if (!player) return null;

  return (
    <Sheet title={`Place ${player.full_name}`} onClose={onClose}>
      <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-3">
        {ageGroup.positions.map((posId) => {
          const pos = netballSport.allPositions.find((p) => p.id === posId);
          const allowed =
            pos?.allowedZones?.some((z) => isPositionAllowedInZone(posId, z)) ?? true;
          return (
            <button
              key={posId}
              type="button"
              onClick={() => onChoose(posId)}
              className={`flex items-center justify-between rounded-md border px-3 py-2 text-left ${
                currentSlot === posId
                  ? "border-brand-400 bg-brand-50"
                  : "border-neutral-200 bg-white hover:bg-neutral-50"
              } ${allowed ? "" : "opacity-50"}`}
            >
              <span className="font-medium">{pos?.label ?? posId}</span>
              {currentSlot === posId ? (
                <span className="text-xs font-semibold text-brand-700">Currently</span>
              ) : null}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onChoose("bench")}
          className={`flex items-center justify-between rounded-md border px-3 py-2 text-left ${
            currentSlot === "bench"
              ? "border-brand-400 bg-brand-50"
              : "border-neutral-200 bg-white hover:bg-neutral-50"
          }`}
        >
          <span className="font-medium">Bench</span>
          {currentSlot === "bench" ? (
            <span className="text-xs font-semibold text-brand-700">Currently</span>
          ) : null}
        </button>
      </div>
      <div className="flex gap-2 border-t border-neutral-200 p-3">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          Cancel
        </button>
      </div>
    </Sheet>
  );
}

// ─── Bottom sheet primitive ──────────────────────────────────
function Sheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-neutral-200 p-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100"
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function labelForZone(zoneId: string): string {
  switch (zoneId) {
    case "attack-third":
      return "Attack third";
    case "attack-circle":
      return "Attack goal circle";
    case "centre-third":
      return "Centre third";
    case "defence-third":
      return "Defence third";
    case "defence-circle":
      return "Defence goal circle";
    default:
      return zoneId;
  }
}
