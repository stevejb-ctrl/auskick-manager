"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { recordLineupSet, startQuarter as startQuarterAction } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import {
  ALL_ZONES,
  fairnessScore,
  suggestStartingLineup,
  type PlayerZoneMinutes,
  type ZoneCaps,
  type ZoneMinutes,
} from "@/lib/fairness";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import {
  emptyLineup,
  type Lineup,
  type Player,
  type PositionModel,
  type Zone,
} from "@/lib/types";
import { positionsFor, ZONE_SHORT_LABELS } from "@/lib/ageGroups";

interface QuarterBreakProps {
  auth: import("@/lib/types").LiveAuth;
  gameId: string;
  players: Player[];
  season: PlayerZoneMinutes;
  zoneCaps: ZoneCaps;
  positionModel: PositionModel;
  onStarted: () => void;
}

type Slot = Zone | "bench";

const ZONE_BAR_COLOR: Record<Zone, string> = {
  back: "bg-blue-400",
  hback: "bg-sky-400",
  mid: "bg-yellow-400",
  hfwd: "bg-orange-400",
  fwd: "bg-red-400",
};

function emptyZM(): ZoneMinutes {
  return { back: 0, hback: 0, mid: 0, hfwd: 0, fwd: 0 };
}

export function QuarterBreak({
  auth,
  gameId,
  players,
  season,
  zoneCaps,
  positionModel,
  onStarted,
}: QuarterBreakProps) {
  const lineup = useLiveGame((s) => s.lineup);
  const currentQuarter = useLiveGame((s) => s.currentQuarter);
  const setLineup = useLiveGame((s) => s.setLineup);
  const basePlayedZoneMs = useLiveGame((s) => s.basePlayedZoneMs);

  const zones = useMemo(() => positionsFor(positionModel), [positionModel]);
  const slots = useMemo<Slot[]>(() => [...zones, "bench"], [zones]);
  const slotLabel = (s: Slot) => (s === "bench" ? "Bench" : ZONE_SHORT_LABELS[s]);

  const currentGameZoneMins = useMemo(() => {
    const out: PlayerZoneMinutes = {};
    for (const [pid, zm] of Object.entries(basePlayedZoneMs)) {
      const next = emptyZM();
      for (const z of ALL_ZONES) next[z] = zm[z] / 60000;
      out[pid] = next;
    }
    return out;
  }, [basePlayedZoneMs]);

  const combinedZoneMins = useMemo(() => {
    const out: PlayerZoneMinutes = {};
    for (const [pid, zm] of Object.entries(season)) {
      const next = emptyZM();
      for (const z of ALL_ZONES) next[z] = zm[z];
      out[pid] = next;
    }
    for (const [pid, zm] of Object.entries(currentGameZoneMins)) {
      out[pid] ??= emptyZM();
      for (const z of ALL_ZONES) out[pid][z] += zm[z];
    }
    return out;
  }, [season, currentGameZoneMins]);

  const [draft, setDraft] = useState<Lineup>(lineup);
  const [selected, setSelected] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [useReshuffle, setUseReshuffle] = useState(true);

  const playersById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players]
  );
  const availableForLineup = useMemo(() => {
    const all: string[] = [...lineup.bench];
    for (const z of ALL_ZONES) all.push(...lineup[z]);
    return all
      .map((id) => playersById.get(id))
      .filter((p): p is Player => !!p);
  }, [lineup, playersById]);

  const score = fairnessScore(combinedZoneMins);
  const nextQuarter = currentQuarter + 1;

  function slotOf(pid: string, l: Lineup): Slot | null {
    for (const s of slots) if (l[s].includes(pid)) return s;
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
    setDraft((prev) => {
      const sa = slotOf(a, prev);
      const sb = slotOf(b, prev);
      if (!sa || !sb) return prev;
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

  const suggestedLineup = useMemo(() => {
    if (availableForLineup.length === 0) return lineup;
    return suggestStartingLineup(
      availableForLineup,
      combinedZoneMins,
      currentQuarter * 1000 + availableForLineup.length,
      zoneCaps
    );
  }, [availableForLineup, combinedZoneMins, currentQuarter, lineup, zoneCaps]);

  useEffect(() => {
    if (availableForLineup.length === 0) return;
    setDraft(useReshuffle ? suggestedLineup : lineup);
    setSelected(null);
  }, [useReshuffle, suggestedLineup, lineup, availableForLineup.length]);

  function handleToggleReshuffle() {
    setUseReshuffle((v) => !v);
  }

  function lineupsEqual(a: Lineup, b: Lineup): boolean {
    const keys: (keyof Lineup)[] = ["back", "hback", "mid", "hfwd", "fwd", "bench"];
    for (const k of keys) {
      if (a[k].length !== b[k].length) return false;
      const sa = [...a[k]].sort();
      const sb = [...b[k]].sort();
      for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
    }
    return true;
  }

  function handleStart() {
    setError(null);
    // Normalise draft shape before sending (defensive — always full-zones).
    const full: Lineup = { ...emptyLineup(), ...draft };
    startTransition(async () => {
      if (!lineupsEqual(lineup, full)) {
        const r = await recordLineupSet(auth, gameId, full);
        if (!r.success) {
          setError(r.error);
          return;
        }
        setLineup(full);
      }
      const result = await startQuarterAction(auth, gameId, nextQuarter);
      if (!result.success) {
        setError(result.error);
        return;
      }
      onStarted();
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Quarter break
            </p>
            <p className="mt-0.5 text-lg font-bold text-gray-900">
              Set zones for Q{nextQuarter}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums text-brand-600">
              {score}
            </p>
            <p className="text-xs text-gray-400">Fairness</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            variant={useReshuffle ? "primary" : "secondary"}
            onClick={handleToggleReshuffle}
          >
            {useReshuffle ? "✓ Using suggested reshuffle" : "Apply suggested reshuffle"}
          </Button>
          <span className="text-xs text-gray-500">
            {useReshuffle
              ? "Tap to keep last quarter's lineup instead."
              : "Tap to auto-rebalance zones for Q" + nextQuarter + "."}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {slots.map((slot) => (
          <div
            key={slot}
            className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">
                {slotLabel(slot)}
              </h3>
              <span className="text-xs text-gray-400">
                {draft[slot].length}
                {slot !== "bench" && ` / ${zoneCaps[slot]}`}
              </span>
            </div>
            {draft[slot].length === 0 ? (
              <p className="px-1 py-2 text-xs text-gray-400">Empty</p>
            ) : (
              <ul className="space-y-1.5">
                {draft[slot].map((pid) => {
                  const p = playersById.get(pid);
                  if (!p) return null;
                  const isSelected = selected === pid;
                  const zm = currentGameZoneMins[pid] ?? emptyZM();
                  const total = zones.reduce((a, z) => a + zm[z], 0) || 1;
                  const prevSlot = slotOf(pid, lineup);
                  const moved = prevSlot && prevSlot !== slot;
                  return (
                    <li key={pid}>
                      <button
                        type="button"
                        onClick={() => handleTap(pid)}
                        className={`flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors ${
                          isSelected
                            ? "border-brand-500 bg-brand-50 ring-2 ring-brand-400"
                            : "border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 tabular-nums">
                            {p.jersey_number}
                          </span>
                          <span className="flex flex-col items-start">
                            <span className="font-medium text-gray-800">
                              {p.full_name}
                            </span>
                            {moved && prevSlot && (
                              <span className="text-[10px] font-medium uppercase tracking-wide text-brand-600">
                                {slotLabel(prevSlot)} → {slotLabel(slot)}
                              </span>
                            )}
                            {!moved && prevSlot && (
                              <span className="text-[10px] uppercase tracking-wide text-gray-400">
                                stays
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="flex h-3 flex-1 max-w-[60px] overflow-hidden rounded-full bg-gray-100" aria-hidden>
                          {zones.map((z) => (
                            <span
                              key={z}
                              style={{ width: `${(zm[z] / total) * 100}%` }}
                              className={ZONE_BAR_COLOR[z]}
                            />
                          ))}
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

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={handleStart} loading={isPending}>
          Start Q{nextQuarter}
        </Button>
      </div>
    </div>
  );
}
