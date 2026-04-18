"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { recordLineupSet, startQuarter as startQuarterAction } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import {
  fairnessScore,
  suggestStartingLineup,
  type PlayerZoneMinutes,
} from "@/lib/fairness";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import type { Lineup, Player, Zone } from "@/lib/types";

interface QuarterBreakProps {
  auth: import("@/lib/types").LiveAuth;
  gameId: string;
  players: Player[];
  season: PlayerZoneMinutes;
  onStarted: () => void;
}

type Slot = Zone | "bench";
const SLOTS: Slot[] = ["back", "mid", "fwd", "bench"];
const LABELS: Record<Slot, string> = {
  back: "Back",
  mid: "Mid",
  fwd: "Fwd",
  bench: "Bench",
};

export function QuarterBreak({
  auth,
  gameId,
  players,
  season,
  onStarted,
}: QuarterBreakProps) {
  const lineup = useLiveGame((s) => s.lineup);
  const currentQuarter = useLiveGame((s) => s.currentQuarter);
  const setLineup = useLiveGame((s) => s.setLineup);
  const basePlayedZoneMs = useLiveGame((s) => s.basePlayedZoneMs);

  // Current game only (minutes). Used for the per-player bars so the
  // quarter-break view matches the bars shown during live play.
  const currentGameZoneMins = useMemo(() => {
    const out: PlayerZoneMinutes = {};
    for (const [pid, zm] of Object.entries(basePlayedZoneMs)) {
      out[pid] = {
        back: zm.back / 60000,
        mid: zm.mid / 60000,
        fwd: zm.fwd / 60000,
      };
    }
    return out;
  }, [basePlayedZoneMs]);

  // Season + current game (minutes). Used for fairness score and suggestions
  // so rebalancing considers prior games too.
  const combinedZoneMins = useMemo(() => {
    const out: PlayerZoneMinutes = {};
    for (const [pid, zm] of Object.entries(season)) {
      out[pid] = { back: zm.back, mid: zm.mid, fwd: zm.fwd };
    }
    for (const [pid, zm] of Object.entries(currentGameZoneMins)) {
      out[pid] ??= { back: 0, mid: 0, fwd: 0 };
      out[pid].back += zm.back;
      out[pid].mid += zm.mid;
      out[pid].fwd += zm.fwd;
    }
    return out;
  }, [season, currentGameZoneMins]);

  const [draft, setDraft] = useState<Lineup>(lineup);
  const [selected, setSelected] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const autoAppliedRef = useRef(false);

  const playersById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players]
  );
  const availableForLineup = useMemo(() => {
    const all = [
      ...lineup.back,
      ...lineup.mid,
      ...lineup.fwd,
      ...lineup.bench,
    ];
    return all
      .map((id) => playersById.get(id))
      .filter((p): p is Player => !!p);
  }, [lineup, playersById]);

  const score = fairnessScore(combinedZoneMins);
  const nextQuarter = currentQuarter + 1;

  function slotOf(pid: string, l: Lineup): Slot | null {
    for (const s of SLOTS) if (l[s].includes(pid)) return s;
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

  function handleApplySuggestion() {
    const suggested = suggestStartingLineup(
      availableForLineup,
      combinedZoneMins,
      Date.now()
    );
    setDraft(suggested);
    setSelected(null);
  }

  useEffect(() => {
    if (autoAppliedRef.current) return;
    if (availableForLineup.length === 0) return;
    autoAppliedRef.current = true;
    const suggested = suggestStartingLineup(
      availableForLineup,
      combinedZoneMins,
      currentQuarter * 1000 + availableForLineup.length
    );
    setDraft(suggested);
  }, [availableForLineup, combinedZoneMins, currentQuarter]);

  function lineupsEqual(a: Lineup, b: Lineup): boolean {
    const keys: (keyof Lineup)[] = ["back", "mid", "fwd", "bench"];
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
    startTransition(async () => {
      if (!lineupsEqual(lineup, draft)) {
        const r = await recordLineupSet(auth, gameId, draft);
        if (!r.success) {
          setError(r.error);
          return;
        }
        setLineup(draft);
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
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="secondary" onClick={handleApplySuggestion}>
            Apply suggested reshuffle
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {SLOTS.map((slot) => (
          <div
            key={slot}
            className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">
                {LABELS[slot]}
              </h3>
              <span className="text-xs text-gray-400">
                {draft[slot].length}
                {slot !== "bench" && " / 4"}
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
                  const zm = currentGameZoneMins[pid] ?? { back: 0, mid: 0, fwd: 0 };
                  const total = zm.back + zm.mid + zm.fwd || 1;
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
                                {LABELS[prevSlot]} → {LABELS[slot]}
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
                          <span style={{ width: `${(zm.back / total) * 100}%` }} className="bg-blue-400" />
                          <span style={{ width: `${(zm.mid / total) * 100}%` }} className="bg-yellow-400" />
                          <span style={{ width: `${(zm.fwd / total) * 100}%` }} className="bg-red-400" />
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
