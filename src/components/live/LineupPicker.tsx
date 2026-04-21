"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { startGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import type { Lineup, Player, PositionModel, Zone } from "@/lib/types";
import {
  suggestStartingLineup,
  zoneCapsFor,
  type PlayerZoneMinutes,
} from "@/lib/fairness";
import { positionsFor, ZONE_SHORT_LABELS } from "@/lib/ageGroups";

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
  season: PlayerZoneMinutes;
  defaultOnFieldSize: number;
  minOnFieldSize: number;
  maxOnFieldSize: number;
  positionModel: PositionModel;
  /** Optional href for the Back button shown above the picker. */
  backHref?: string;
}

type Slot = Zone | "bench";

export function LineupPicker({
  auth,
  gameId,
  players,
  season,
  defaultOnFieldSize,
  minOnFieldSize,
  maxOnFieldSize,
  positionModel,
  backHref,
}: LineupPickerProps) {
  const [onFieldSize, setOnFieldSize] = useState(defaultOnFieldSize);
  const zoneCaps = useMemo(
    () => zoneCapsFor(onFieldSize, positionModel),
    [onFieldSize, positionModel]
  );
  const [lineup, setLineup] = useState<Lineup>(() =>
    suggestStartingLineup(players, season, 0, zoneCaps)
  );

  function handleSizeChange(next: number) {
    setOnFieldSize(next);
    setLineup(
      suggestStartingLineup(players, season, 0, zoneCapsFor(next, positionModel))
    );
  }

  const [selected, setSelected] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [subMinInput, setSubMinInput] = useState<string | null>(null);

  const sizeOptions = useMemo(() => {
    const out: { value: number; label: string }[] = [];
    for (let s = maxOnFieldSize; s >= minOnFieldSize; s--) {
      const caps = zoneCapsFor(s, positionModel);
      const zs = positionsFor(positionModel);
      const splits = zs
        .map((z) => `${caps[z]} ${ZONE_SHORT_LABELS[z]}`)
        .join(" / ");
      const tag =
        s === defaultOnFieldSize
          ? "recommended"
          : s < defaultOnFieldSize
          ? "short-handed"
          : "above recommended";
      out.push({ value: s, label: `${s} — ${tag} (${splits})` });
    }
    return out;
  }, [defaultOnFieldSize, minOnFieldSize, maxOnFieldSize, positionModel]);

  const playerById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players]
  );

  const zones = useMemo(() => positionsFor(positionModel), [positionModel]);
  // Display order mirrors the in-game field: forwards at the top, backs at the
  // bottom. The underlying `zones` order stays unchanged (fairness + data rely
  // on it) — only the UI grid order is reversed.
  const displayZones = useMemo(() => [...zones].reverse(), [zones]);
  const slots = useMemo<Slot[]>(() => [...displayZones, "bench"], [displayZones]);
  const slotLabel = (s: Slot) => (s === "bench" ? "Bench" : ZONE_SHORT_LABELS[s]);

  function slotOf(pid: string): Slot | null {
    for (const s of slots) if (lineup[s].includes(pid)) return s;
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
        hback: [...prev.hback],
        mid: [...prev.mid],
        hfwd: [...prev.hfwd],
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

  const onFieldCount = zones.reduce((n, z) => n + lineup[z].length, 0);
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
      const result = await startGame(auth, gameId, lineup, subSeconds, onFieldSize);
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
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:text-ink"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back to availability
        </Link>
      )}
      <div className="rounded-md border border-warn/20 bg-warn-soft px-4 py-3 text-sm text-warn">
        <p className="font-semibold">Auto-suggested starting lineup</p>
        <p className="mt-0.5 text-xs">
          Tap any two players to swap them between zones or bench.
          {` ${onFieldSize} on field.`}
          {onFieldCount < effectiveOnFieldTarget &&
            ` Only ${onFieldCount} on field — add late arrivals after kick-off.`}
        </p>
      </div>

      <div className="rounded-md border border-hairline bg-surface p-3 shadow-card">
        <Label htmlFor="on-field-size" className="mb-1">
          Players on field
        </Label>
        <select
          id="on-field-size"
          value={onFieldSize}
          onChange={(e) => handleSizeChange(parseInt(e.target.value, 10))}
          disabled={isPending}
          className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink shadow-card focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:bg-surface-alt disabled:text-ink-mute"
        >
          {sizeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-mute">
          Drop this when the opposition is short and both teams agree to play fewer. Changing it re-suggests the starting lineup.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {slots.map((slot) => (
          <div
            key={slot}
            className="rounded-md border border-hairline bg-surface p-3 shadow-card"
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-dim">
                {slotLabel(slot)}
              </h3>
              <span className="text-xs tabular-nums text-ink-mute">
                {lineup[slot].length}
                {slot !== "bench" && ` / ${zoneCaps[slot]}`}
              </span>
            </div>
            {lineup[slot].length === 0 ? (
              <p className="px-1 py-2 text-xs text-ink-mute">Empty</p>
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
                        className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors duration-fast ease-out-quart ${
                          isSelected
                            ? "border-brand-500 bg-brand-50 ring-2 ring-brand-400"
                            : "border-hairline hover:bg-surface-alt"
                        }`}
                      >
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 tabular-nums">
                          {p.jersey_number}
                        </span>
                        <span className="font-medium text-ink">
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

      <div className="rounded-md border border-hairline bg-surface p-3 shadow-card">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label htmlFor="sub-minutes" className="mb-1">
              Sub interval
            </Label>
            <p className="text-xs text-ink-mute">
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
        <p className="text-sm text-danger" role="alert">
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
