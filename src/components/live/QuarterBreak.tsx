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
  back: "bg-zone-b",
  hback: "bg-zone-b/70",
  mid: "bg-zone-c",
  hfwd: "bg-zone-f/70",
  fwd: "bg-zone-f",
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
  const lastStintMs = useLiveGame((s) => s.lastStintMs);
  const lastStintZone = useLiveGame((s) => s.lastStintZone);
  const lockedIds = useLiveGame((s) => s.lockedIds);
  const zoneLockedPlayers = useLiveGame((s) => s.zoneLockedPlayers);

  const zones = useMemo(() => positionsFor(positionModel), [positionModel]);
  // Display FWD → CENTRE → BACK (top → bottom) to match the coach's field mental model.
  const slots = useMemo<Slot[]>(() => [[...zones].reverse(), "bench"].flat() as Slot[], [zones]);
  const slotLabel = (s: Slot) => {
    if (s === "bench") return "Bench";
    if (s === "mid") return "Centre";
    return ZONE_SHORT_LABELS[s];
  };

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

  // Players who came on shortly before the quarter break — keep them in their
  // zone rather than moving them again immediately.
  const RECENT_ARRIVAL_MS = 3 * 60 * 1000; // 3 minutes
  const pinnedPositions = useMemo<Record<string, Zone>>(() => {
    const pins: Record<string, Zone> = {};
    // Recent arrivals: short last stint
    for (const [pid, dur] of Object.entries(lastStintMs)) {
      const z = lastStintZone[pid];
      if (z && dur < RECENT_ARRIVAL_MS) pins[pid] = z;
    }
    // Field-locked: always stay in their last zone (never go to bench)
    for (const pid of lockedIds) {
      const z = lastStintZone[pid];
      if (z) pins[pid] = z;
    }
    // Zone-locked: prefer their locked zone at quarter breaks
    for (const [pid, z] of Object.entries(zoneLockedPlayers)) {
      pins[pid] = z;
    }
    return pins;
  }, [lastStintMs, lastStintZone, lockedIds, zoneLockedPlayers]);

  const suggestedLineup = useMemo(() => {
    if (availableForLineup.length === 0) return lineup;
    return suggestStartingLineup(
      availableForLineup,
      combinedZoneMins,
      currentQuarter * 1000 + availableForLineup.length,
      zoneCaps,
      currentGameZoneMins,
      pinnedPositions
    );
  }, [availableForLineup, combinedZoneMins, currentQuarter, lineup, zoneCaps, currentGameZoneMins, pinnedPositions]);

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
      <div className="rounded-md border border-hairline bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
              Quarter break
            </p>
            <p className="mt-0.5 text-lg font-bold text-ink">
              Set zones for Q{nextQuarter}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums text-brand-600">
              {score}
            </p>
            <p className="text-[11px] uppercase tracking-micro text-ink-mute">Fairness</p>
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
          <span className="text-xs text-ink-dim">
            {useReshuffle
              ? "Tap to keep last quarter's lineup instead."
              : "Tap to auto-rebalance zones for Q" + nextQuarter + "."}
          </span>
        </div>
      </div>

      {availableForLineup.length > 0 && (
        <p className="px-1 text-xs text-ink-dim">
          Tap any two players to swap them — even across zones or to the bench.
        </p>
      )}

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
                {draft[slot].length}
                {slot !== "bench" && ` / ${zoneCaps[slot]}`}
              </span>
            </div>
            {draft[slot].length === 0 ? (
              <p className="px-1 py-2 text-xs text-ink-mute">Empty</p>
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
                        className={`flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors duration-fast ease-out-quart ${
                          isSelected
                            ? "border-brand-500 bg-brand-50 ring-2 ring-brand-400"
                            : "border-hairline hover:bg-surface-alt"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 tabular-nums">
                            {p.jersey_number}
                          </span>
                          <span className="flex flex-col items-start">
                            <span className="font-medium text-ink">
                              {p.full_name}
                            </span>
                            {moved && prevSlot && (
                              <span className="text-[10px] font-semibold uppercase tracking-micro text-brand-600">
                                {slotLabel(prevSlot)} → {slotLabel(slot)}
                              </span>
                            )}
                            {!moved && prevSlot && (
                              <span className="text-[10px] uppercase tracking-micro text-ink-mute">
                                stays
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="flex h-3 flex-1 max-w-[60px] overflow-hidden rounded-full bg-surface-alt" aria-hidden>
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
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
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
