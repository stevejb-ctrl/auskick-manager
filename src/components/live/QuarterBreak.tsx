"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Guernsey } from "@/components/sf";
import { recordLineupSet, startQuarter as startQuarterAction } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import {
  ALL_ZONES,
  fairnessScore,
  suggestStartingLineup,
  zoneTeammatesFromLineup,
  type PlayerZoneMinutes,
  type SeasonAvailability,
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

// Players who came on shortly before the quarter break — keep them in their
// zone rather than moving them again immediately.
const RECENT_ARRIVAL_MS = 3 * 60 * 1000; // 3 minutes

interface QuarterBreakProps {
  auth: import("@/lib/types").LiveAuth;
  gameId: string;
  players: Player[];
  season: PlayerZoneMinutes;
  /**
   * Per-player played-vs-available quarter counts across PRIOR
   * games. Drives the suggester's tiebreak so an under-utilised
   * regular climbs the queue ahead of a teammate with similar
   * in-game minutes today.
   */
  seasonAvailability: Record<string, SeasonAvailability>;
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
  seasonAvailability,
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
  const injuredIds = useLiveGame((s) => s.injuredIds);
  const loanedIds = useLiveGame((s) => s.loanedIds);
  const sidelinedSet = useMemo(
    () => new Set<string>([...injuredIds, ...loanedIds]),
    [injuredIds, loanedIds]
  );
  const injuredSet = useMemo(() => new Set(injuredIds), [injuredIds]);
  const loanedSet = useMemo(() => new Set(loanedIds), [loanedIds]);

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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Q-break lineup-build mode:
  //   "suggested" — auto-rebalance via the fairness suggester (default).
  //   "keep"      — carry last quarter's lineup through unchanged.
  //   "manual"    — wipe to a blank field, all players on bench, coach
  //                 builds the next quarter from scratch.
  // All three are fully editable via tap-tap below; the toggle just
  // sets the starting state when the coach lands on the Q-break.
  const [lineupMode, setLineupMode] = useState<"suggested" | "keep" | "manual">("suggested");

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
  // Injured / loaned players stay parked on the bench — never fed to the
  // reshuffler, never rotated onto the field at quarter breaks.
  const healthyForLineup = useMemo(
    () => availableForLineup.filter((p) => !sidelinedSet.has(p.id)),
    [availableForLineup, sidelinedSet]
  );
  const sidelinedIdsInLineup = useMemo(
    () => availableForLineup.filter((p) => sidelinedSet.has(p.id)).map((p) => p.id),
    [availableForLineup, sidelinedSet]
  );

  const score = fairnessScore(combinedZoneMins);
  const nextQuarter = currentQuarter + 1;

  function slotOf(pid: string, l: Lineup): Slot | null {
    for (const s of slots) if (l[s].includes(pid)) return s;
    return null;
  }

  function handleTap(pid: string) {
    // Injured / loaned players are parked on the bench; tapping them is
    // a no-op so a coach can't manually drag them onto the field.
    if (sidelinedSet.has(pid)) return;
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

  // Q-just-ended teammate cohorts, keyed by player id. Built from
  // the END-of-quarter lineup (already in the live store) so it
  // captures exactly who shared a zone (or sat the bench) with whom
  // when the hooter went. Drives the suggester's partnership penalty
  // — see fairness.ts PARTNERSHIP_PENALTY.
  const previousZoneTeammates = useMemo(
    () => zoneTeammatesFromLineup(lineup),
    [lineup]
  );

  const suggestedLineup = useMemo(() => {
    if (availableForLineup.length === 0) return lineup;
    // `lastStintZone` is the zone each player ended the just-finished
    // quarter in (set by endCurrentQuarter when stints flush). The
    // suggester uses it to penalise re-using the same zone two
    // quarters running. The partnership penalty (driven by
    // `previousZoneTeammates`) handles the don't-clump-together rule
    // — replacing the older cluster penalty that compared source
    // zones in aggregate.
    const suggested = suggestStartingLineup(
      healthyForLineup,
      combinedZoneMins,
      currentQuarter * 1000 + healthyForLineup.length,
      zoneCaps,
      currentGameZoneMins,
      pinnedPositions,
      lastStintZone,
      previousZoneTeammates,
      seasonAvailability
    );
    // Put any injured / loaned players back on the bench so they're still
    // visible to the coach but cannot be sent on.
    return {
      ...suggested,
      bench: [...suggested.bench, ...sidelinedIdsInLineup],
    };
  }, [
    availableForLineup.length,
    healthyForLineup,
    sidelinedIdsInLineup,
    combinedZoneMins,
    currentQuarter,
    lineup,
    zoneCaps,
    currentGameZoneMins,
    pinnedPositions,
    lastStintZone,
    previousZoneTeammates,
    seasonAvailability,
  ]);

  // Manual-mode draft: wipe positions, park every healthy player on
  // the bench (sidelined players stay on bench too — they're appended
  // separately below). Coach builds from this blank slate via tap-tap.
  const manualLineup = useMemo<Lineup>(() => {
    return {
      back: [],
      hback: [],
      mid: [],
      hfwd: [],
      fwd: [],
      bench: healthyForLineup.map((p) => p.id),
    };
  }, [healthyForLineup]);

  useEffect(() => {
    if (availableForLineup.length === 0) return;
    const next =
      lineupMode === "suggested"
        ? suggestedLineup
        : lineupMode === "manual"
          ? manualLineup
          : lineup;
    setDraft(next);
    setSelected(null);
  }, [lineupMode, suggestedLineup, manualLineup, lineup, availableForLineup.length]);

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
      // Server-rendered events list is now stale; refresh so the page
      // picks up the new quarter_start event and re-renders into LIVE.
      // Mirrors Plan 05-04's netball fix.
      router.refresh();
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
            <div className="flex items-center justify-end gap-1">
              <p className="text-[11px] uppercase tracking-micro text-ink-mute">
                Fairness
              </p>
              <InfoTooltip label="About the fairness index" placement="bottom-right">
                <p className="font-semibold text-ink">Fairness index</p>
                <p className="mt-1">
                  Tracks how evenly zone minutes are shared across the squad.
                  100 = perfectly even; lower numbers mean some kids have had
                  noticeably more (or less) time in certain positions.
                </p>
                <p className="mt-2">
                  Aim for a high score{" "}
                  <strong className="text-ink">by the end of the season</strong>
                  , not every game. Individual games often sit lower — that&apos;s
                  normal. Rotations even out as the year goes on.
                </p>
              </InfoTooltip>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={lineupMode === "suggested" ? "primary" : "secondary"}
            onClick={() => setLineupMode("suggested")}
          >
            {lineupMode === "suggested" ? "✓ Suggested" : "Suggested"}
          </Button>
          <Button
            size="sm"
            variant={lineupMode === "keep" ? "primary" : "secondary"}
            onClick={() => setLineupMode("keep")}
          >
            {lineupMode === "keep" ? "✓ Keep last quarter" : "Keep last quarter"}
          </Button>
          <Button
            size="sm"
            variant={lineupMode === "manual" ? "primary" : "secondary"}
            onClick={() => setLineupMode("manual")}
          >
            {lineupMode === "manual" ? "✓ Set manually" : "Set manually"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-ink-dim">
          {lineupMode === "suggested"
            ? `Auto-rebalanced for Q${nextQuarter} — least-played zones get priority.`
            : lineupMode === "keep"
              ? `Carries last quarter's lineup straight into Q${nextQuarter} — no rotation.`
              : `Blank field for Q${nextQuarter}. Tap a position, then a bench player to fill it.`}
        </p>
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
                  const isInjured = injuredSet.has(pid);
                  const isLoaned = loanedSet.has(pid);
                  const isSidelined = isInjured || isLoaned;
                  const zm = currentGameZoneMins[pid] ?? emptyZM();
                  const total = zones.reduce((a, z) => a + zm[z], 0) || 1;
                  const prevSlot = slotOf(pid, lineup);
                  const moved = prevSlot && prevSlot !== slot;
                  return (
                    <li key={pid}>
                      <button
                        type="button"
                        onClick={() => handleTap(pid)}
                        disabled={isSidelined}
                        aria-disabled={isSidelined}
                        className={`flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors duration-fast ease-out-quart ${
                          isSelected
                            ? "border-brand-500 bg-brand-50 ring-2 ring-brand-400"
                            : isSidelined
                              ? "cursor-not-allowed border-hairline bg-surface-alt opacity-60"
                              : "border-hairline hover:bg-surface-alt"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <Guernsey num={p.jersey_number ?? ""} size={28} />
                          <span className="flex flex-col items-start">
                            <span className="flex items-center gap-1.5">
                              <span className="font-medium text-ink">
                                {p.full_name}
                              </span>
                              {isInjured && (
                                <span className="rounded-xs bg-danger px-1 font-mono text-[9px] font-bold uppercase leading-none tracking-micro text-white">
                                  INJ
                                </span>
                              )}
                              {isLoaned && !isInjured && (
                                <span className="rounded-xs bg-warn px-1 font-mono text-[9px] font-bold uppercase leading-none tracking-micro text-white">
                                  LENT
                                </span>
                              )}
                            </span>
                            {moved && prevSlot && !isSidelined && (
                              <span className="text-[10px] font-semibold uppercase tracking-micro text-brand-600">
                                {slotLabel(prevSlot)} → {slotLabel(slot)}
                              </span>
                            )}
                            {!moved && prevSlot && !isSidelined && (
                              <span className="text-[10px] uppercase tracking-micro text-ink-mute">
                                stays
                              </span>
                            )}
                            {isSidelined && (
                              <span className="text-[10px] uppercase tracking-micro text-ink-mute">
                                unavailable
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
