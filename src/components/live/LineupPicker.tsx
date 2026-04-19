"use client";

import { useMemo, useState, useTransition } from "react";
import { startGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import type { Lineup, Player, Zone } from "@/lib/types";
import type { PlayerZoneMinutes, ZoneCaps } from "@/lib/fairness";

// Default full-game length for sub-interval calculation (4 × 10min quarters).
const GAME_MINUTES = 40;

// Rotations each player gets to sit on the bench over the whole game.
// Bigger benches → more rotations per player (shorter stints each).
function restsPerPlayer(benchSize: number): number {
  return Math.max(1, Math.ceil(benchSize / 2));
}

// Target sub interval (minutes), rounded to the nearest 0.5 min, clamped [1, 10].
function suggestedSubMinutes(benchSize: number, totalPlayers: number): number {
  if (benchSize <= 0 || totalPlayers <= 0) return 3;
  const R = restsPerPlayer(benchSize);
  const raw = (benchSize * GAME_MINUTES) / (totalPlayers * R);
  const rounded = Math.round(raw * 2) / 2;
  return Math.min(10, Math.max(1, rounded));
}

interface LineupPickerProps {
  auth: import("@/lib/types").LiveAuth;
  gameId: string;
  players: Player[];
  suggestedLineup: Lineup;
  season: PlayerZoneMinutes;
  zoneCaps: ZoneCaps;
  onFieldSize: number;
}

type Slot = Zone | "bench";
const SLOTS: Slot[] = ["back", "mid", "fwd", "bench"];
const ZONE_LABELS: Record<Slot, string> = {
  back: "Back",
  mid: "Mid",
  fwd: "Fwd",
  bench: "Bench",
};

export function LineupPicker({
  auth,
  gameId,
  players,
  suggestedLineup,
  season,
  zoneCaps,
  onFieldSize,
}: LineupPickerProps) {
  const [lineup, setLineup] = useState<Lineup>(suggestedLineup);
  const [selected, setSelected] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [subMinInput, setSubMinInput] = useState<string | null>(null);

  const playerById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players]
  );

  function slotOf(pid: string): Slot | null {
    for (const s of SLOTS) if (lineup[s].includes(pid)) return s;
    return null;
  }

  function handleTap(pid: string) {
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
    const sa = slotOf(a);
    const sb = slotOf(b);
    if (!sa || !sb) return;

    setLineup((prev) => {
      const next: Lineup = {
        back: [...prev.back],
        mid: [...prev.mid],
        fwd: [...prev.fwd],
        bench: [...prev.bench],
      };
      if (sa === sb) {
        next[sa] = next[sa].map((p) => (p === a ? b : p === b ? a : p));
      } else {
        next[sa] = next[sa].map((p) => (p === a ? b : p));
        next[sb] = next[sb].map((p) => (p === b ? a : p));
      }
      return next;
    });
    setSelected(null);
  }

  const onFieldCount = lineup.back.length + lineup.mid.length + lineup.fwd.length;
  const benchCount = lineup.bench.length;
  const totalCount = onFieldCount + benchCount;
  const suggestedMin = suggestedSubMinutes(benchCount, totalCount);
  // Effective on-field count = min(configured size, available players).
  const effectiveOnFieldTarget = Math.min(onFieldSize, totalCount);
  const effectiveSubMin = subMinInput === null
    ? suggestedMin
    : Math.min(10, Math.max(1, parseFloat(subMinInput) || suggestedMin));

  function handleStart() {
    setServerError(null);
    const subSeconds = Math.round(effectiveSubMin * 60);
    startTransition(async () => {
      const result = await startGame(auth, gameId, lineup, subSeconds);
      if (result && !result.success) {
        setServerError(result.error);
        return;
      }
      if (auth.kind === "token") {
        window.location.assign(`/run/${auth.token}`);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <p className="font-semibold">Auto-suggested starting lineup</p>
        <p className="mt-0.5 text-xs">
          Tap any two players to swap them between zones or bench.
          {onFieldSize < 12 && ` Short-handed game — ${onFieldSize} on field.`}
          {onFieldCount < effectiveOnFieldTarget &&
            ` Only ${onFieldCount} on field — add late arrivals after kick-off.`}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {SLOTS.map((slot) => (
          <div
            key={slot}
            className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">
                {ZONE_LABELS[slot]}
              </h3>
              <span className="text-xs text-gray-400">
                {lineup[slot].length}
                {slot !== "bench" && ` / ${zoneCaps[slot]}`}
              </span>
            </div>
            {lineup[slot].length === 0 ? (
              <p className="px-1 py-2 text-xs text-gray-400">Empty</p>
            ) : (
              <ul className="space-y-1.5">
                {lineup[slot].map((pid) => {
                  const p = playerById.get(pid);
                  if (!p) return null;
                  const isSelected = selected === pid;
                  return (
                    <li key={pid}>
                      <button
                        type="button"
                        onClick={() => handleTap(pid)}
                        className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors ${
                          isSelected
                            ? "border-brand-500 bg-brand-50 ring-2 ring-brand-400"
                            : "border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 tabular-nums">
                          {p.jersey_number}
                        </span>
                        <span className="font-medium text-gray-800">
                          {p.full_name}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label htmlFor="sub-minutes" className="mb-1">
              Sub interval
            </Label>
            <p className="text-xs text-gray-500">
              Suggested {suggestedMin} min — {benchCount} on bench,{" "}
              {totalCount} total, ≈{restsPerPlayer(benchCount)} rest
              {restsPerPlayer(benchCount) === 1 ? "" : "s"} each over{" "}
              {GAME_MINUTES} min.
            </p>
          </div>
          <div className="w-24">
            <Input
              id="sub-minutes"
              type="number"
              min={1}
              max={10}
              step={0.5}
              value={subMinInput ?? String(suggestedMin)}
              onChange={(e) => setSubMinInput(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>
      </div>

      {serverError && (
        <p className="text-sm text-red-600" role="alert">
          {serverError}
        </p>
      )}

      <div className="flex justify-end">
        <Button
          onClick={handleStart}
          loading={isPending}
          disabled={onFieldCount === 0}
        >
          Start game
        </Button>
      </div>
    </div>
  );
}
